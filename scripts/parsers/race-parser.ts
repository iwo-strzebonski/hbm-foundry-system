/**
 * Race parser. Since the `bab5a62` vault split, the playable races' Cechy
 * Rasowe (mechanical stats: attribute points, available disciplines, free
 * talents) each live in their own character-creation file:
 *
 *   rules/00. Podręcznik Gry/Rozdział II - Tworzenie Postaci/Wybór Rasy - <Name>.md
 *
 * Only 5 races are player-selectable at character creation (Człowiek, Elf,
 * Feles, Lamia, Anioł/Anielica) - Krasnolud, Demon and Malferianin have no
 * such file and are NPC/plot-only races with no point-buy stats to parse.
 *
 * Flavor description comes from the vault's canonical `races/<Name>.md`
 * write-up's "Krótki opis" section (their canonical home per the changelog's
 * "disciplines vs disciplines/" pattern - character-creation files only
 * carry a short player-facing blurb, not the full lore).
 *
 * Format of each Wybór Rasy file (unchanged from the pre-split monolith,
 * just relocated to one file per race):
 *   <flavor paragraphs>
 *
 *   Cechy Rasowe:
 *   * Dostępne Dziedziny Magii:
 *      * <discipline 1>
 *   * N Punktów Atrybutów
 *   * Darmowe Talenty:
 *      * <talent 1>
 *   * 1 Punkt Umiejętności w <skill>
 *   * N Punktów Umiejętności
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedDoc, ParserContext, ParserFn } from './types';
import { slugify } from './helpers';

const RACE_FEATURES_HEADER = /^Cechy Rasowe:\s*$/;
const FRONTMATTER_FENCE = /^---\s*$/;

interface RaceSource {
  name: string;
  /** Relative to `rules/00. Podręcznik Gry/Rozdział II - Tworzenie Postaci/`. */
  mechanicalFile: string;
  /** Relative to `ObsidianNotes/races/`. */
  descriptionFile: string;
}

const CHARACTER_CREATION_DIR = 'ObsidianNotes/rules/00. Podręcznik Gry/Rozdział II - Tworzenie Postaci';

const RACE_SOURCES: RaceSource[] = [
  { name: 'Człowiek', mechanicalFile: 'Wybór Rasy - Człowiek.md', descriptionFile: 'Człowiek.md' },
  { name: 'Elf', mechanicalFile: 'Wybór Rasy - Elf.md', descriptionFile: 'Elf.md' },
  { name: 'Feles', mechanicalFile: 'Wybór Rasy - Feles.md', descriptionFile: 'Feles.md' },
  { name: 'Lamia', mechanicalFile: 'Wybór Rasy - Lamia.md', descriptionFile: 'Lamia.md' },
  { name: 'Anioł/Anielica', mechanicalFile: 'Wybór Rasy - Anioł-Anielica.md', descriptionFile: 'Anioł.md' },
];

function skipFrontmatter(lines: string[]): number {
  if (lines.length === 0 || !FRONTMATTER_FENCE.test(lines[0].trim())) return 0;
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER_FENCE.test(lines[i].trim())) return i + 1;
  }
  return 0;
}

/** Pulls the "## Krótki opis" section out of a canonical `races/` write-up. */
function readShortDescription(repoRoot: string, descriptionFile: string): string {
  let lines: string[];
  try {
    lines = readFileSync(resolve(repoRoot, 'ObsidianNotes/races', descriptionFile), 'utf8').split(/\r?\n/);
  } catch {
    return '';
  }
  const body = lines.slice(skipFrontmatter(lines));
  const startIdx = body.findIndex((l) => /^#{1,6}\s*Krótki opis\s*$/i.test(l.trim()));
  if (startIdx < 0) return '';
  const buf: string[] = [];
  for (let i = startIdx + 1; i < body.length; i++) {
    const cur = body[i].trim();
    if (/^#{1,6}\s+/.test(cur)) break;
    if (cur === '') continue;
    buf.push(cur);
  }
  return buf.join(' ');
}

export const parseRaces: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];

  for (const source of RACE_SOURCES) {
    const path = resolve(ctx.repoRoot, CHARACTER_CREATION_DIR, source.mechanicalFile);
    let lines: string[];
    try {
      lines = readFileSync(path, 'utf8').split(/\r?\n/);
    } catch {
      console.warn(`[race-parser] file not found: ${source.mechanicalFile}`);
      continue;
    }
    const body = lines.slice(skipFrontmatter(lines));

    const headerIdx = body.findIndex((l) => RACE_FEATURES_HEADER.test(l.trim()));
    if (headerIdx < 0) {
      console.warn(`[race-parser] no "Cechy Rasowe:" block in ${source.mechanicalFile}`);
      continue;
    }

    const bulletLines = body.slice(headerIdx + 1).map((l) => l.trimEnd());
    const parsed = parseRaceFeatures(bulletLines);

    const description = readShortDescription(ctx.repoRoot, source.descriptionFile);
    const baseSlug = slugify(source.name);
    const id = ctx.idOverrides[baseSlug] ?? baseSlug;

    docs.push({
      id,
      name: source.name,
      documentType: 'Item',
      subType: 'race',
      pack: 'races',
      source: { book: 'podrecznik-gry', chapter: 'Tworzenie Postaci' },
      system: {
        availableDisciplines: parsed.disciplines,
        attributePoints: parsed.attributePoints,
        skillPoints: parsed.skillPoints,
        freeTalents: parsed.freeTalents,
        racialAbilities: [],
        physicalDescription: description,
        description,
      },
      description,
    });
  }

  return docs;
};

interface ParsedRaceFeatures {
  disciplines: string[];
  attributePoints: number;
  skillPoints: number;
  freeTalents: string[];
}

function parseRaceFeatures(lines: string[]): ParsedRaceFeatures {
  const result: ParsedRaceFeatures = {
    disciplines: [],
    attributePoints: 0,
    skillPoints: 0,
    freeTalents: [],
  };

  // Detect "* <Header>:" then collect indented child bullets that follow.
  let mode: 'none' | 'disciplines' | 'talents' = 'none';
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === '') continue;

    // Top-level bullet: `* xxx`
    const top = line.match(/^\*\s+(.+)$/);
    if (top) {
      const text = top[1].trim();
      if (/^Dostępne Dziedziny Magii:/i.test(text)) {
        mode = 'disciplines';
        continue;
      }
      if (/^Darmowe Talenty:/i.test(text)) {
        mode = 'talents';
        continue;
      }
      mode = 'none';

      // Standalone counters.
      const attr = text.match(/^(\d+)\s+(?:Punkt|Punkty|Punktów)\s+Atrybutów/i);
      if (attr) result.attributePoints = Number(attr[1]);
      const skill = text.match(/^(\d+)\s+(?:Punkt|Punkty|Punktów)\s+Umiejętności(?:\s+do\s+rozdania)?/i);
      if (skill && !/Umiejętności\s+w\s+/i.test(text)) result.skillPoints = Number(skill[1]);
      continue;
    }

    // Indented child bullet `   * xxx` (leading tabs/spaces).
    const child = line.match(/^\s+\*\s+(.+)$/);
    if (!child) continue;
    const text = child[1].trim();

    if (mode === 'disciplines') result.disciplines.push(text);
    else if (mode === 'talents') result.freeTalents.push(text);
  }

  return result;
}
