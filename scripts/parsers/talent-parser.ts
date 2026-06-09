/**
 * Talent parser. Talents in HbM are formatted as plain-text headers:
 *
 *   Talent Name
 *   Wymagania: req1, req2 …       (optional; single line)
 *   <description paragraphs>
 *   ________________
 *
 * They live in:
 *   - Podręcznik Gry, "Rozdział IV - Talenty"
 *   - Bestiariusz, "Rozdział III - Talenty"  (NPC-only talents)
 *
 * The walker can't help us here — we segment by `________________`
 * separators within the talent chapter and look for a "Wymagania:" line.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedDoc, ParserContext, ParserFn, SourceBookId } from './types';
import { slugify } from './helpers';

const SEPARATOR = /^_{3,}$/;
const REQUIREMENTS_PREFIX = /^(?:\*\*|\*)?Wymagania:(?:\*\*|\*)?\s*(.+)$/i;

interface TalentSource {
  book: SourceBookId;
  file: string;
  /** Inclusive line range (1-based) of the talent chapter. */
  startMarker: RegExp;
  endMarker: RegExp;
  /** Pack id to write into. */
  pack: string;
  /** Optional source-module flag stamped onto each talent. */
  sourceModule?: 'arcanum-sanguinis' | 'abyss-curse' | 'crimson-cult' | null;
}

const TALENT_SOURCES: TalentSource[] = [
  {
    book: 'podrecznik-gry',
    file: 'ObsidianNotes/rules/00. Podręcznik Gry.md',
    startMarker: /^Rozdział IV - Talenty\s*$/,
    endMarker: /^Rozdział V\b/,
    pack: 'talents',
    sourceModule: null,
  },
  {
    book: 'bestiariusz',
    file: 'ObsidianNotes/rules/06. Bestiariusz.md',
    startMarker: /^Rozdział III - Talenty\s*$/,
    endMarker: /^Rozdział IV\b/,
    pack: 'talents-npc',
    sourceModule: null,
  },
  {
    // Arcanum Sanguinis: now lives in ObsidianNotes/rules/04. Arcanum Sanguinis.md.
    // Headings may be prefixed with `## ` or `### `.
    book: 'arcanum-sanguinis',
    file: 'ObsidianNotes/rules/04. Arcanum Sanguinis.md',
    startMarker: /^#{0,4}\s*Rozdział IV - Talenty\s*$/,
    endMarker: /^#{0,4}\s*(Rozdział V\b|Aneks\b)/,
    pack: 'talents-blood',
    sourceModule: 'arcanum-sanguinis',
  },
  {
    // Klątwa Otchłani: now lives in ObsidianNotes/rules/02. Klątwa Otchłani.md.
    book: 'klatwa-otchlani',
    file: 'ObsidianNotes/rules/02. Klątwa Otchłani.md',
    startMarker: /^#{0,4}\s*Rozdział II - Talenty\s*$/,
    endMarker: /^#{0,4}\s*Rozdział III\b/,
    pack: 'talents-eldritch',
    sourceModule: 'abyss-curse',
  },
];

/**
 * Talent chapters are noisy — split into segments by separator lines, then
 * within each segment find consecutive talent blocks. A talent block is:
 *   - first non-empty line = name (short, no trailing punctuation, no colon)
 *   - optional `Wymagania: ...` line
 *   - subsequent lines until next name candidate or end of segment = description
 *
 * Heuristic for name detection: line is short (< 60 chars), no trailing `.`,
 * not a bullet, not a header (`Rozdział`, `Aneks`).
 */
