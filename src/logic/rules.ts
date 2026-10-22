/**
 * Pure rule helpers from the 2026-10-20 vault sync (Foundry Sync Brief).
 * No Foundry globals here, so everything is unit-testable.
 *
 * Rounding convention: everything fractional rounds UP, except
 *   - new-spell mana cost (nearest, min 1),
 *   - Nadczarowanie bonus from level 3 (halved, DOWN, min 1),
 *   - fire damage with Hartowany w Ogniu (halved, DOWN).
 */

/** Odetchnięcie: at most twice between two Długie Odpoczynki. */
export const MAX_BREATHERS_BETWEEN_LONG_RESTS = 2;

/** Pożyczanie Many (Wyczerpanie Many) – tier table, N d6 summed. */
export const MANA_EXHAUSTION_TIERS = [
  { min: 1, max: 4, id: 'zdyszanie', label: 'Zdyszanie' },
  { min: 5, max: 8, id: 'zmeczenie', label: 'Zmęczenie' },
  { min: 9, max: 12, id: 'wyczerpanie', label: 'Wyczerpanie' },
  { min: 13, max: 16, id: 'zalamanie-sil', label: 'Załamanie Sił' },
  { min: 17, max: 20, id: 'zapasc', label: 'Zapaść' },
  { min: 21, max: 24, id: 'ciezka-zapasc', label: 'Ciężka Zapaść' },
  { min: 25, max: Infinity, id: 'wypalenie', label: 'Wypalenie' },
] as const;

export function manaExhaustionTier(total: number) {
  return MANA_EXHAUSTION_TIERS.find((t) => total >= t.min && total <= t.max) ?? MANA_EXHAUSTION_TIERS[0];
}

/** Mana beyond the remaining pool that has to be "borrowed" for a cast. */
export function manaToBorrow(cost: number, poolRemaining: number): number {
  return Math.max(0, cost - Math.max(0, poolRemaining));
}

/** Number of d6 for the Wyczerpanie Many roll: cumulative borrowed mana incl. this cast. */
export function exhaustionDice(borrowedSoFar: number, borrowedNow: number): number {
  return Math.max(0, borrowedSoFar) + Math.max(0, borrowedNow);
}

/** Over-limit overcast: T by base cost, S = E(E+1)/2. */
export function overLimitTest(baseCost: number, excess: number): { threshold: number; successes: number } {
  const threshold = baseCost <= 2 ? 4 : baseCost <= 4 ? 5 : 6;
  return { threshold, successes: (excess * (excess + 1)) / 2 };
}

/** Nadczarowanie bonus multiplier: levels 1–2 full, level 3+ halved DOWN, min 1. */
export function overcastBonus(level: number, perLevel: number): number {
  if (level <= 0) return 0;
  if (level <= 2) return perLevel * level;
  const full = perLevel * 2;
  const tapered = Math.max(1, Math.floor(perLevel / 2));
  return full + tapered * (level - 2);
}

/** Halve a rolled dice-bonus result for level 3+ overcast (DOWN, min 1). */
export function taperedDiceBonus(rolled: number): number {
  return Math.max(1, Math.floor(rolled / 2));
}

/** Zasada Potężniejszych Zaklęć: nadwyżka = caster's Sukcesy − S (min 0). */
export function spellSurplus(casterSuccesses: number, required: number): number {
  return Math.max(0, casterSuccesses - required);
}
export const defenderSuccessesNeeded = (surplus: number) => 1 + surplus;
export const dispelSuccessesNeeded = (surplus: number, indestructible = false) =>
  2 + surplus + (indestructible ? 1 : 0);

/** Oszołomiony trigger: one hit costs at least half max Żywotność (after reductions). */
export function triggersStun(healthLost: number, maxHealth: number): boolean {
  return maxHealth > 0 && healthLost > 0 && healthLost * 2 >= maxHealth;
}

/** Koncentracja test: Dusza (Determinacja) 4:S, S = ⌈⅓ lost⌉, min 1. None if nothing lost. */
export function concentrationTest(healthLost: number): { threshold: number; successes: number } | null {
  if (healthLost <= 0) return null;
  return { threshold: 4, successes: Math.max(1, Math.ceil(healthLost / 3)) };
}

/** Unik: positive difference means dodge failed; damage uses difference + 2. */
export function dodgeResult(attackerSuccesses: number, defenderSuccesses: number) {
  const diff = attackerSuccesses - defenderSuccesses;
  return { hit: diff > 0, damageSuccesses: diff > 0 ? diff + 2 : 0 };
}

