/**
 * Magia Krwi - Blood Magic logic (Arcanum Sanguinis).
 *
 * Krew sources and sinks follow the vault (Foundry Sync Brief §17):
 *   - selfHarm            Samookaleczenie (Akcja) / Większe Samookaleczenie (Akcja Natychmiastowa)
 *   - useLifeSteal / resolveLifeSteal   Kradzież Życia / Większa Kradzież Życia (1 Zapał)
 *   - sacrifice / greatSacrifice        Złożenie w Ofierze / Wielka Ofiara (1 Zapał)
 *   - absorbBlood         Wchłanianie Krwi / Większe Wchłanianie Krwi
 *   - gainKrewFromWeaponDamage          passive gain (Szacunek do Życia, Krwisty Pojedynkowicz)
 *   - startOfFightKrew / endOfFightKrew Rytualista Krwi start pool, leftover Krew heals
 *
 * Per-round limits live in `attributes.bloodUsed` (reset every round by logic/combat.ts);
 * Wielka Ofiara is once per day (`attributes.greatSacrificeUsed`, reset by Długi Odpoczynek).
 * The cast pipeline (logic/spell-cast.ts) deducts `bloodCost` directly.
 */

import { getMagicPowerEntry } from '../constants';
import type { CastableActor } from './spell-cast';
import {
  bloodAbsorbHp,
  bloodToZeal,
  greatSacrificeResult,
  krewFromLifeSteal,
  krewFromSelfHarm,
  krewFromWeaponHpLoss,
  sacrificeResult,
  startingKrew,
  type KrewTalent,
} from './rules';

const SELF_HARM_THRESHOLD = 2;
const FLAG_SCOPE = 'hbm-rpg-v3';

interface ActorWithItems extends CastableActor {
  items?: Iterable<{ type: string; system?: { slug?: string } }>;
}

export type BloodAction = 'selfHarm' | 'lifeSteal' | 'sacrifice' | 'absorb';

/** Talent that decides passive Krew gain / starting pool, if any. */
export function krewTalent(actor: CastableActor): KrewTalent | null {
  const items = (actor as ActorWithItems).items;
  if (!items) return null;
  let found: KrewTalent | null = null;
  for (const it of items) {
    if (it.type !== 'talent') continue;
    const slug = (it as any).system?.slug ?? (it as any).flags?.[FLAG_SCOPE]?.slug;
    if (slug === 'rytualista-krwi') return 'rytualista-krwi';
    if (slug === 'krwisty-pojedynkowicz') found = 'krwisty-pojedynkowicz';
    else if ((slug === 'respect-for-life' || slug === 'szacunek-do-zycia') && !found) found = 'respect-for-life';
  }
  return found;
}

