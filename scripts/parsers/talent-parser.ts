/**
 * Talent parser. Since the `bab5a62` vault split, every talent lives in its
 * own file (one per talent) under a book's "Talenty" chapter folder:
 *
 *   rules/00. Podręcznik Gry/Rozdział IV - Talenty/<Name>.md
 *   rules/06. Bestiariusz/Rozdział III - Talenty/<Name>.md
 *   rules/04. Arcanum Sanguinis/Rozdział IV - Talenty/<Name>.md
 *   rules/02. Klątwa Otchłani/Rozdział II - Talenty/<Name>.md
 *
 * Each file is: YAML frontmatter, an optional `Wymagania: ...` /
 * `**Wymagania**: ...` line anywhere in the body, and the rest is
 * description prose. The file's own name is the talent name.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import type { ParsedDoc, ParserContext, ParserFn, SourceBookId } from './types';
import { slugify } from './helpers';

const REQUIREMENTS_LINE = /^(?:\*\*|\*)?Wymagania(?:\*\*|\*)?\s*:\s*(.+)$/i;
const FRONTMATTER_FENCE = /^---\s*$/;

interface TalentFolderSource {
  book: SourceBookId;
  /** Folder path relative to repoRoot, one talent per .md file. */
  folder: string;
  /** Pack id to write into. */
  pack: string;
  /** Optional source-module flag stamped onto each talent. */
  sourceModule?: 'arcanum-sanguinis' | 'abyss-curse' | 'crimson-cult' | null;
}

const TALENT_FOLDER_SOURCES: TalentFolderSource[] = [
  {
    book: 'podrecznik-gry',
    folder: 'ObsidianNotes/rules/00. Podręcznik Gry/Rozdział IV - Talenty',
    pack: 'talents',
    sourceModule: null,
  },
  {
    book: 'bestiariusz',
    folder: 'ObsidianNotes/rules/06. Bestiariusz/Rozdział III - Talenty',
    pack: 'talents-npc',
    sourceModule: null,
  },
  {
    book: 'arcanum-sanguinis',
    folder: 'ObsidianNotes/rules/04. Arcanum Sanguinis/Rozdział IV - Talenty',
    pack: 'talents-blood',
    sourceModule: 'arcanum-sanguinis',
  },
  {
    book: 'klatwa-otchlani',
    folder: 'ObsidianNotes/rules/02. Klątwa Otchłani/Rozdział II - Talenty',
    pack: 'talents-eldritch',
    sourceModule: 'abyss-curse',
  },
];

/** Skip YAML frontmatter (--- ... ---) at file start. Returns start line index. */
function skipFrontmatter(lines: string[]): number {
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0].trim())) return 0;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_FENCE.test(lines[i].trim())) return i + 1;
  }
  return 0;
}

