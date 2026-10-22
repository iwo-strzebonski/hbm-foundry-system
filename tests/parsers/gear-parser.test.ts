import { describe, it, expect } from 'vitest';
import { parseWoundKinds } from '../../scripts/parsers/gear-parser';

describe('gear-parser parseWoundKinds', () => {
  it('maps English and Polish labels, single or listed', () => {
    expect(parseWoundKinds('slashing')).toEqual(['slashing']);
    expect(parseWoundKinds('kłute')).toEqual(['piercing']);
    expect(parseWoundKinds('piercing, slashing')).toEqual(['piercing', 'slashing']);
    expect(parseWoundKinds('slashing, piercing, blunt, slashing')).toEqual(['slashing', 'piercing', 'blunt']);
  });

  it('never guesses: missing or unknown stays empty', () => {
    expect(parseWoundKinds(undefined)).toEqual([]);
    expect(parseWoundKinds('')).toEqual([]);
    expect(parseWoundKinds('ognista')).toEqual([]);
  });
});
