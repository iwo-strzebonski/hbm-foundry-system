/**
 * Runiczny Pancerz – a single hit of more than 5 damage disables 1 point (logic/damage.ts); disabled
 * points return at the end of the fight or can be restored as an Akcja Natychmiastowa. The cost
 * depends on the source: Amulet Osłony takes 2 Many per point. Only Rozerwanie Run destroys a point
 * permanently (it lowers `magicalArmor.max`).
 */

import type { CastableActor } from './spell-cast';
import { runicArmorManaCost, runicArmorRestorable } from './rules';

/** End of fight: every disabled point returns. */
export async function restoreAllRunicArmor(actor: CastableActor): Promise<number> {
  const armor = (actor.system.attributes as any).magicalArmor as { value: number; max: number } | undefined;
  if (!armor || armor.value >= armor.max) return 0;
  await actor.update({ 'system.attributes.magicalArmor.value': armor.max });
  return armor.max - armor.value;
}

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