export const parseTalents: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];

  for (const source of TALENT_SOURCES) {
    const path = resolve(ctx.repoRoot, source.file);
    let lines: string[] = [];
    try {
      lines = readFileSync(path, 'utf8').split(/\r?\n/);
    } catch {
      continue;
    }

    const startIdx = lines.findIndex((l) => source.startMarker.test(l.trim()));
    if (startIdx < 0) continue;
    const endIdx = lines.findIndex((l, i) => i > startIdx && source.endMarker.test(l.trim()));
    const slice = lines.slice(startIdx + 1, endIdx > 0 ? endIdx : lines.length);

    const hasMarkdownHeaders = slice.some((l) => l.trim().startsWith('### '));

    // Walk the slice looking for talent blocks.
    let i = 0;
    while (i < slice.length) {
      // Skip blanks and separators.
      while (i < slice.length && (slice[i].trim() === '' || SEPARATOR.test(slice[i].trim()))) i++;
      if (i >= slice.length) break;

      const rawLine = slice[i].trim();
      // Stop heuristic — bail out of obvious chapter changes.
      if (/^Rozdział\b/.test(rawLine) || /^Aneks\b/.test(rawLine) || /^#{1,6}\s+(?:Rozdział|Aneks)\b/i.test(rawLine)) break;

      let isName = false;
      let nameLine = '';
      if (hasMarkdownHeaders) {
        if (rawLine.startsWith('### ')) {
          isName = true;
          nameLine = rawLine.replace(/^###\s+/, '').trim();
        }
      } else {
        nameLine = rawLine.replace(/^#{1,6}\s+/, '').trim();
        if (isPlausibleName(nameLine)) {
          isName = true;
        }
      }

      if (!isName) {
        // Can't read this — skip the line and continue.
        i++;
        continue;
      }

      i++;
      // Optional requirements line.
      let requirements = '';
      if (i < slice.length) {
        const m = slice[i].trim().match(REQUIREMENTS_PREFIX);
        if (m) {
          requirements = m[1].trim();
          i++;
        }
      }

      // Description until next plausible name OR separator OR chapter.
      const descLines: string[] = [];
      while (i < slice.length) {
        const cur = slice[i].trim();
        if (SEPARATOR.test(cur)) {
          i++; // consume separator and end this talent
          break;
        }
        if (/^Rozdział\b/.test(cur) || /^Aneks\b/.test(cur) || /^#{1,6}\s+(?:Rozdział|Aneks)\b/i.test(cur)) break;

        if (hasMarkdownHeaders) {
          if (cur.startsWith('### ')) {
            break;
          }
        } else {
          // If we've already captured at least one description line and the
          // current line looks like a talent header (plausible name; next line
          // is Wymagania, blank, or another short line), treat as next talent.
          const cleanCur = cur.replace(/^#{1,6}\s+/, '').trim();
          if (descLines.length > 0 && cur && isPlausibleName(cleanCur)) {
            const next = i + 1 < slice.length ? slice[i + 1].trim() : '';
            if (REQUIREMENTS_PREFIX.test(next) || next === '' || isProseOrReq(next)) {
              break;
            }
          }
        }
        descLines.push(slice[i]);
        i++;
      }

      let finalName = nameLine;
      if (nameLine === 'Czuły Zmysł') {
        finalName = 'Czuły Zmysł (Zmysł)';
      }
      const baseSlug = slugify(finalName);
      const id = ctx.idOverrides[baseSlug] ?? baseSlug;
      const description = descLines.join('\n').trim();

      // Detect "(Dziedzina)" / "(Bóstwo)" / similar parameterised talents.
      const multiSelect = /\((Dziedzina|Bóstwo|Zmysł|Atrybut|Umiejętność)\)$/i.test(finalName);

      docs.push({
        id,
        name: finalName,
        documentType: 'Item',
        subType: 'talent',
        pack: source.pack,
        source: { book: source.book, chapter: 'Talenty', line: startIdx + 1 },
        system: {
          requirements: parseRequirements(requirements, ctx),
          multiSelect,
          cost: '',
          damageReductionBonus: 0,
          description,
          effect: '',
        },
        description,
        flags: source.sourceModule ? { sourceModule: source.sourceModule } : undefined,
      });
    }
  }

  return docs;
};

/** A talent name is short, doesn't end with `.`, no `:`, not a bullet, no digits-only. */
function isPlausibleName(line: string): boolean {
  if (!line || line.length > 80) return false;
  if (line.endsWith('.') || line.endsWith(',')) return false;
  if (line.includes(':')) return false;
  if (/^[*\-•]/.test(line)) return false;
  if (/^\d+$/.test(line)) return false;
  if (/^Wymagania\b/i.test(line)) return false;
  // Must have at least one capital letter (talent names are Title Case).
  if (!/[A-ZŻŹĆĄŚĘŁÓŃ]/.test(line)) return false;
  return true;
}

function isProseOrReq(line: string): boolean {
  if (!line) return false;
  if (/^Wymagania\b/i.test(line)) return true;
  // Proseish: long, ends with punctuation, contains lowercase mid-sentence words.
  return line.length > 60 || /[.!?]$/.test(line);
}

function parseRequirements(text: string, _ctx: ParserContext): Record<string, unknown> {
  // Keep raw + crude extraction. Detailed parsing can come later.
  if (!text) {
    return { race: '', attribute: '', skill: '', talent: '', title: '', discipline: '' };
  }
  return {
    race: extractParen(text, /Rasa\s*\(([^)]+)\)/i),
    attribute: '',
    skill: '',
    talent: '',
    title: extractParen(text, /Tytuł\s*\(([^)]+)\)/i),
    discipline: extractParen(text, /Dziedzina\s+Magii\s*\(([^)]+)\)/i),
    raw: text,
  };
}

function extractParen(text: string, re: RegExp): string {
  const m = text.match(re);
  return m ? m[1].trim() : '';
}
