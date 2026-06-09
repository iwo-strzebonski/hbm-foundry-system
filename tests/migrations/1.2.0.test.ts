import { describe, it, expect, vi } from 'vitest';
import { migration_1_2_0 } from '../../src/migrations/1.2.0';

describe('migration 1.2.0', () => {
  it('sets zealRegenBonus flag on character actors that lack it', async () => {
    const setFlag = vi.fn(async () => undefined);
    const character = {
      type: 'character',
      items: [],
      effects: [],
      getFlag: () => undefined,
      setFlag,
      update: vi.fn(async () => undefined),
    };
    (globalThis as any).game = {
      ...(globalThis as any).game,
      user: { isGM: true },
      actors: { contents: [character] },
      items: { contents: [] },
    };
    await migration_1_2_0.run();
    expect(setFlag).toHaveBeenCalledWith('hbm-rpg-v3', 'zealRegenBonus', 0);
  });

  it('attaches a zeal-regen ActiveEffect to a +1 Zapał talent', async () => {
    const createEmbeddedDocuments = vi.fn(async () => undefined);
    const talent = {
      type: 'talent',
      system: { description: 'Na początku tury otrzymujesz +1 Zapał.' },
      effects: [],
      createEmbeddedDocuments,
    };
    (globalThis as any).game = {
      ...(globalThis as any).game,
      user: { isGM: true },
      actors: { contents: [] },
      items: { contents: [talent] },
    };
    await migration_1_2_0.run();
    expect(createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    const [type, [doc]] = createEmbeddedDocuments.mock.calls[0];
    expect(type).toBe('ActiveEffect');
    expect(doc.transfer).toBe(true);
    expect(doc.changes[0].key).toBe('flags.hbm-rpg-v3.zealRegenBonus');
    expect(doc.changes[0].value).toBe('1');
  });

  it('does not attach AE if talent already has one targeting the flag', async () => {
    const createEmbeddedDocuments = vi.fn(async () => undefined);
    const talent = {
      type: 'talent',
      system: { description: 'regeneracja Zapału' },
      effects: [{ changes: [{ key: 'flags.hbm-rpg-v3.zealRegenBonus' }] }],
      createEmbeddedDocuments,
    };
    (globalThis as any).game = {
      ...(globalThis as any).game,
      user: { isGM: true },
      actors: { contents: [] },
      items: { contents: [talent] },
    };
    await migration_1_2_0.run();
    expect(createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it('backfills NPC mana/zeal/blood attributes when missing', async () => {
    const update = vi.fn(async () => undefined);
    const npc = {
      type: 'npc',
      items: [],
      effects: [],
      system: { attributes: {} },
      update,
    };
    (globalThis as any).game = {
      ...(globalThis as any).game,
      user: { isGM: true },
      actors: { contents: [npc] },
      items: { contents: [] },
    };
    await migration_1_2_0.run();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      'system.attributes.mana': expect.any(Object),
      'system.attributes.zeal': expect.any(Object),
      'system.attributes.blood': expect.any(Object),
    }));
  });
});
