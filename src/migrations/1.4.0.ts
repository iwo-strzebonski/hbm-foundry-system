/**
 * Migration to v1.4.0 (vault sync 2026-10-20).
 *
 * Operations:
 *  - Backfill the new per-rest / per-round counters
 *    (`manaBorrowed`, `breathersTaken`, `immediateActionsUsed`) on characters and NPCs.
 *  - Rename the slug flag of embedded Zeus spells "aegis" → "aegis-zeus"
 *    (the general Aegis spell keeps "aegis").
 *
 * Magic power levels III/IV swapped their daily mana (24/21) in constants only;
 * stored levels are unchanged and mana.max is derived, so no data change is needed.
 */

import type { MigrationStep } from './index';

const FLAG_SCOPE = 'hbm-rpg-v3';

async function backfillCounters(): Promise<void> {
  for (const a of (game.actors?.contents ?? []) as any[]) {
    const attrs = a.system?.attributes;
    if (!attrs) continue;
    const update: Record<string, unknown> = {};
    if (attrs.manaBorrowed == null) update['system.attributes.manaBorrowed'] = 0;
    if (attrs.immediateActionsUsed == null) update['system.attributes.immediateActionsUsed'] = 0;
    if (a.type === 'character' && attrs.breathersTaken == null) update['system.attributes.breathersTaken'] = 0;
    if (Object.keys(update).length > 0) await a.update(update);
  }
}

function isZeusAegis(item: any): boolean {
  return item?.type === 'spell'
    && item.flags?.[FLAG_SCOPE]?.slug === 'aegis'
    && item.system?.deity === 'zeus';
}

async function renameZeusAegis(): Promise<void> {
  const fix = async (item: any) => {
    if (isZeusAegis(item)) await item.update({ [`flags.${FLAG_SCOPE}.slug`]: 'aegis-zeus' });
  };
  for (const it of (game.items?.contents ?? []) as any[]) await fix(it);
  for (const a of (game.actors?.contents ?? []) as any[]) {
    for (const it of a.items ?? []) await fix(it);
  }
}

export const migration_1_4_0: MigrationStep = {
  version: '1.4.0',
  description: 'v1.4.0: borrowed-mana / breather / immediate-action counters, Zeus Aegis slug',
  async run() {
    await backfillCounters();
    await renameZeusAegis();
  },
};
