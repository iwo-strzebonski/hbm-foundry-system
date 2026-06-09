/**
 * Discipline parser. Disciplines are identified by the entries in
 * `_label-mappings.json#disciplines`; we emit one stub Item per discipline
 * with name, source book, and an empty description (filled in later).
 *
 * Many disciplines also have a "passive ability" mentioned right after the
 * discipline header in Podręcznik Gry — we capture the next non-empty line
 * if it looks like a short ability description.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedDoc, ParserContext, ParserFn, SourceBookId } from './types';
import { normalizeKey, slugify } from './helpers';

interface DisciplineSeed {
  id: string;
  polishName: string;
  pack: string;
  book: SourceBookId;
}

const DISCIPLINE_SEEDS: DisciplineSeed[] = [
  { id: 'alchemyTransmutation', polishName: 'Alchemia - Transmutacja', pack: 'disciplines', book: 'podrecznik-gry' },
  { id: 'alchemyBrewing', polishName: 'Alchemia - Warzenie Eliksirów', pack: 'disciplines', book: 'podrecznik-gry' },
  { id: 'botany', polishName: 'Botanika', pack: 'disciplines', book: 'podrecznik-gry' },
  { id: 'elementsAir', polishName: 'Magia Żywiołów (Powietrze)', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'elementsWater', polishName: 'Magia Żywiołów (Woda)', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'elementsFire', polishName: 'Magia Żywiołów (Ogień)', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'elementsEarth', polishName: 'Magia Żywiołów (Ziemia)', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'artifice', polishName: 'Rzemiosło Artefaktów', pack: 'disciplines', book: 'podrecznik-gry' },
  { id: 'golemancy', polishName: 'Golemancja', pack: 'disciplines', book: 'podrecznik-gry' },
  { id: 'runes', polishName: 'Magia Runiczna', pack: 'disciplines', book: 'podrecznik-gry' },
  { id: 'manaSourceMage', polishName: 'Źródło Mocy', pack: 'disciplines', book: 'podrecznik-gry' },
  { id: 'illusion', polishName: 'Magia Iluzji', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'sacred', polishName: 'Magia Sakralna', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'sacredExorcism', polishName: 'Magia Sakralna — Egzorcyzmy', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'witch', polishName: 'Wiedźmia Magia', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'necromancy', polishName: 'Nekromancja', pack: 'disciplines', book: 'ksiega-magii' },
  { id: 'blood', polishName: 'Magia Krwi', pack: 'disciplines-forbidden', book: 'arcanum-sanguinis' },
  { id: 'crimson', polishName: 'Magia Szkarłatu', pack: 'disciplines-forbidden', book: 'crimson-cult' },
  { id: 'abyssAspects', polishName: 'Magia Otchłani — Magia Aspektów', pack: 'disciplines-forbidden', book: 'klatwa-otchlani' },
  { id: 'abyssPrimal', polishName: 'Magia Otchłani — Pierwotna Magia', pack: 'disciplines-forbidden', book: 'klatwa-otchlani' },
  { id: 'wildWitch', polishName: 'Dzika Wiedźmia Magia', pack: 'disciplines-forbidden', book: 'klatwa-otchlani' },
];

const SUGGESTED_ATTRIBUTE: Record<string, string> = {
  sacred: 'soul',
  blood: 'soul',
  crimson: 'soul',
};

const SUGGESTED_SKILLS: Record<string, string[]> = {
  sacred: ['devotion'],
  blood: ['magicalAbilities'],
};

/**
 * Pull a one-paragraph discipline description out of Podręcznik Gry by
 * matching the header line and grabbing the next non-empty paragraph.
 */
/** Strip markdown heading markers from a line. */
function stripHeadingMarkers(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').replace(/^\*\*(.+)\*\*$/, '$1').trim();
}

/** Skip YAML frontmatter (--- ... ---) at file start. */
function skipFrontmatter(lines: string[]): number {
  if (lines.length === 0 || !/^---\s*$/.test(lines[0].trim())) return 0;
  for (let i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i].trim())) return i + 1;
  }
  return 0;
}

function lookupDescription(repoRoot: string, polishName: string): string {
  // Try split-book sources first (disciplines from Księga Magii or Klątwa Otchłani
  // now live in rules/01.* and rules/02.*).
  const splitSources = [
    resolve(repoRoot, 'ObsidianNotes/rules/01. Księga Magii.md'),
    resolve(repoRoot, 'ObsidianNotes/rules/02. Klątwa Otchłani.md'),
    resolve(repoRoot, 'ObsidianNotes/rules/00. Podręcznik Gry.md'),
  ];
  const target = normalizeKey(polishName.split('—')[0]);

  for (const file of splitSources) {
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const rawLines = text.split(/\r?\n/);
    const start = skipFrontmatter(rawLines);
    const lines = rawLines.slice(start);
    for (let i = 0; i < lines.length; i++) {
      const bare = normalizeKey(stripHeadingMarkers(lines[i].trim()));
      if (bare === target) {
        // Capture next paragraph (until blank line).
        const buf: string[] = [];
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
          const cur = lines[j].trim();
          if (cur === '' && buf.length > 0) break;
          if (cur && !/^_{3,}$/.test(cur) && !/^#{1,6}\s/.test(cur)) buf.push(cur);
        }
        if (buf.length > 0) return buf.join(' ');
      }
    }
  }
  return '';
}

export const parseDisciplines: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];
  for (const seed of DISCIPLINE_SEEDS) {
    const baseSlug = ctx.idOverrides[slugify(seed.polishName)] ?? seed.id;
    const description = lookupDescription(ctx.repoRoot, seed.polishName);
    docs.push({
      id: baseSlug,
      name: seed.polishName,
      documentType: 'Item',
      subType: 'discipline',
      pack: seed.pack,
      source: { book: seed.book },
      system: {
        color: '',
        suggestedAttribute: SUGGESTED_ATTRIBUTE[seed.id] ?? 'magic',
        suggestedSkills: SUGGESTED_SKILLS[seed.id] ?? ['magicalAbilities'],
        passiveAbility: '',
        availableSpells: [],
        description,
      },
      description,
    });
  }
  return docs;
};
