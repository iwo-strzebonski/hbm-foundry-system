import { describe, it, expect, vi } from 'vitest';
import '../setup';
import { rest } from '../../src/logic/rest';

function makeActor(overrides: Partial<any> = {}) {
  const updates: Record<string, unknown> = {};
  const deletedEffects: string[] = [];
  const actor: any = {
    type: 'character',
    items: [],
    effects: overrides.effects ?? [],
    system: {
      attributes: {
        body: { value: 3 },
        health: { value: 10, max: 30 },
        mana: { value: 1, max: 20 },
        zeal: { value: 0, max: 5 },
        blood: { value: 0, max: 6 },
        elixirTolerance: 2,
        magicalArmor: { value: 4, runicCounter: 3 },
        ...overrides.attributes,
      },
      skills: overrides.skills ?? {},
    },
    update: vi.fn(async (u: Record<string, unknown>) => { Object.assign(updates, u); }),
    deleteEmbeddedDocuments: vi.fn(async (_t: string, ids: string[]) => { deletedEffects.push(...ids); }),
    unsetFlag: vi.fn(async () => undefined),
  };
  return { actor, updates, deletedEffects };
}

describe('rest', () => {
  it('take a breather restores all mana and 1d6 + endurance HP, leaves zeal/blood alone', async () => {
    const { actor, updates } = makeActor({
      attributes: {
        health: { value: 10, max: 30 },
        mana: { value: 1, max: 20 },
      },
      skills: {
        endurance: { value: 2 },
      },
    });
    const r = await rest(actor, 'breather');
    expect(r.kind).toBe('breather');
    expect(r.hpRestored).toBe(6); // 4 (stub roll default) + 2 (endurance) = 6
    expect(r.manaRestored).toBe(19);
    expect(updates['system.attributes.health.value']).toBe(16);
    expect(updates['system.attributes.mana.value']).toBe(20);
    expect(updates['system.attributes.zeal.value']).toBeUndefined();
  });

  it('short rest restores all mana, 1/3 HP, and removes unconscious state', async () => {
    const effects = [
      { id: 'nieprzytomny', statuses: new Set(['nieprzytomny']) },
      { id: 'przewrocony', statuses: new Set(['przewrocony']) },
    ];
    const { actor, updates, deletedEffects } = makeActor({
      effects,
      attributes: {
        health: { value: 10, max: 30 },
        mana: { value: 1, max: 20 },
      },
    });
    const r = await rest(actor, 'short');
    expect(r.kind).toBe('short');
    expect(r.hpRestored).toBe(10); // 30 / 3 = 10
    expect(r.manaRestored).toBe(19);
    expect(updates['system.attributes.health.value']).toBe(20);
    expect(updates['system.attributes.mana.value']).toBe(20);
    expect(deletedEffects).toContain('nieprzytomny');
    expect(deletedEffects).not.toContain('przewrocony');
    expect(r.effectsCleared).toBe(1);
  });

  it('long rest fully restores HP/mana/zeal/blood, resets runic counter, and clears all conditions and temporary effects', async () => {
    const effects = [
      { id: 'nieprzytomny', statuses: new Set(['nieprzytomny']) },
      { id: 'przewrocony', statuses: new Set(['przewrocony']) },
      { id: 'eff-1', origin: null, duration: { rounds: 3 } },
      { id: 'eff-2', origin: 'Item.abc', duration: { rounds: 3 } },
    ];
    const { actor, updates, deletedEffects } = makeActor({
      effects,
      attributes: {
        health: { value: 10, max: 30 },
        mana: { value: 1, max: 20 },
        zeal: { value: 0, max: 5 },
        blood: { value: 0, max: 6 },
        magicalArmor: { value: 4, runicCounter: 3 },
      },
    });
    const r = await rest(actor, 'long');
    expect(r.kind).toBe('long');
    expect(updates['system.attributes.health.value']).toBe(30);
    expect(updates['system.attributes.mana.value']).toBe(20);
    expect(updates['system.attributes.zeal.value']).toBe(5);
    expect(updates['system.attributes.blood.value']).toBe(6);
    expect(updates['system.attributes.magicalArmor.runicCounter']).toBe(0);
    expect(r.toleranceRecovered).toBe(1);
    
    expect(deletedEffects).toContain('nieprzytomny');
    expect(deletedEffects).toContain('przewrocony');
    expect(deletedEffects).toContain('eff-1');
    expect(deletedEffects).not.toContain('eff-2');
    expect(r.effectsCleared).toBe(3);
  });
});
