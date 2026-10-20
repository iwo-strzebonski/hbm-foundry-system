import { describe, it, expect } from 'vitest';
import {
  manaExhaustionTier, manaToBorrow, exhaustionDice, overLimitTest, overcastBonus, taperedDiceBonus,
  spellSurplus, dispelSuccessesNeeded, triggersStun, concentrationTest, dodgeResult, parrySucceeds,
  standUpCost, immediateActionsZealTotal, manaPassThreshold, helpContributionCap, bloodAbsorbHp,
  bloodToZeal, manaElixirGain, negotiationBand,
} from '../../src/logic/rules';
import { getMagicPowerEntry } from '../../src/constants';

describe('magic power table', () => {
  it('has III=24 and IV=21 mana per day', () => {
    expect(getMagicPowerEntry(3).manaPerDay).toBe(24);
    expect(getMagicPowerEntry(4).manaPerDay).toBe(21);
  });
});

describe('Wyczerpanie Many', () => {
  it('maps tiers', () => {
    expect(manaExhaustionTier(3).id).toBe('zdyszanie');
    expect(manaExhaustionTier(8).id).toBe('zmeczenie');
    expect(manaExhaustionTier(12).id).toBe('wyczerpanie');
    expect(manaExhaustionTier(16).id).toBe('zalamanie-sil');
    expect(manaExhaustionTier(20).id).toBe('zapasc');
    expect(manaExhaustionTier(24).id).toBe('ciezka-zapasc');
    expect(manaExhaustionTier(25).id).toBe('wypalenie');
  });
  it('borrows only the shortfall and accumulates dice', () => {
    expect(manaToBorrow(5, 2)).toBe(3);
    expect(manaToBorrow(2, 5)).toBe(0);
    expect(exhaustionDice(4, 3)).toBe(7);
  });
});

describe('overcast', () => {
  it('over-limit test T by base cost, S triangular', () => {
    expect(overLimitTest(2, 3)).toEqual({ threshold: 4, successes: 6 });
    expect(overLimitTest(4, 1)).toEqual({ threshold: 5, successes: 1 });
    expect(overLimitTest(6, 5)).toEqual({ threshold: 6, successes: 15 });
  });
  it('tapers from level 3 (halved down, min 1)', () => {
    expect(overcastBonus(2, 4)).toBe(8);
    expect(overcastBonus(3, 4)).toBe(10);
    expect(overcastBonus(3, 1)).toBe(3);
    expect(taperedDiceBonus(5)).toBe(2);
    expect(taperedDiceBonus(1)).toBe(1);
  });
});

describe('Zasada Potężniejszych Zaklęć', () => {
  it('computes surplus and dispel needs', () => {
    expect(spellSurplus(5, 3)).toBe(2);
    expect(spellSurplus(2, 3)).toBe(0);
    expect(dispelSuccessesNeeded(2, true)).toBe(5);
  });
});

describe('combat rules', () => {
  it('Oszołomiony at half max Żywotność', () => {
    expect(triggersStun(5, 10)).toBe(true);
    expect(triggersStun(4, 10)).toBe(false);
    expect(triggersStun(0, 0)).toBe(false);
  });
  it('Koncentracja S = ceil(lost/3), min 1', () => {
    expect(concentrationTest(0)).toBeNull();
    expect(concentrationTest(1)).toEqual({ threshold: 4, successes: 1 });
    expect(concentrationTest(7)).toEqual({ threshold: 4, successes: 3 });
  });
  it('Unik adds 2 to a positive difference', () => {
    expect(dodgeResult(3, 3)).toEqual({ hit: false, damageSuccesses: 0 });
    expect(dodgeResult(5, 2)).toEqual({ hit: true, damageSuccesses: 5 });
  });
  it('Parowanie tolerance is ceil(½ Walka Wręcz)', () => {
    expect(parrySucceeds(3, 5, 3)).toBe(true);
    expect(parrySucceeds(2, 5, 3)).toBe(false);
  });
  it('rounds movement up', () => {
    expect(standUpCost(5)).toBe(3);
  });
  it('1 Zapał buys two extra Immediate Actions', () => {
    expect([1, 2, 3, 4, 5].map(immediateActionsZealTotal)).toEqual([0, 1, 1, 2, 2]);
  });
});

describe('Pomoc / Źródło Mocy', () => {
  it('caps contribution and sets pass threshold', () => {
    expect(helpContributionCap(5)).toBe(3);
    expect(helpContributionCap(5, true)).toBe(5);
    expect(manaPassThreshold(0.5)).toBe(4);
    expect(manaPassThreshold(2.5)).toBe(6);
    expect(manaPassThreshold(3)).toBeNull();
  });
});

describe('blood, elixirs, trade', () => {
  it('Wchłanianie Krwi 2 HP/Krew, Większe 3, 5:1 Zapał', () => {
    expect(bloodAbsorbHp(4)).toBe(8);
    expect(bloodAbsorbHp(4, true)).toBe(12);
    expect(bloodToZeal(12)).toBe(2);
  });
  it('mana elixir is capped by the pool', () => {
    expect(manaElixirGain(8, 10, 3)).toBe(2);
  });
  it('negotiation bands', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 12].map(negotiationBand)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