/** Pull the (first) `Wymagania:` line out of a talent file body; everything else is description. */
function parseTalentBody(path: string): { requirements: string; description: string } {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const body = lines.slice(skipFrontmatter(lines));

  let requirements = '';
  const descLines: string[] = [];
  for (const raw of body) {
    const m = requirements === '' ? raw.trim().match(REQUIREMENTS_LINE) : null;
    if (m) {
      requirements = m[1].trim();
      continue;
    }
    descLines.push(raw);
  }

  return { requirements, description: descLines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

export const parseTalents: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];

  for (const source of TALENT_FOLDER_SOURCES) {
    const dirPath = resolve(ctx.repoRoot, source.folder);
    if (!existsSync(dirPath)) {
      console.warn(`[talent-parser] folder not found: ${source.folder}`);
      continue;
    }

    const files = readdirSync(dirPath).filter((f) => extname(f) === '.md');
    for (const file of files) {
      let finalName = basename(file, '.md');
      if (finalName === 'Czuły Zmysł') {
        finalName = 'Czuły Zmysł (Zmysł)';
      }

      const { requirements, description } = parseTalentBody(resolve(dirPath, file));
      const baseSlug = slugify(finalName);
      const id = ctx.idOverrides[baseSlug] ?? baseSlug;

      // Detect "(Dziedzina)" / "(Bóstwo)" / similar parameterised talents.
      const multiSelect = /\((Dziedzina|Bóstwo|Zmysł|Atrybut|Umiejętność)\)$/i.test(finalName);

      docs.push({
        id,
        name: finalName,
        documentType: 'Item',
        subType: 'talent',
        pack: source.pack,
        source: { book: source.book, chapter: 'Talenty' },
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

  // Parse discipline-specific talents from Wybór Dziedziny Magii
  docs.push(...(await parseDisciplineTalents(ctx)));

  return docs;
};

/**
 * The 10 "discipline choice" talents live inline as headings inside the
 * character-creation "Wybór Dziedziny Magii - <Discipline>.md" files.
 * Heading level is inconsistent across files (#### to ######), so match
 * against a name whitelist rather than a fixed heading depth.
 */
const DISCIPLINE_TALENT_FOLDER = 'ObsidianNotes/rules/00. Podręcznik Gry/Rozdział II - Tworzenie Postaci';
const DISCIPLINE_CHOICE_FILES = [
  'Wybór Dziedziny Magii - Alchemia.md',
  'Wybór Dziedziny Magii - Botanika.md',
  'Wybór Dziedziny Magii - Magia Iluzji.md',
  'Wybór Dziedziny Magii - Magia Sakralna.md',
  'Wybór Dziedziny Magii - Magia Żywiołów.md',
  'Wybór Dziedziny Magii - Rzemiosło Artefaktów.md',
  'Wybór Dziedziny Magii - Wiedźmia Magia.md',
  'Wybór Dziedziny Magii - Źródło Mocy.md',
];

const DISCIPLINE_TALENT_NAMES = [
  'Podejrzliwość Wobec Zmian',
  'Nadzwyczajna Odporność',
  'Magiczna Flora',
  'Miłosierdzie',
  'Błogosławieni Egzorcyści',
  'Jedność z Żywiołem',
  'Tajemna Technologia',
  'Pierwotna Energia',
  'Niezwykła Intuicja',
  'Arytmetyczna Koncentracja',
];

const HEADING_LINE = /^#{1,6}\s+(.+)$/;

async function parseDisciplineTalents(ctx: ParserContext): Promise<ParsedDoc[]> {
  const docs: ParsedDoc[] = [];
  const cleanNames = DISCIPLINE_TALENT_NAMES.map((n) => slugify(n));

  for (const file of DISCIPLINE_CHOICE_FILES) {
    const path = resolve(ctx.repoRoot, DISCIPLINE_TALENT_FOLDER, file);
    let lines: string[] = [];
    try {
      lines = readFileSync(path, 'utf8').split(/\r?\n/);
    } catch {
      continue;
    }
    const body = lines.slice(skipFrontmatter(lines));

    for (let i = 0; i < body.length; i++) {
      const headingMatch = body[i].trim().match(HEADING_LINE);
      if (!headingMatch) continue;
      const talentIndex = cleanNames.indexOf(slugify(headingMatch[1].trim()));
      if (talentIndex < 0) continue;

      const name = DISCIPLINE_TALENT_NAMES[talentIndex];
      const descLines: string[] = [];
      let j = i + 1;
      while (j < body.length && !HEADING_LINE.test(body[j].trim())) {
        descLines.push(body[j]);
        j++;
      }
      const description = descLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      const baseSlug = slugify(name);
      const id = ctx.idOverrides[baseSlug] ?? baseSlug;

      docs.push({
        id,
        name,
        documentType: 'Item',
        subType: 'talent',
        pack: 'talents',
        source: { book: 'podrecznik-gry', chapter: 'Wybór Dziedziny Magii' },
        system: {
          requirements: { race: '', attribute: '', skill: '', talent: '', title: '', discipline: '' },
          multiSelect: false,
          cost: '',
          damageReductionBonus: 0,
          description,
          effect: '',
        },
        description,
      });

      i = j - 1;
    }
  }

  return docs;
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
