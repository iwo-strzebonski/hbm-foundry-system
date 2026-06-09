/**
 * Migration to v0.4.0 SpellData schema (numbered 0.2.0 per planning doc).
 *
 * Operations:
 *  - For each Item of type 'spell' (in world & embedded on actors):
 *      • If `components.symbols` is empty AND `complexityLevel > 0`,
 *        leave symbols empty (cannot infer names) but log so user can fix.
 *      • If `targets` matches a recognised AoE pattern, populate `areaOfEffect`.
 *      • If legacy `overcasting` text is non-empty AND `overcastOptions` is empty,
 *        seed `overcastOptions[0] = { description: <text>, manaPerStep: 1 }`.
 *  - Add `attributes.blood = { value: 0, max: 0 }` to characters missing it
 *    (DataModel default usually handles this; explicit safety net).
 */

import { SYSTEM_ID } from '../hbm';
import type { MigrationStep } from './index';

interface LegacySpellSystem {
  targets?: string;
  overcasting?: string;
  overcastOptions?: Array<{ description: string; manaPerStep: number }>;
  areaOfEffect?: { shape: string; x: number; y: number; unit: string };
  components?: { symbols?: string[] };
  complexityLevel?: number;
}

const AOE_PATTERNS: Array<{ re: RegExp; build: (m: RegExpMatchArray) => { shape: string; x: number; y: number; unit: string } }> = [
  // "3 × 8 m" / "3x8 m" → rectangle
  { re: /(\d+)\s*[×x]\s*(\d+)\s*m/i,    build: (m) => ({ shape: 'rectangle', x: Number(m[1]), y: Number(m[2]), unit: 'm' }) },
  // "promień 5 m" → sphere
  { re: /promień\s+(\d+)\s*m/i,          build: (m) => ({ shape: 'sphere',    x: Number(m[1]), y: 0, unit: 'm' }) },
  // "stożek 10 m" → cone
  { re: /stoż\w+\s+(\d+)\s*m/i,          build: (m) => ({ shape: 'cone',      x: Number(m[1]), y: 0, unit: 'm' }) },
  // "linia 15 m" → line
  { re: /linia\s+(\d+)\s*m/i,            build: (m) => ({ shape: 'line',      x: Number(m[1]), y: 0, unit: 'm' }) },
];

function migrateSpellDoc(doc: any): Record<string, unknown> | null {
  const sys = (doc.system ?? {}) as LegacySpellSystem;
  const updates: Record<string, unknown> = {};
  let dirty = false;

  // AoE inference
  const isPoint = !sys.areaOfEffect || (sys.areaOfEffect.shape === 'point' && !sys.areaOfEffect.x);
  if (isPoint && sys.targets) {
    for (const { re, build } of AOE_PATTERNS) {
      const m = sys.targets.match(re);
      if (m) {
        updates['system.areaOfEffect'] = build(m);
        dirty = true;
        break;
      }
    }
  }

  // Overcast text → structured option
  const noStructuredOvercast = !sys.overcastOptions || sys.overcastOptions.length === 0;
  if (sys.overcasting && noStructuredOvercast) {
    updates['system.overcastOptions'] = [{ description: sys.overcasting, manaPerStep: 1 }];
    dirty = true;
  }

  // Witch symbols audit log
  if ((sys.complexityLevel ?? 0) > 0 && (!sys.components?.symbols || sys.components.symbols.length === 0)) {
    console.warn(`${SYSTEM_ID} | Spell "${doc.name}" has complexityLevel=${sys.complexityLevel} but no symbols list; please populate components.symbols manually.`);
  }

  return dirty ? updates : null;
}

async function migrateAllSpells(): Promise<void> {
  // World items
  const worldItems = (game.items?.contents ?? []) as any[];
  for (const item of worldItems) {
    if (item.type !== 'spell') continue;
    const updates = migrateSpellDoc(item);
    if (updates) await item.update(updates);
  }

  // Actor-embedded items
  const actors = (game.actors?.contents ?? []) as any[];
  for (const actor of actors) {
    const items = (actor.items?.contents ?? []) as any[];
    for (const item of items) {
      if (item.type !== 'spell') continue;
      const updates = migrateSpellDoc(item);
      if (updates) await item.update(updates);
    }
  }
}

async function ensureBloodPool(): Promise<void> {
  const actors = (game.actors?.contents ?? []) as any[];
  for (const actor of actors) {
    if (actor.type !== 'character') continue;
    const blood = actor.system?.attributes?.blood;
    if (!blood || typeof blood.max !== 'number') {
      await actor.update({ 'system.attributes.blood': { value: 0, max: 0 } });
    }
  }
}

export const migration_0_2_0: MigrationStep = {
  version: '0.4.0',
  description: 'Expand SpellData schema, add Blood Pool to characters',
  run: async () => {
    await migrateAllSpells();
    await ensureBloodPool();
  },
};