/** Parowanie (T−1): parried when parrier ≥ attacker − ⌈½ Walka Wręcz⌉. */
export function parrySucceeds(parrierSuccesses: number, attackerSuccesses: number, melee: number): boolean {
  return parrierSuccesses >= attackerSuccesses - Math.ceil(melee / 2);
}

/** Przewrócony: standing up costs half Ruch (rounded up). */
export function standUpCost(movement: number): number {
  return Math.ceil(movement / 2);
}

/** Spowolniony / Oszołomiony: Ruch halved, rounded up. */
export function halvedMovement(movement: number): number {
  return Math.ceil(movement / 2);
}

/** Szarża requires a straight Ruch of ≥ 4 m started outside the target's reach. */
export const CHARGE_MIN_DISTANCE_M = 4;

/** Immediate Actions: 1 free per round; 1 Zapał buys two extra. Returns Zapał cost of the n-th action (1-based). */
export function immediateActionZealCost(nth: number): number {
  if (nth <= 1) return 0;
  const extra = nth - 1;
  return Math.ceil(extra / 2);
}

/** Total Zapał for n Immediate Actions in one round. */
export function immediateActionsZealTotal(n: number): number {
  return n <= 1 ? 0 : Math.ceil((n - 1) / 2);
}

/** Źródło Mocy mana-passing test: T by distance 4/5/6 for <1/<2/<3 m. */
export function manaPassThreshold(distanceM: number): number | null {
  if (distanceM < 1) return 4;
  if (distanceM < 2) return 5;
  if (distanceM < 3) return 6;
  return null;
}

/** Pomoc: regular mage contributes at most ⌈½ own Maksymalny Koszt⌉. */
export function helpContributionCap(maxPerSpell: number, manaSource = false): number {
  return manaSource ? maxPerSpell : Math.ceil(maxPerSpell / 2);
}

/** Wchłanianie Krwi: HP per Krew (2 base, 3 for Większe). */
export function bloodAbsorbHp(blood: number, greater = false): number {
  return Math.max(0, blood) * (greater ? 3 : 2);
}
/** Większe Wchłanianie Krwi: 1 Zapał per 5 Krew. */
export function bloodToZeal(blood: number): number {
  return Math.floor(Math.max(0, blood) / 5);
}

/**
 * Runiczny Pancerz – points disabled by ONE hit (hits are never added together).
 * Default: a hit of more than 5 damage (after the Runiczny Pancerz step) disables 1 point.
 * Shield-breaking effects (`step` 2): every 2 damage disable 1 point.
 * Disabled points return at the end of the fight or when restored; only Rozerwanie Run
 * destroys a point permanently.
 */
export function runicArmorPointsDisabled(damage: number, step?: number): number {
  const d = Math.max(0, Math.floor(damage));
  if (step && step > 0 && step !== DEFAULT_RUNIC_THRESHOLD) return Math.floor(d / step);
  return d > DEFAULT_RUNIC_THRESHOLD ? 1 : 0;
}
export const DEFAULT_RUNIC_THRESHOLD = 5;

/** Damage profile of spells that treat the magical defences non-standardly (by spell slug). */
export interface SpellDamageProfile {
  ignoreMagicalArmor?: boolean;
  ignoreMagicalShield?: boolean;
  ignorePhysicalArmor?: boolean;
  /** 2 → every 2 (instead of 5) damage disable a Runiczny Pancerz point. */
  runicArmorStep?: number;
  /** Damage counts this many times against Magiczna Osłona. */
  shieldMultiplier?: number;
  /** Fully destroys Magiczne Tarcze and disables all Runiczny Pancerz (Prawdziwa Dezintegracja). */
  destroyMagicalDefenses?: boolean;
}

const SHIELD_BREAKER: SpellDamageProfile = { runicArmorStep: 2, shieldMultiplier: 2 };

export const SPELL_DAMAGE_PROFILES: Readonly<Record<string, SpellDamageProfile>> = {
  'ether-pierce': { ...SHIELD_BREAKER, ignorePhysicalArmor: true },
  'divine-spear': { ...SHIELD_BREAKER, ignorePhysicalArmor: true },
  'energy-wave': SHIELD_BREAKER,
  'mysterious-stream': SHIELD_BREAKER,
  'arrow-of-desire': SHIELD_BREAKER,
  'last-judgment': SHIELD_BREAKER,
  'crimson-bolt': { ignoreMagicalArmor: true, ignoreMagicalShield: true },
  'true-disintegration': { ignorePhysicalArmor: true, destroyMagicalDefenses: true },
};