function hasTalent(actor: CastableActor, ...slugs: string[]): boolean {
  const items = (actor as ActorWithItems).items;
  if (!items) return false;
  for (const it of items) {
    if (it.type === 'talent' && slugs.includes((it as any).system?.slug ?? (it as any).flags?.[FLAG_SCOPE]?.slug)) return true;
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

function used(actor: CastableActor, action: BloodAction): number {
  return Number((actor.system.attributes as any).bloodUsed?.[action]) || 0;
}

function bump(action: BloodAction, actor: CastableActor): Record<string, number> {
  return { [`system.attributes.bloodUsed.${action}`]: used(actor, action) + 1 };
}

function addKrew(blood: { value: number; max: number }, amount: number): number {
  return Math.max(0, Math.min(blood.max, blood.value + amount) - blood.value);
}

/** Magia dice + Walka Wręcz skill, threshold `threshold` – returns the Sukcesy. */
export async function rollMagicMelee(actor: CastableActor, threshold: number): Promise<number> {
  const attrs = actor.system.attributes as any;
  const magic = attrs.magic ?? {};
  const dice = typeof magic.dicePool === 'number'
    ? magic.dicePool
    : getMagicPowerEntry(magic.actual ?? magic.value ?? 0).dicePool;
  const skill = (actor.system.skills as any)?.melee?.value ?? 0;
  const { HbmTSRoll } = await import('../dice/ts-roll'); // lazy: needs Foundry's Roll at runtime only
  const roll = HbmTSRoll.fromParams({ pool: dice + skill, threshold, required: 1, flavor: 'Magia (Walka Wręcz)' });
  await roll.evaluate();
  await roll.toMessage({ flavor: 'Magia (Walka Wręcz)' });
  return roll.ts?.successes ?? 0;
}

type SuccessRoller = (actor: CastableActor, threshold: number) => Promise<number>;

export interface BloodActionResult {
  ok: boolean;
  successes?: number;
  hpLost?: number;
  hpGained?: number;
  krewGained: number;
  reason?: string;
}

const fail = (reason: string): BloodActionResult => ({ ok: false, krewGained: 0, reason });

/**
 * Samookaleczenie (Akcja, once per round): Test Magia (Walka Wręcz) T=2; lose HP = Sukcesy,
 * gain 1 Krew per HP. Większe Samookaleczenie (Krwisty Pojedynkowicz, Akcja Natychmiastowa): 2 Krew per HP.
 */
export async function selfHarm(
  actor: CastableActor,
  opts: { greater?: boolean; roller?: SuccessRoller } = {},
): Promise<BloodActionResult> {
  const a = actor.system.attributes as any;
  if (!a.blood) return fail('no-blood-pool');
  if (opts.greater && !hasTalent(actor, 'wieksze-samookaleczenie', 'krwisty-pojedynkowicz')) return fail('missing-talent');
  if (used(actor, 'selfHarm') >= 1) return fail('already-used');
  const successes = await (opts.roller ?? rollMagicMelee)(actor, SELF_HARM_THRESHOLD);
  const hpLost = Math.min(successes, Math.max(0, a.health?.value ?? 0));
  const krewGained = addKrew(a.blood, krewFromSelfHarm(hpLost, !!opts.greater));
  await actor.update({
    'system.attributes.health.value': (a.health?.value ?? 0) - hpLost,
    'system.attributes.blood.value': a.blood.value + krewGained,
    ...bump('selfHarm', actor),
  });
  return { ok: true, successes, hpLost, krewGained };
}

async function spendZeal(actor: CastableActor, amount: number): Promise<boolean> {
  const zeal = (actor.system.attributes as any).zeal;
  if (!zeal || zeal.value < amount) return false;
  await actor.update({ 'system.attributes.zeal.value': zeal.value - amount });
  return true;
}

/**
 * Kradzież Życia: 1 Zapał, free Akcja Natychmiastowa (outside the normal limit), once per round
 * (Większa Kradzież Życia: twice per round, two steps easier). Arms the next attack; call
 * `resolveLifeSteal` with the Żywotność the target actually lost.
 */
export async function useLifeSteal(actor: CastableActor, opts: { greater?: boolean } = {}): Promise<{ ok: boolean; stepsEasier: number; reason?: string }> {
  const limit = opts.greater ? 2 : 1;
  if (!(actor.system.attributes as any).blood) return { ok: false, stepsEasier: 0, reason: 'no-blood-pool' };
  if (opts.greater && !hasTalent(actor, 'wieksza-kradziez-zycia')) return { ok: false, stepsEasier: 0, reason: 'missing-talent' };
  if (used(actor, 'lifeSteal') >= limit) return { ok: false, stepsEasier: 0, reason: 'already-used' };
  if (!(await spendZeal(actor, 1))) return { ok: false, stepsEasier: 0, reason: 'insufficient-zeal' };
  const stepsEasier = opts.greater ? 2 : 1;
  await actor.update(bump('lifeSteal', actor));
  await (actor as any).setFlag?.(FLAG_SCOPE, 'lifeSteal', { stepsEasier, greater: !!opts.greater });
  return { ok: true, stepsEasier };
}

/** Kradzież Życia payout: 1 Krew (2 greater) per Żywotność the target actually lost. */
export async function resolveLifeSteal(actor: CastableActor, hpActuallyLost: number): Promise<number> {
  const pending = (actor as any).getFlag?.(FLAG_SCOPE, 'lifeSteal') as { greater?: boolean } | undefined;
  const blood = (actor.system.attributes as any).blood;
  if (!pending || !blood) return 0;
  const gained = addKrew(blood, krewFromLifeSteal(hpActuallyLost, !!pending.greater));
  if (gained > 0) await actor.update({ 'system.attributes.blood.value': blood.value + gained });
  await (actor as any).unsetFlag?.(FLAG_SCOPE, 'lifeSteal');
  return gained;
}

/**
 * Złożenie w Ofierze: 1 Zapał, free Akcja Natychmiastowa, once per round. Triggers when your attack
 * kills a target with a slashing / piercing wound within 1 m. `successes` are the Sukcesy of the
 * killing attack's Test: heal Sukcesy + Magia, gain Krew = Sukcesy.
 */
export async function sacrifice(actor: CastableActor, successes: number): Promise<BloodActionResult> {
  const a = actor.system.attributes as any;
  if (!a.blood) return fail('no-blood-pool');
  if (used(actor, 'sacrifice') >= 1) return fail('already-used');
  if (hasTalent(actor, 'wielka-ofiara', 'rytualista-krwi')) return fail('replaced-by-wielka-ofiara');
  if (!(await spendZeal(actor, 1))) return fail('insufficient-zeal');
  const res = sacrificeResult(successes, a.magic?.actual ?? a.magic?.value ?? 0);
  const hpGained = Math.min(res.heal, Math.max(0, (a.health?.max ?? 0) - (a.health?.value ?? 0)));
  const krewGained = addKrew(a.blood, res.krew);
  await actor.update({
    'system.attributes.health.value': (a.health?.value ?? 0) + hpGained,
    'system.attributes.blood.value': a.blood.value + krewGained,
    ...bump('sacrifice', actor),
  });
  return { ok: true, successes, hpGained, krewGained };
}

/**
 * Wielka Ofiara (Rytualista Krwi; replaces Złożenie w Ofierze): 1 Zapał, once per day, target within 1 m
 * is being attacked. Sukcesy above the target's highest Atrybut → the target loses all Żywotność
 * (returned as `targetHpLost`, the caller applies it); otherwise the mage heals Sukcesy.
 */
export async function greatSacrifice(
  actor: CastableActor,
  successes: number,
  target: { highestAttribute: number; health: number },
): Promise<BloodActionResult & { kills?: boolean; targetHpLost?: number }> {
  const a = actor.system.attributes as any;
  if (!a.blood) return fail('no-blood-pool');
  if (!hasTalent(actor, 'wielka-ofiara', 'rytualista-krwi')) return fail('missing-talent');
  if (Number(a.greatSacrificeUsed) >= 1) return fail('already-used');
  if (!(await spendZeal(actor, 1))) return fail('insufficient-zeal');
  const res = greatSacrificeResult(successes, target.highestAttribute, target.health);
  const hpGained = Math.min(res.heal, Math.max(0, (a.health?.max ?? 0) - (a.health?.value ?? 0)));
  const krewGained = addKrew(a.blood, res.krew);
  await actor.update({
    'system.attributes.health.value': (a.health?.value ?? 0) + hpGained,
    'system.attributes.blood.value': a.blood.value + krewGained,
    'system.attributes.greatSacrificeUsed': 1,
  });
  return { ok: true, successes, hpGained, krewGained, kills: res.kills, targetHpLost: res.kills ? target.health : 0 };
}

/**
 * Wchłanianie Krwi (Akcja, once per round, min. 1 Krew): 2 HP per Krew.
 * Większe Wchłanianie Krwi (Akcja Natychmiastowa): 3 HP per Krew, or 5 Krew → 1 Zapał.
 */
export async function absorbBlood(
  actor: CastableActor,
  bloodSpent: number,
  opts: { greater?: boolean; asZeal?: boolean } = {},
): Promise<{ ok: boolean; hpGained: number; zealGained: number; reason?: string }> {
  const a = actor.system.attributes as any;
  if (bloodSpent < 1) return { ok: false, hpGained: 0, zealGained: 0, reason: 'minimum-one-blood' };
  if (!a.blood || a.blood.value < bloodSpent) return { ok: false, hpGained: 0, zealGained: 0, reason: 'insufficient-blood' };
  if (!opts.greater && used(actor, 'absorb') >= 1) return { ok: false, hpGained: 0, zealGained: 0, reason: 'already-used' };
  const update: Record<string, number> = { 'system.attributes.blood.value': a.blood.value - bloodSpent };
  let hpGained = 0;
  let zealGained = 0;
  if (opts.greater && opts.asZeal) {
    zealGained = Math.min(bloodToZeal(bloodSpent), Math.max(0, (a.zeal?.max ?? 0) - (a.zeal?.value ?? 0)));
    update['system.attributes.zeal.value'] = (a.zeal?.value ?? 0) + zealGained;
  } else {
    hpGained = Math.min(bloodAbsorbHp(bloodSpent, !!opts.greater), Math.max(0, (a.health?.max ?? 0) - (a.health?.value ?? 0)));
    update['system.attributes.health.value'] = (a.health?.value ?? 0) + hpGained;
  }
  if (!opts.greater) Object.assign(update, bump('absorb', actor));
  await actor.update(update);
  return { ok: true, hpGained, zealGained };
}

/**
 * Passive Krew (talents): 1 per 4 HP lost (Szacunek do Życia) / 1 per 2 HP (Krwisty Pojedynkowicz),
 * by either side, only from slashing or piercing weapons. Call for the victim and the attacker.
 */
export async function gainKrewFromWeaponDamage(actor: CastableActor, hpLost: number): Promise<number> {
  const blood = (actor.system.attributes as any)?.blood;
  if (!blood) return 0;
  const gained = addKrew(blood, krewFromWeaponHpLoss(hpLost, krewTalent(actor)));
  if (gained > 0) await actor.update({ 'system.attributes.blood.value': blood.value + gained });
  return gained;
}

/** Start of a fight: Krew pool resets to 0 (Rytualista Krwi: 4) for blood-talent holders. */
export async function startOfFightKrew(actor: CastableActor): Promise<void> {
  const talent = krewTalent(actor);
  const blood = (actor.system.attributes as any)?.blood;
  if (!talent || !blood) return;
  const target = Math.min(blood.max, startingKrew(talent));
  if (blood.value !== target) await actor.update({ 'system.attributes.blood.value': target });
}

/** End of a fight: leftover Krew vanishes and heals the mage as Wchłanianie Krwi (2 HP per Krew). */
export async function endOfFightKrew(actor: CastableActor): Promise<number> {
  const a = actor.system.attributes as any;
  if (!krewTalent(actor) || !a.blood || a.blood.value <= 0) return 0;
  const hpGained = Math.min(bloodAbsorbHp(a.blood.value, false), Math.max(0, (a.health?.max ?? 0) - (a.health?.value ?? 0)));
  await actor.update({
    'system.attributes.blood.value': 0,
    'system.attributes.health.value': (a.health?.value ?? 0) + hpGained,
  });
  return hpGained;
}
