import { describe, it, expect } from 'vitest';
import { matchDiscipline } from '../../src/logic/spell-validation';

describe('matchDiscipline: Magia Sakralna - Egzorcyzmy', () => {
  it('an exorcist counts as Sacred Magic for casting', () => {
    expect(matchDiscipline('sacredExorcism', 'sacred')).toBe(true);
    expect(matchDiscipline('Magia Sakralna - Egzorcyzmy', 'sacred')).toBe(true);
    expect(matchDiscipline('Egzorcyzmy', 'Magia Sakralna')).toBe(true);
  });

  it('a plain Sacred mage is not an exorcist', () => {
    expect(matchDiscipline('sacred', 'sacredExorcism')).toBe(false);
    expect(matchDiscipline('Magia Sakralna', 'egzorcyzmy')).toBe(false);
  });

  it('does not leak into other disciplines', () => {
    expect(matchDiscipline('sacredExorcism', 'witch')).toBe(false);
  });
});
