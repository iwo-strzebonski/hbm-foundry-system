import { describe, it, expect } from 'vitest';
import {
  castingArmorPenalty, hardenedFireDamage, madnessThreshold, golemLimit, fallDamage, survivalTest,
  resolveCastAsPrayer, zealRegenBlocked,
} from '../../src/logic/rules';

describe('2026-10-26 sync rules', () => {
  it('armour casting penalties stack and Pancerz Wiary spares only armour', () => {
    expect(castingArmorPenalty([{ armorType: 'medium' }])).toEqual({ dice: 1, mana: 0 });
    expect(castingArmorPenalty([{ armorType: 'heavy' }, { armorType: 'shield' }])).toEqual({ dice: 4, mana: 2 });
    expect(castingArmorPenalty([{ armorType: 'heavy' }, { armorType: 'shield' }], true)).toEqual({ dice: 1, mana: 0 });
    expect(castingArmorPenalty([{ armorType: 'medium', ignoresCastingPenalty: true }])).toEqual({ dice: 0, mana: 0 });
  });
  it('Hartowany w Ogniu is flat -2, min 0', () => {
    expect(hardenedFireDamage(5)).toBe(3);
    expect(hardenedFireDamage(1)).toBe(0);
  });
  it('Próg Obłędu, golem limit, fall damage, Test Przeżycia', () => {
    expect(madnessThreshold(4)).toBe(7);
    expect(madnessThreshold(4, 'dwarf')).toBe(8);
    expect(golemLimit(5)).toBe(2);
    expect(golemLimit(1)).toBe(1);
    expect(fallDamage(2)).toBe(0);
    expect(fallDamage(6)).toBe(4);
    expect(fallDamage(6, true)).toBe(2);
    expect(fallDamage(100)).toBe(20);
    expect(survivalTest(2)).toEqual({ threshold: 4, successes: 1 });
    expect(survivalTest(6, 1)).toEqual({ threshold: 5, successes: 3 });
  });
  it('sacred spells default to prayer but can be cast as regular spells', () => {
    const sacred = { system: { castingMode: 'sacred' } };
    expect(resolveCastAsPrayer(sacred, {})).toBe(true);
    expect(resolveCastAsPrayer(sacred, { castAsPrayer: false })).toBe(false);
    expect(resolveCastAsPrayer({ system: { castingMode: 'standard' } }, {})).toBe(false);
  });
  it('paid extra actions block Zapał regen', () => {
    expect(zealRegenBlocked(0, 0)).toBe(false);
    expect(zealRegenBlocked(0, 1)).toBe(true);
  });
});
