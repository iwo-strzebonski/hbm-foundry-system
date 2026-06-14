import { resolve, basename } from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { ParsedDoc, ParserContext, ParserFn, SourceBookId } from './types';
import { slugify } from './helpers';
import yaml from 'js-yaml';

/** Looser zod schema - mirrors `SpellData` defaults; build pipeline converts to system payload. */
const SpellSystemSchema = z.object({
  castingMode: z.enum(['standard', 'sacred', 'witch', 'blood']),
  school: z.string(),
  deity: z.string().default(''),
  sourceBook: z.string(),
  manaCost: z.number().int().min(0),
  bloodCost: z.number().int().min(0).default(0),
  complexityLevel: z.number().int().min(0).default(0),
  isSuperspell: z.boolean().default(false),
  requiresGroupCast: z.boolean().default(false),
  minCasters: z.number().int().min(1).default(1),
  nonCombatOnly: z.boolean().default(false),
  damageBase: z.string().default(''),
  damageType: z.string().default(''),
  ignoresArmor: z.boolean().default(false),
  statusEffects: z.array(z.string()).default([]),
  saveAttribute: z.string().default(''),
  saveSkill: z.string().default(''),
  triggers: z.array(z.object({ event: z.string(), effect: z.string() })).default([]),
  components: z.object({
    verbal: z.boolean().default(false),
    somatic: z.boolean().default(false),
    material: z.string().default(''),
    symbols: z.array(z.string()).default([]),
  }),
  requirements: z.object({
    race: z.array(z.string()).default([]),
    talent: z.array(z.string()).default([]),
    discipline: z.array(z.string()).default([]),
  }),
  difficulty: z.object({
    threshold: z.number().int().min(1).max(6),
    successes: z.number().int().min(1),
  }),
  range: z.object({
    kind: z.string(),
    value: z.number().optional(),
    unit: z.string().optional(),
    text: z.string().optional(),
  }),
  duration: z.string().default(''),
  castingTime: z.string().default(''),
  target: z.string().default(''),
  areaOfEffect: z
    .object({ shape: z.string(), x: z.number().optional(), y: z.number().optional(), unit: z.string().optional() })
    .nullable()
    .default(null),
  overcastOptions: z
    .array(z.object({ text: z.string(), repeatable: z.boolean().default(true), cost: z.number().int().default(0) }))
    .default([]),
  description: z.string().default(''),
});

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

    const payload = { ...frontmatter, description: bodyRaw.trim() };

    const nameMatch = payload.description.match(/^#\s+(.+)$/m);
    const spellName = nameMatch ? nameMatch[1].trim() : basename(file, '.md');
    payload.description = payload.description.replace(/^#\s+.+$/m, '').trim();

    const parsed = SpellSystemSchema.safeParse(payload);
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
      system: parsed.data,
      description: payload.description,
    });
  }

  return docs;
};
