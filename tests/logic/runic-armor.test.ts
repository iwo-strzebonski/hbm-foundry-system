import { describe, it, expect, vi } from 'vitest';
import { rechargeRunicArmor } from '../../src/logic/runic-armor';
import { runicArmorManaCost, runicArmorRestorable } from '../../src/logic/rules';

function makeActor(armor: { value: number; max: number }, mana: number) {
  const update = vi.fn().mockResolvedValue(undefined);
  return { actor: { system: { attributes: { magicalArmor: armor, mana: { value: mana, max: 30 } } }, update } as any, update };
}

describe('Runiczny Pancerz restore', () => {
  it('costs 2 Mana per point and never exceeds max', () => {
    expect(runicArmorManaCost(3)).toBe(6);
    expect(runicArmorRestorable(2, 4, 5)).toBe(2);
    expect(runicArmorRestorable(4, 4, 1)).toBe(0);
  });

  it('restores points and spends mana', async () => {
    const { actor, update } = makeActor({ value: 1, max: 4 }, 10);
    const res = await rechargeRunicArmor(actor, 2);
    expect(res).toEqual({ ok: true, restored: 2, manaSpent: 4 });
    expect(update).toHaveBeenCalledWith({
      'system.attributes.magicalArmor.value': 3,
      'system.attributes.mana.value': 6,
    });
  });

  it('refuses when mana is short, unless partial', async () => {
    const { actor, update } = makeActor({ value: 0, max: 4 }, 5);
    expect((await rechargeRunicArmor(actor, 3)).reason).toBe('insufficient-mana');
    expect(update).not.toHaveBeenCalled();
    const res = await rechargeRunicArmor(actor, 3, { partial: true });
    expect(res).toEqual({ ok: true, restored: 2, manaSpent: 4 });
  });

  it('reports already-full armor', async () => {
    const { actor } = makeActor({ value: 4, max: 4 }, 10);
    expect((await rechargeRunicArmor(actor, 1)).reason).toBe('already-full');
  });
});
