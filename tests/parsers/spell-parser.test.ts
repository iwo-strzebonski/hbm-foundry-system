import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseSpells, deriveAreaOfEffect, deriveCastingTime } from '../../scripts/parsers/spell-parser';
import { SOURCE_BOOKS } from '../../src/constants';

describe('spell-parser', () => {
  it('expands the flat vault frontmatter into a Foundry-loadable system payload', async () => {
    const ctx = { repoRoot: resolve(__dirname, '../../../..'), idOverrides: {}, strict: true } as any;
    const docs = await parseSpells(ctx);
    expect(docs.length).toBeGreaterThan(100);

    const mm = docs.find((d) => d.id === 'magic-missile')!;
    const s = mm.system as any;
    expect(mm.name).toBe('Magiczny Pocisk');
    expect(s.sourceBook).toBe('ksiega-magii');
    expect(s.castingTime).toBe('Instant');
    expect(s.range).toBe('15 m');
    expect(s.targets).toBe('1');
    expect(s.damageBase).toBe('magicalAbilities/2');
    expect(s.damageType).toBe('magical');
    expect(s.difficulty).toEqual({ threshold: 4, successes: 1 });
    expect(s.overcastOptions).toEqual([{ description: '+1 punkt Obrażeń (najwyżej dwa Poziomy Nadczarowania)', manaPerStep: 1 }]);
    expect(s).not.toHaveProperty('circle');

    for (const d of docs) {
      const sys = d.system as any;
      // No object leaks into string fields (the "[object Object]" bug).
      for (const k of ['range', 'targets', 'duration', 'castingTime', 'damageBase']) {
        expect(typeof sys[k], `${d.id}.${k}`).toBe('string');
      }
      for (const o of sys.overcastOptions) expect(o.description, d.id).toBeTruthy();
      expect(SOURCE_BOOKS as readonly string[], d.id).toContain(sys.sourceBook);
    }
  });

  it('derives area of effect from the targets line', () => {
    expect(deriveAreaOfEffect('Kwadrat o boku 5 m')).toMatchObject({ shape: 'square', x: 5, y: 5 });
    expect(deriveAreaOfEffect('Prostokąt 3 m x 8 m. Dłuższy bok')).toMatchObject({ shape: 'rectangle', x: 3, y: 8 });
    expect(deriveAreaOfEffect('Sfera o średnicy 100 m')).toMatchObject({ shape: 'sphere', x: 50 });
    expect(deriveAreaOfEffect('1')).toMatchObject({ shape: 'point', x: 0 });
  });

  it('derives casting time numbers', () => {
    expect(deriveCastingTime('Instant')).toEqual({ rounds: 0, minutes: 0 });
    expect(deriveCastingTime('2 godziny')).toEqual({ rounds: 0, minutes: 120 });
    expect(deriveCastingTime('10 minut')).toEqual({ rounds: 0, minutes: 10 });
  });
});
