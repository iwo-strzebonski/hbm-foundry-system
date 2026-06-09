/**
 * Migration to v1.2.0.
 *
 * Operations:
 *  - Set default `flags['hbm-rpg-v3'].zealRegenBonus = 0` on all character actors
 *    that don't have it (so the combat-turn helper can always read a number).
 *  - Backfill NPC `attributes.{mana, zeal, blood}` for any NPC actors stored
 *    pre-v1.1.2 (the schema defaults handle it on read, but persist on save).
 *  - Best-effort: scan world & embedded talents for descriptions matching
 *    "+1 Zapał" / "regeneracja zapału" and attach a transferable ActiveEffect
 *    that adds `flags.hbm-rpg-v3.zealRegenBonus = 1` (only if no AE present).
 */

import type { MigrationStep } from './index';

const ZEAL_REGEN_PATTERNS = [
  /\+\s*1\s*zapa[łl]/i,
  /regeneracj\w+\s+zapa[łl]u/i,
  /odzyskuje\s+\+?1\s+zapa[łl]/i,
];

function shouldAttachZealRegenAE(item: any): boolean {
  if (item?.type !== 'talent') return false;
  const text = `${item.system?.description ?? ''} ${item.system?.effect ?? ''}`;
  if (!text.trim()) return false;
  if (!ZEAL_REGEN_PATTERNS.some((re) => re.test(text))) return false;
  // Skip if this talent already has an AE targeting the flag.
  for (const ef of item.effects ?? []) {
    for (const ch of ef.changes ?? []) {
      if (ch.key === 'flags.hbm-rpg-v3.zealRegenBonus') return false;
    }
  }
  return true;
}

async function attachZealRegenAE(item: any): Promise<void> {
  await item.createEmbeddedDocuments('ActiveEffect', [{
    name: '+1 regeneracja Zapału',
    icon: 'icons/svg/lightning.svg',
    transfer: true,
    disabled: false,
    changes: [{
      key: 'flags.hbm-rpg-v3.zealRegenBonus',
      value: '1',
      mode: 2, // CONST.ACTIVE_EFFECT_MODES.ADD
      priority: 20,
    }],
  }]);
}

async function migrateActorFlags(): Promise<void> {
  const actors = (game.actors?.contents ?? []) as any[];
  for (const a of actors) {
    if (a.type !== 'character') continue;
    const cur = a.getFlag?.('hbm-rpg-v3', 'zealRegenBonus');
    if (cur == null) {
      await a.setFlag('hbm-rpg-v3', 'zealRegenBonus', 0);
    }
  }
}

async function migrateTalents(): Promise<void> {
  // World talents
  const worldItems = (game.items?.contents ?? []) as any[];
  for (const it of worldItems) {
    if (shouldAttachZealRegenAE(it)) await attachZealRegenAE(it);
  }
  // Actor-embedded talents
  const actors = (game.actors?.contents ?? []) as any[];
  for (const a of actors) {
    for (const it of a.items ?? []) {
      if (shouldAttachZealRegenAE(it)) await attachZealRegenAE(it);
    }
  }
}

async function backfillNpcResources(): Promise<void> {
  const actors = (game.actors?.contents ?? []) as any[];
  for (const a of actors) {
    if (a.type !== 'npc') continue;
    const sys = a.system as any;
    const update: Record<string, unknown> = {};
    if (sys.attributes?.mana == null) update['system.attributes.mana'] = { value: 0, max: 0, maxPerSpell: 0 };
    if (sys.attributes?.zeal == null) update['system.attributes.zeal'] = { value: 0, max: 0 };
    if (sys.attributes?.blood == null) update['system.attributes.blood'] = { value: 0, max: 0 };
    if (Object.keys(update).length > 0) await a.update(update);
  }
}

export const migration_1_2_0: MigrationStep = {
  version: '1.2.0',
  description: 'v1.2.0: zealRegenBonus flag, NPC resource backfill, ActiveEffect attachment for +1 Zeal talents',
  async run() {
    await migrateActorFlags();
    await backfillNpcResources();
    await migrateTalents();
  },
};
