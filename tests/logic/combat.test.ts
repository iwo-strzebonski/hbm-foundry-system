import { describe, it, expect } from 'vitest';
import { getZealRegen } from '../../src/logic/combat';

describe('getZealRegen', () => {
  it('returns base 1 when no flag set', () => {
    const actor = { getFlag: () => undefined };
    expect(getZealRegen(actor)).toBe(1);
  });

  it('adds bonus from flag', () => {
    const actor = { getFlag: (_ns: string, key: string) => (key === 'zealRegenBonus' ? 2 : undefined) };
    expect(getZealRegen(actor)).toBe(3);
  });

  it('floors at 0', () => {
    const actor = { getFlag: () => -5 };
    expect(getZealRegen(actor)).toBe(0);
  });

  it('handles missing getFlag gracefully', () => {
    expect(getZealRegen({})).toBe(1);
  });
});
