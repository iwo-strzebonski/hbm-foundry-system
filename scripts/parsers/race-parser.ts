/**
 * Race parser. Races in HbM live in Podręcznik Gry, Rozdział II.
 *
 * Format:
 *   Race Name (optional /Variant)
 *   <flavor paragraphs>
 *
 *   Cechy Rasowe:
 *   * Dostępne Dziedziny Magii:
 *      * <discipline 1>
 *      * <discipline 2>
 *   * N Punktów Atrybutów
 *   * Darmowe Talenty:
 *      * <talent 1>
 *      * <talent 2>
 *   * 1 Punkt Umiejętności w <skill>
 *   * N Punktów Umiejętności
 *   ________________
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedDoc, ParserContext, ParserFn } from './types';
import { normalizeKey, slugify } from './helpers';

const SEPARATOR = /^_{3,}$/;
const RACE_FEATURES_HEADER = /^Cechy Rasowe:\s*$/;

const SOURCE_FILE = '_books/HbM RPG v3 - Podręcznik Gry.md';
const KNOWN_RACES = new Set([
  'człowiek',
  'elf',
  'feles (kotowate)',
  'feles',
  'lamia (naga)',
  'lamia',
  'anioł/anielica',
  'anioł',
  'krasnolud',
  'demon',
  'malferianin',
]);

export const parseRaces: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];
  const path = resolve(ctx.repoRoot, SOURCE_FILE);
  let lines: string[] = [];
  try {
    lines = readFileSync(path, 'utf8').split(/\r?\n/);
  } catch {
    return docs;
  }

  // Find each `Cechy Rasowe:` block; the race name is the most recent
  // non-empty, non-separator line above the block that matches a known race.
  for (let i = 0; i < lines.length; i++) {
    if (!RACE_FEATURES_HEADER.test(lines[i].trim())) continue;

    // Walk up looking for the race name + flavor paragraphs.
    let nameLine = '';
    let nameIdx = i - 1;
    while (nameIdx >= 0) {
      const cur = lines[nameIdx].trim();
      if (cur && !SEPARATOR.test(cur)) {
        // The name is the FIRST line above that matches KNOWN_RACES; flavor lines come between.
        if (KNOWN_RACES.has(normalizeKey(cur))) {
          nameLine = cur;
          break;
        }
      }
      nameIdx--;
    }
    if (!nameLine) continue;

    // Flavor description = lines between race name and `Cechy Rasowe:`.
    const flavorLines: string[] = [];
    for (let j = nameIdx + 1; j < i; j++) {
      const cur = lines[j].trimEnd();
      if (cur === '' || SEPARATOR.test(cur.trim())) continue;
      flavorLines.push(cur);
    }
    const physicalDescription = flavorLines.join('\n').trim();

    // Walk down through the bullet block until next separator/blank-paragraph.
    const bulletLines: string[] = [];
    let k = i + 1;
    while (k < lines.length) {
      const cur = lines[k].trimEnd();
      if (SEPARATOR.test(cur.trim())) break;
      bulletLines.push(cur);
      k++;
    }

    const parsed = parseRaceFeatures(bulletLines);

    const baseSlug = slugify(stripVariant(nameLine));
    const id = ctx.idOverrides[baseSlug] ?? baseSlug;

    docs.push({
      id,
      name: stripVariant(nameLine),
      documentType: 'Item',
      subType: 'race',
      pack: 'races',
      source: { book: 'podrecznik-gry', chapter: 'Tworzenie Postaci', line: nameIdx + 1 },
      system: {
        availableDisciplines: parsed.disciplines,
        attributePoints: parsed.attributePoints,
        skillPoints: parsed.skillPoints,
        freeTalents: parsed.freeTalents,
        racialAbilities: [],
        physicalDescription,
        description: physicalDescription,
      },
      description: physicalDescription,
    });
  }

  return docs;
};

function stripVariant(name: string): string {
  // "Anioł/Anielica" → "Anioł"; "Feles (Kotowate)" → "Feles"
  return name.split('/')[0].split('(')[0].trim();
}

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

    // Indented child bullet `   * xxx` (Google Docs export uses tabs/spaces).
    const child = line.match(/^\s+\*\s+(.+)$/);
    if (!child) continue;
    const text = child[1].trim();

    if (mode === 'disciplines') result.disciplines.push(text);
    else if (mode === 'talents') result.freeTalents.push(text);
  }

  return result;
}
