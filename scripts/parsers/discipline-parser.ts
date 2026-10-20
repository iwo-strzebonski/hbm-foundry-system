/**
 * Discipline parser. Disciplines are identified by the entries in
 * `DISCIPLINE_SEEDS`; we emit one stub Item per discipline with name,
 * source book, and a description pulled from the vault's canonical
 * `ObsidianNotes/disciplines/` folder (see `descriptionFile`/`fallbackFile`
 * below).
 *
 * Before `bab5a62` these descriptions were read out of the monolithic
 * rulebook files (`rules/01.*`, `rules/02.*`, `rules/00.*`) by matching a
 * heading against the discipline's Polish name. That split replaced the
 * rulebooks' discipline write-ups with links to `disciplines/` (their
 * canonical home per the changelog: "disciplines vs disciplines/"), so we
 * now read the canonical files directly instead of chasing a link.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParsedDoc, ParserContext, ParserFn, SourceBookId } from './types';
import { slugify } from './helpers';

interface DisciplineSeed {
  id: string;
  polishName: string;
  pack: string;
  book: SourceBookId;
  /** Path relative to ObsidianNotes/disciplines/ - the most specific write-up. */
  descriptionFile: string;
  /** Parent discipline file to fall back to when descriptionFile is an empty stub. */
  fallbackFile?: string;
}

