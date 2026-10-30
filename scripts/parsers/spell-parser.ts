import { resolve, basename } from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { ParsedDoc, ParserContext, ParserFn, SourceBookId } from './types';
import { slugify } from './helpers';
import yaml from 'js-yaml';

/**
 * Flat, human-editable vault frontmatter for a spell. Nothing is nested;
 * optional keys can simply be left out. `toSystem()` expands it into the
 * (partly nested) Foundry `SpellData` shape.
 */
const SpellNoteSchema = z.object({
  castingMode: z.enum(['standard', 'sacred', 'witch', 'blood']),
  school: z.string(),
  deity: z.string().default(''),
  sourceBook: z.string(),
  manaCost: z.number().int().min(0),
  bloodCost: z.number().int().min(0).default(0),
  threshold: z.number().int().min(1).max(6),
  successes: z.number().int().min(1),
  isSuperspell: z.boolean().default(false),
  requiresGroupCast: z.boolean().default(false),
  minCasters: z.number().int().min(1).default(1),
  nonCombatOnly: z.boolean().default(false),
  verbal: z.boolean().default(false),
  somatic: z.boolean().default(false),
  material: z.coerce.string().default(''),
  symbols: z.array(z.string()).default([]),
  requiresRace: z.array(z.string()).default([]),
  requiresTalent: z.array(z.string()).default([]),
  requiresDiscipline: z.array(z.string()).default([]),
  castingTime: z.coerce.string().default('Instant'),
  range: z.coerce.string().default(''),
  targets: z.coerce.string().default(''),
  duration: z.coerce.string().default(''),
  damageBase: z.coerce.string().default(''),
  category: z.coerce.string().default(''),
  damageCategory: z.boolean().default(false),
  damageType: z.string().default('magical'),
  ignoresArmor: z.boolean().default(false),
  statusEffects: z.array(z.string()).default([]),
  saveAttribute: z.string().default(''),
  saveSkill: z.string().default(''),
  triggers: z.array(z.object({ event: z.string(), effect: z.string() })).default([]),
  overcast: z.array(z.string()).default([]),
});
type SpellNote = z.infer<typeof SpellNoteSchema>;

type Aoe = { shape: string; x: number; y: number; unit: string };

/** Derive the structured area of effect from the free-text `targets` line. */
export function deriveAreaOfEffect(targets: string): Aoe {
  const t = targets.replace(/\s+/g, ' ');
  let m = t.match(/kwadrat o boku (\d+)\s*m/i);
  if (m) return { shape: 'square', x: Number(m[1]), y: Number(m[1]), unit: 'm' };
  m = t.match(/prostokąt (\d+)\s*m\s*[x×]\s*(\d+)\s*m/i);
  if (m) return { shape: 'rectangle', x: Number(m[1]), y: Number(m[2]), unit: 'm' };
  m = t.match(/(?:sfera|kula) o średnicy (\d+)\s*m/i);
  if (m) return { shape: 'sphere', x: Number(m[1]) / 2, y: 0, unit: 'm' };
  m = t.match(/(?:sfera|kula|kopuła) o promieniu (\d+)\s*m/i);
  if (m) return { shape: 'sphere', x: Number(m[1]), y: 0, unit: 'm' };
  if (/^linia/i.test(t)) return { shape: 'line', x: 0, y: 0, unit: 'm' };
  return { shape: 'point', x: 0, y: 0, unit: 'm' };
}

/** Casting time in whole rounds / minutes, for the sheet's numeric fields. */
export function deriveCastingTime(text: string): { rounds: number; minutes: number } {
  let m = text.match(/(\d+)\s*godzin/i);
  if (m) return { rounds: 0, minutes: Number(m[1]) * 60 };
  m = text.match(/(\d+)\s*minut/i);
  if (m) return { rounds: 0, minutes: Number(m[1]) };
  m = text.match(/(\d+)\s*rund/i);
  if (m) return { rounds: Number(m[1]), minutes: 0 };
  return { rounds: 0, minutes: 0 };
}

