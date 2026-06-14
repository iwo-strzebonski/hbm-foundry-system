/**
 * Magia Krwi - Blood Magic logic (Arcanum Sanguinis Ch. III).
 *
 * Three primitives:
 *   - spendBlood(actor, n)       : deduct n from blood pool, fail if insufficient.
 *   - selfHarm(actor, hp)        : convert hp → blood at 2:1 ratio (2 HP → 1 Blood).
 *   - lifeStealOnDamage(...)     : when actor inflicts damage with a blood spell,
 *                                  restore blood = floor(damage / 4) (capped at max).
 *
 * Future hook: `Szacunek do Życia` talent triples self-harm cost (6 HP → 1 Blood).
 *
 * The cast pipeline (logic/spell-cast.ts) already deducts `bloodCost` directly;
 * this module is the reusable API surface for UI dialogs and the damage hook.
 */

import type { CastableActor } from './spell-cast';

const SELF_HARM_RATIO = 2;          // HP per 1 Blood
const RESPECT_FOR_LIFE_PENALTY = 3;  // multiplier when talent present
const LIFE_STEAL_DIVISOR = 4;        // damage / N → blood restored

interface ActorWithItems extends CastableActor {
  items?: Iterable<{ type: string; system?: { slug?: string } }>;
}

function hasRespectForLife(actor: ActorWithItems): boolean {
  if (!actor.items) return false;
  for (const it of actor.items) {
    if (it.type !== 'talent') continue;
    const slug = (it as any).system?.slug ?? (it as any).flags?.['hbm-rpg-v3']?.slug;
    if (slug === 'respect-for-life' || slug === 'szacunek-do-zycia') return true;
  }
  return false;
}

export interface BloodSpendResult {
  ok: boolean;
  spent: number;
  remaining: number;
  reason?: string;
}

/** Deduct `amount` from `actor.system.attributes.blood.value`. */
export async function spendBlood(actor: CastableActor, amount: number): Promise<BloodSpendResult> {
  const blood = actor.system.attributes.blood;
  if (!blood) return { ok: false, spent: 0, remaining: 0, reason: 'no-blood-pool' };
  if (amount <= 0) return { ok: true, spent: 0, remaining: blood.value };
  if (blood.value < amount) {
    return { ok: false, spent: 0, remaining: blood.value, reason: 'insufficient-blood' };
  }
  await actor.update({ 'system.attributes.blood.value': blood.value - amount });
  return { ok: true, spent: amount, remaining: blood.value - amount };
}

/**
 * Self-Harm: convert health into blood. Returns blood gained.
 * Default ratio 2 HP → 1 Blood; with `Szacunek do Życia` talent → 6 HP → 1 Blood.
 */
export async function selfHarm(actor: CastableActor, hpSpent: number): Promise<{ ok: boolean; bloodGained: number; reason?: string }> {
  if (hpSpent <= 0) return { ok: true, bloodGained: 0 };
  const a = actor.system.attributes;
  const blood = a.blood;
  if (!blood) return { ok: false, bloodGained: 0, reason: 'no-blood-pool' };
  const health = (a as any).health as { value: number; max: number } | undefined;
  if (!health || health.value < hpSpent) {
    return { ok: false, bloodGained: 0, reason: 'insufficient-health' };
  }
  const ratio = hasRespectForLife(actor as ActorWithItems) ? SELF_HARM_RATIO * RESPECT_FOR_LIFE_PENALTY : SELF_HARM_RATIO;
  const gained = Math.floor(hpSpent / ratio);
  if (gained <= 0) return { ok: false, bloodGained: 0, reason: 'ratio-too-low' };
  const newBlood = Math.min(blood.max, blood.value + gained);
  await actor.update({
    'system.attributes.health.value': health.value - hpSpent,
    'system.attributes.blood.value': newBlood,
  });
  return { ok: true, bloodGained: newBlood - blood.value };
}

/** Life Steal: invoked from the damage-application hook when the source is a blood spell. */
export async function lifeStealOnDamage(actor: CastableActor, damageDealt: number): Promise<number> {
  if (damageDealt <= 0) return 0;
  const blood = actor.system.attributes.blood;
  if (!blood) return 0;
  const restore = Math.floor(damageDealt / LIFE_STEAL_DIVISOR);
  if (restore <= 0) return 0;
  const newBlood = Math.min(blood.max, blood.value + restore);
  await actor.update({ 'system.attributes.blood.value': newBlood });
  return newBlood - blood.value;
}
