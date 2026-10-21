import { describe, it, expect } from 'vitest';
import { parseWoundKind } from '../../scripts/parsers/gear-parser';

describe('gear-parser parseWoundKind', () => {
  it('maps Polish and English labels', () => {
    expect(parseWoundKind('tnąca')).toBe('cutting');
    expect(parseWoundKind('Kłująca')).toBe('piercing');
    expect(parseWoundKind('obuchowa')).toBe('blunt');
    expect(parseWoundKind('piercing')).toBe('piercing');
  });

  it('never guesses: missing or unknown stays unspecified', () => {
    expect(parseWoundKind(undefined)).toBe('');
    expect(parseWoundKind('')).toBe('');
    expect(parseWoundKind('ognista')).toBe('');
  });
});