/** Krew – sources (Arcanum Sanguinis). */
export type KrewTalent = 'respect-for-life' | 'krwisty-pojedynkowicz' | 'rytualista-krwi';

/** Samookaleczenie: lose HP = Sukcesy; 1 Krew per HP (2 with Większe Samookaleczenie). */
export function krewFromSelfHarm(hpLost: number, greater = false): number {
  return Math.max(0, hpLost) * (greater ? 2 : 1);
}
/** Kradzież Życia: 1 Krew per HP the target actually lost (2 with the greater version). */
export function krewFromLifeSteal(hpLost: number, greater = false): number {
  return Math.max(0, hpLost) * (greater ? 2 : 1);
}
/** Złożenie w Ofierze: heal Sukcesy + Magia, gain Krew = Sukcesy. */
export function sacrificeResult(successes: number, magic: number): { heal: number; krew: number } {
  return { heal: Math.max(0, successes) + Math.max(0, magic), krew: Math.max(0, successes) };
}
/**
 * Wielka Ofiara: Sukcesy above the target's highest Atrybut kill it (all its Żywotność is lost),
 * otherwise the mage heals Sukcesy. Krew gained = Żywotność the target lost.
 */
export function greatSacrificeResult(successes: number, highestAttribute: number, targetHealth: number): { kills: boolean; heal: number; krew: number } {
  if (successes > highestAttribute) return { kills: true, heal: 0, krew: Math.max(0, targetHealth) };
  return { kills: false, heal: Math.max(0, successes), krew: 0 };
}
/** Passive Krew: Szacunek do Życia 1 per 4 HP, Krwisty Pojedynkowicz 1 per 2 HP (cutting/piercing only). */
export function krewFromWeaponHpLoss(hpLost: number, talent: KrewTalent | null): number {
  if (talent === 'respect-for-life') return Math.floor(Math.max(0, hpLost) / 4);
  if (talent === 'krwisty-pojedynkowicz') return Math.floor(Math.max(0, hpLost) / 2);
  return 0;
}
/** Krew at the start of a fight: Rytualista Krwi 4, everyone else 0. */
export function startingKrew(talent: KrewTalent | null): number {
  return talent === 'rytualista-krwi' ? 4 : 0;
}

/** Runiczny Pancerz (Amulet Osłony): recharging costs 2 Mana per point, as an Akcja Natychmiastowa. */
export const RUNIC_ARMOR_MANA_PER_POINT = 2;

/** Points of Runiczny Pancerz that can actually be restored (never above max, never negative). */
export function runicArmorRestorable(value: number, max: number, requested: number): number {
  return Math.max(0, Math.min(Math.floor(requested), max - value));
}

/** Mana needed to restore `points` points of Runiczny Pancerz. */
export function runicArmorManaCost(points: number): number {
  return Math.max(0, points) * RUNIC_ARMOR_MANA_PER_POINT;
}

/** Eliksir Odnowienia Many: +3 mana (capped by the pool); quick use = 1d3 as Immediate Action. */
export const MANA_ELIXIR_NORMAL = 3;
export const MANA_ELIXIR_QUICK_DIE = 3;
export function manaElixirGain(current: number, max: number, amount: number): number {
  return Math.max(0, Math.min(amount, max - current));
}

/** Magiczny Pocisk (and similar): damage that reaches Żywotność after Pancerz is at least 1. */
export function minOneAfterArmor(damage: number, armor: number): number {
  return Math.max(1, damage - armor);
}

/** Trade (Złoto, Stal i Magia). */
export const TRADE = {
  companyFee: 5000,
  companyTest: { threshold: 4, successes: 3 },
  bribeTiers: [
    { rate: 0.02, discount: 0.1 },
    { rate: 0.05, discount: 0.2 },
    { rate: 0.08, discount: 0.3 },
  ],
  minBribe: 500,
  thresholdFloor: 2,
  negotiationSuccessesPerStep: 4,
  minigameFailureCost: 0.1,
  /** Unconfirmed (brief §16.3) – keep configurable. */
  eurRate: 4.36,
} as const;

/** Negotiation bands for the 4:1 test: successes → step (1–2, 3–4, 5–6, 7+). */
export function negotiationBand(successes: number): number {
  if (successes <= 0) return 0;
  return Math.min(4, Math.ceil(successes / 2));
}

/** Przerażony: modifier on tests aimed at the fear source (T+1), 0 otherwise. */
export function fearThresholdMod(sourceId: string | undefined, targetId: string | undefined): number {
  return sourceId && targetId && sourceId === targetId ? 1 : 0;
}
