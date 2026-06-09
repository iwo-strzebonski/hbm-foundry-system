import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyDamage } from '../../src/logic/damage';

function makeActor(overrides: Partial<any> = {}) {
  const updates: Record<string, unknown>[] = [];
  const actor: any = {
    name: 'Test',
    type: 'character',
    system: {
      attributes: {
        body: { value: 3 },
        mind: { value: 3 },
        soul: { value: 3 },
        magicalArmor: { value: 0, runicCounter: 0 },
        magicalShield: { value: 0 },
        physicalArmor: { value: 0 },
        health: { value: 30, max: 30 },
        ...overrides,
      },
    },
    items: [],
    update: vi.fn(async (u: Record<string, unknown>) => { updates.push(u); }),
    toggleStatusEffect: vi.fn(async () => undefined),
  };
  return { actor, updates };
}

describe('applyDamage', () => {
  beforeEach(() => {
    (globalThis as any).ChatMessage = { create: vi.fn(async () => undefined) };
  });

  it('applies plain HP damage when no armor', async () => {
    const { actor } = makeActor();
    const r = await applyDamage(actor, { amount: 7, postChat: false });
    expect(r.hpDamage).toBe(7);
    expect(actor.system.attributes.health.value).toBe(30); // pre-update; check call
    expect(actor.update).toHaveBeenCalledWith(expect.objectContaining({
      'system.attributes.health.value': 23,
    }));
  });

  it('absorbs through magical armor + shield + physical armor', async () => {
    const { actor } = makeActor({
      magicalArmor: { value: 3, runicCounter: 0 },
      magicalShield: { value: 4 },
      physicalArmor: { value: 2 },
    });
    const r = await applyDamage(actor, { amount: 12, postChat: false });
    expect(r.absorbed.magicalArmor).toBe(3);
    expect(r.absorbed.magicalShield).toBe(4);
    expect(r.absorbed.physicalArmor).toBe(2);
    expect(r.hpDamage).toBe(3);
  });

  it('ignoreMagicalArmor skips layer 1', async () => {
    const { actor } = makeActor({
      magicalArmor: { value: 5, runicCounter: 0 },
    });
    const r = await applyDamage(actor, { amount: 4, ignoreMagicalArmor: true, postChat: false });
    expect(r.absorbed.magicalArmor).toBe(0);
    expect(r.hpDamage).toBe(4);
  });

  it('ignoreMagicalShield skips layer 2', async () => {
    const { actor } = makeActor({
      magicalShield: { value: 10 },
    });
    const r = await applyDamage(actor, { amount: 5, ignoreMagicalShield: true, postChat: false });
    expect(r.absorbed.magicalShield).toBe(0);
    expect(r.hpDamage).toBe(5);
  });

  it('ignorePhysicalArmor skips layer 3', async () => {
    const { actor } = makeActor({
      physicalArmor: { value: 4 },
    });
    const r = await applyDamage(actor, { amount: 6, ignorePhysicalArmor: true, postChat: false });
    expect(r.absorbed.physicalArmor).toBe(0);
    expect(r.hpDamage).toBe(6);
  });

  it('marks shield as dropped when reduced to 0', async () => {
    const { actor } = makeActor({ magicalShield: { value: 3 } });
    const r = await applyDamage(actor, { amount: 5, postChat: false });
    expect(r.shieldDropped).toBe(true);
  });
});
