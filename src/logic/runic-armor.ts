/**
 * Runiczny Pancerz – restoring points with Mana (Amulet Osłony: Akcja, 2 Many za punkt).
 * Degradation (every 5 absorbed damage, `runicCounter`) lives in logic/damage.ts.
 */

import type { CastableActor } from './spell-cast';
import { runicArmorManaCost, runicArmorRestorable } from './rules';

export interface RunicRestoreResult {
  ok: boolean;
  restored: number;
  manaSpent: number;
  reason?: string;
}

/**
 * Spend Mana to restore up to `points` points of Runiczny Pancerz (capped at its max).
 * Fails with `insufficient-mana` when the pool cannot pay for every requested point;
 * pass `partial: true` to restore as many points as the pool affords instead.
 */
export async function rechargeRunicArmor(
  actor: CastableActor,
  points: number,
  opts: { partial?: boolean } = {},
): Promise<RunicRestoreResult> {
  const a = actor.system.attributes as any;
  const armor = a.magicalArmor as { value: number; max: number } | undefined;
  if (!armor) return { ok: false, restored: 0, manaSpent: 0, reason: 'no-runic-armor' };

  let restored = runicArmorRestorable(armor.value, armor.max, points);
  if (restored <= 0) return { ok: false, restored: 0, manaSpent: 0, reason: 'already-full' };

  const mana = Number(a.mana?.value) || 0;
  if (runicArmorManaCost(restored) > mana) {
    if (!opts.partial) return { ok: false, restored: 0, manaSpent: 0, reason: 'insufficient-mana' };
    restored = runicArmorRestorable(armor.value, armor.max, Math.floor(mana / runicArmorManaCost(1)));
    if (restored <= 0) return { ok: false, restored: 0, manaSpent: 0, reason: 'insufficient-mana' };
  }

  const manaSpent = runicArmorManaCost(restored);
  await actor.update({
    'system.attributes.magicalArmor.value': armor.value + restored,
    'system.attributes.mana.value': mana - manaSpent,
  });
  return { ok: true, restored, manaSpent };
}