const DISCIPLINE_SEEDS: DisciplineSeed[] = [
  { id: 'alchemyTransmutation', polishName: 'Alchemia - Transmutacja', pack: 'disciplines', book: 'podrecznik-gry', descriptionFile: 'Alchemia/Poddziedzina - Transmutacja.md', fallbackFile: 'Alchemia.md' },
  { id: 'alchemyBrewing', polishName: 'Alchemia - Warzenie Eliksirów', pack: 'disciplines', book: 'podrecznik-gry', descriptionFile: 'Alchemia/Poddziedzina - Warzenie Eliksirów.md', fallbackFile: 'Alchemia.md' },
  { id: 'botany', polishName: 'Botanika', pack: 'disciplines', book: 'podrecznik-gry', descriptionFile: 'Botanika.md' },
  { id: 'elementsAir', polishName: 'Magia Żywiołów (Powietrze)', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Magia Żywiołów/Poddziedzina - Magia Powietrza.md', fallbackFile: 'Magia Żywiołów.md' },
  { id: 'elementsWater', polishName: 'Magia Żywiołów (Woda)', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Magia Żywiołów/Poddziedzina - Magia Wody.md', fallbackFile: 'Magia Żywiołów.md' },
  { id: 'elementsFire', polishName: 'Magia Żywiołów (Ogień)', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Magia Żywiołów/Poddziedzina - Magia Ognia.md', fallbackFile: 'Magia Żywiołów.md' },
  { id: 'elementsEarth', polishName: 'Magia Żywiołów (Ziemia)', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Magia Żywiołów/Poddziedzina - Magia Ziemi.md', fallbackFile: 'Magia Żywiołów.md' },
  { id: 'artifice', polishName: 'Rzemiosło Artefaktów', pack: 'disciplines', book: 'podrecznik-gry', descriptionFile: 'Rzemiosło Artefaktów.md' },
  { id: 'golemancy', polishName: 'Golemancja', pack: 'disciplines', book: 'podrecznik-gry', descriptionFile: 'Golemancja.md' },
  { id: 'runes', polishName: 'Magia Runiczna', pack: 'disciplines', book: 'podrecznik-gry', descriptionFile: 'Magia Runiczna.md' },
  { id: 'manaSourceMage', polishName: 'Źródło Mocy', pack: 'disciplines', book: 'podrecznik-gry', descriptionFile: 'Źródło Mocy.md' },
  { id: 'illusion', polishName: 'Magia Iluzji', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Magia Iluzji.md' },
  { id: 'sacred', polishName: 'Magia Sakralna', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Magia Sakralna/Poddziedzina - Magia Sakralna.md', fallbackFile: 'Magia Sakralna.md' },
  { id: 'sacredExorcism', polishName: 'Magia Sakralna - Egzorcyzmy', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Magia Sakralna/Poddziedzina - Egzorcyzmy.md', fallbackFile: 'Magia Sakralna.md' },
  { id: 'witch', polishName: 'Wiedźmia Magia', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Wiedźmia Magia.md' },
  { id: 'necromancy', polishName: 'Nekromancja', pack: 'disciplines', book: 'ksiega-magii', descriptionFile: 'Nekromancja.md' },
  { id: 'blood', polishName: 'Magia Krwi', pack: 'disciplines-forbidden', book: 'arcanum-sanguinis', descriptionFile: 'Magia Krwi.md' },
  { id: 'crimson', polishName: 'Magia Szkarłatu', pack: 'disciplines-forbidden', book: 'crimson-cult', descriptionFile: 'Magia Szkarłatu.md' },
  { id: 'abyssAspects', polishName: 'Magia Otchłani - Magia Aspektów', pack: 'disciplines-forbidden', book: 'klatwa-otchlani', descriptionFile: 'Magia Otchłani/Poddziedzina - Magia Aspektów.md', fallbackFile: 'Magia Otchłani.md' },
  { id: 'abyssPrimal', polishName: 'Magia Otchłani - Pierwotna Magia', pack: 'disciplines-forbidden', book: 'klatwa-otchlani', descriptionFile: 'Magia Otchłani/Poddziedzina - Pierwotna Magia.md', fallbackFile: 'Magia Otchłani.md' },
  { id: 'wildWitch', polishName: 'Dzika Wiedźmia Magia', pack: 'disciplines-forbidden', book: 'klatwa-otchlani', descriptionFile: 'Dzika Wiedźmia Magia.md' },
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

/** Skip YAML frontmatter (--- ... ---) at file start. */
function skipFrontmatter(lines: string[]): number {
  if (lines.length === 0 || !/^---\s*$/.test(lines[0].trim())) return 0;
  for (let i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i].trim())) return i + 1;
  }
  return 0;
}

/**
 * Pull a description out of a `disciplines/` file: prefer the prose under
 * a `## Definicja` or `## Wstęp` heading (the two intro-section labels the
 * canonical write-ups use); fall back to the first prose paragraph before
 * any heading (covers Poddziedzina sub-files, which usually skip straight
 * to prose with no intro heading at all). Returns '' for frontmatter-only
 * stub files.
 */
function extractDescription(body: string[]): string {
  const HEADING = /^#{1,6}\s+(.+)$/;
  const isNoise = (line: string) =>
    line === '' ||
    /^spis tre[śs]ci$/i.test(line) || // literal "Spis treści" TOC label
    /^[-_*]{3,}$/.test(line) || // horizontal rule
    /^[-*]\s*\[/.test(line); // TOC bullet, incl. tab-indented sub-bullets (already trimmed)

  const introIdx = body.findIndex((l) => /^#{1,6}\s*(Definicja|Wstęp)\s*$/i.test(l.trim()));
  if (introIdx >= 0) {
    const buf: string[] = [];
    for (let i = introIdx + 1; i < body.length; i++) {
      const cur = body[i].trim();
      if (HEADING.test(cur)) break;
      if (isNoise(cur)) continue;
      buf.push(cur);
    }
    if (buf.length > 0) return buf.join(' ');
  }

  const buf: string[] = [];
  for (const raw of body) {
    const cur = raw.trim();
    if (HEADING.test(cur)) break;
    if (isNoise(cur)) continue;
    buf.push(cur);
  }
  return buf.join(' ');
}

function readDisciplineFile(repoRoot: string, relPath: string): string {
  const path = resolve(repoRoot, 'ObsidianNotes/disciplines', relPath);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return '';
  }
  const lines = text.split(/\r?\n/);
  return extractDescription(lines.slice(skipFrontmatter(lines)));
}

function lookupDescription(repoRoot: string, seed: DisciplineSeed): string {
  const primary = readDisciplineFile(repoRoot, seed.descriptionFile);
  if (primary) return primary;
  if (seed.fallbackFile) return readDisciplineFile(repoRoot, seed.fallbackFile);
  return '';
}

export const parseDisciplines: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];
  for (const seed of DISCIPLINE_SEEDS) {
    const baseSlug = ctx.idOverrides[slugify(seed.polishName)] ?? seed.id;
    const description = lookupDescription(ctx.repoRoot, seed);
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
        signatureSpells: [],
        description,
      },
      description,
    });
  }
  return docs;
};
