import { describe, it, expect } from 'vitest';
import { parseTalents } from '../../scripts/parsers/talent-parser';
import { resolve } from 'node:path';

describe('talent-parser', () => {
  it('parses talents from all 4 source books and stamps sourceModule', async () => {
    const ctx = {
      repoRoot: resolve(__dirname, '../../../..'),
      idOverrides: {},
      strict: false,
    } as any;

    const docs = await parseTalents(ctx);
    expect(docs.length).toBeGreaterThan(20);

    // Sanity: each doc has a Polish name and proper subType.
    for (const d of docs) {
      expect(d.subType).toBe('talent');
      expect(d.name).toBeTruthy();
      expect(d.pack).toMatch(/^talents/);
    }

    const blood = docs.filter((d) => d.pack === 'talents-blood');
    const abyss = docs.filter((d) => d.pack === 'talents-eldritch');
    const core = docs.filter((d) => d.pack === 'talents');

    expect(core.length).toBeGreaterThan(0);
    expect(blood.length).toBeGreaterThan(0);
    expect(abyss.length).toBeGreaterThan(0);

    // sourceModule flag is stamped on sub-pack talents only.
    for (const d of blood) expect((d.flags as any)?.sourceModule).toBe('arcanum-sanguinis');
    for (const d of abyss) expect((d.flags as any)?.sourceModule).toBe('abyss-curse');
    for (const d of core) expect(d.flags).toBeUndefined();
  });
});