function toSystem(n: SpellNote): Record<string, unknown> {
  const time = deriveCastingTime(n.castingTime);
  return {
    school: n.school,
    deity: n.deity,
    sourceBook: n.sourceBook,
    castingMode: n.castingMode,
    manaCost: n.manaCost,
    bloodCost: n.bloodCost,
    difficulty: { threshold: n.threshold, successes: n.successes },
    components: { verbal: n.verbal, somatic: n.somatic, material: n.material, symbols: n.symbols },
    castingTime: n.castingTime,
    castingTimeRounds: time.rounds,
    castingTimeMinutes: time.minutes,
    range: n.range,
    targets: n.targets,
    duration: n.duration,
    areaOfEffect: deriveAreaOfEffect(n.targets),
    damageBase: n.damageBase,
    // Spells of the "Obrażenia" effect category (vault `category:`) deal +1 damage.
    damageCategory: n.damageCategory || n.category.trim().toLowerCase() === 'obrażenia',
    damageType: n.damageType || 'magical',
    ignoresArmor: n.ignoresArmor,
    statusEffects: n.statusEffects,
    saveAttribute: n.saveAttribute,
    saveSkill: n.saveSkill,
    requirements: { race: n.requiresRace, talent: n.requiresTalent, discipline: n.requiresDiscipline },
    isSuperspell: n.isSuperspell,
    requiresGroupCast: n.requiresGroupCast,
    minCasters: n.minCasters,
    nonCombatOnly: n.nonCombatOnly,
    overcastOptions: n.overcast.map((description) => ({ description, manaPerStep: 1 })),
    triggers: n.triggers,
  };
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  const files = readdirSync(dirPath);

  for (const file of files) {
    const fullPath = resolve(dirPath, file);
    if (statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.md')) {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

export const parseSpells: ParserFn = async (ctx: ParserContext): Promise<ParsedDoc[]> => {
  const docs: ParsedDoc[] = [];
  const spellsDir = resolve(ctx.repoRoot, 'ObsidianNotes', 'spells');

  let files: string[] = [];
  try {
    files = getAllFiles(spellsDir);
  } catch (e) {
    console.warn('[spell-parser] No ObsidianNotes/spells directory found or unreadable.');
    return docs;
  }

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const match = text.match(/^---\r?\n([\s\S]+?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) continue;

    const [_, frontmatterRaw, bodyRaw] = match;
    let frontmatter: any;
    try {
      frontmatter = yaml.load(frontmatterRaw);
    } catch (e) {
      if (ctx.strict) throw new Error(`[spell-parser] Invalid YAML in ${file}: ${e}`);
      continue;
    }

    const body = bodyRaw.trim();
    const nameMatch = body.match(/^#\s+(.+)$/m);
    const spellName = nameMatch ? nameMatch[1].trim() : basename(file, '.md');
    const description = body.replace(/^#\s+.+$/m, '').trim();

    const parsed = SpellNoteSchema.safeParse(frontmatter);
    if (!parsed.success) {
      if (ctx.strict) throw new Error(`[spell-parser] Validation failed for "${file}": ${parsed.error.message}`);
      continue;
    }

    const baseId = basename(file, '.md');

    let pack = 'spells-academic';
    const relativePath = file.substring(spellsDir.length).replace(/\\/g, '/');
    if (relativePath.includes('/general/')) pack = 'spells-general';
    else if (relativePath.includes('/sacred/')) pack = 'spells-sacred';
    else if (relativePath.includes('/eldritch/')) pack = 'spells-eldritch';
    else if (relativePath.includes('/crimson/')) pack = 'spells-crimson';
    else if (relativePath.includes('/blood/')) pack = 'spells-blood';

    docs.push({
      id: baseId,
      name: spellName,
      documentType: 'Item',
      subType: 'spell',
      pack,
      source: { book: parsed.data.sourceBook, chapter: 'Spells', line: 1 },
      system: { ...toSystem(parsed.data), description },
      description,
    });
  }

  return docs;
};
