import { describe, it, expect, vi } from 'vitest';
import {
  absorbBlood,
  endOfFightKrew,
  gainKrewFromWeaponDamage,
  greatSacrifice,
  resolveLifeSteal,
  sacrifice,
  selfHarm,
  startOfFightKrew,
  useLifeSteal,
} from '../../src/logic/blood-magic';
import { krewFromWeaponHpLoss, runicArmorPointsDisabled, startingKrew } from '../../src/logic/rules';

function makeActor(opts: { slugs?: string[]; blood?: number; hp?: number; zeal?: number; used?: Record<string, number> } = {}) {
  const flags: Record<string, unknown> = {};
  const actor: any = {
    system: {
      attributes: {
        blood: { value: opts.blood ?? 0, max: 20 },
        health: { value: opts.hp ?? 20, max: 30 },
        zeal: { value: opts.zeal ?? 3, max: 5 },
        magic: { value: 3, actual: 3 },
        bloodUsed: { selfHarm: 0, lifeSteal: 0, sacrifice: 0, absorb: 0, ...(opts.used ?? {}) },
        greatSacrificeUsed: 0,
      },
    },
    items: (opts.slugs ?? []).map((slug) => ({ type: 'talent', system: { slug } })),
    update: vi.fn(async () => undefined),
    setFlag: vi.fn(async (_s: string, k: string, v: unknown) => { flags[k] = v; }),
    getFlag: vi.fn((_s: string, k: string) => flags[k]),
    unsetFlag: vi.fn(async (_s: string, k: string) => { delete flags[k]; }),
  };
  return actor;
}

describe('Samookaleczenie', () => {
  it('loses HP = Sukcesy and gains 1 Krew per HP, once per round', async () => {
    const actor = makeActor();
    const res = await selfHarm(actor, { roller: async () => 3 });
    expect(res).toMatchObject({ ok: true, hpLost: 3, krewGained: 3 });
    expect(actor.update).toHaveBeenCalledWith(expect.objectContaining({
      'system.attributes.health.value': 17,
      'system.attributes.blood.value': 3,
      'system.attributes.bloodUsed.selfHarm': 1,
    }));
    const again = makeActor({ used: { selfHarm: 1 } });
    expect((await selfHarm(again, { roller: async () => 3 })).reason).toBe('already-used');
  });

  it('Większe Samookaleczenie needs the talent and gives 2 Krew per HP', async () => {
    expect((await selfHarm(makeActor(), { greater: true, roller: async () => 2 })).reason).toBe('missing-talent');
    const res = await selfHarm(makeActor({ slugs: ['krwisty-pojedynkowicz'] }), { greater: true, roller: async () => 2 });
    expect(res.krewGained).toBe(4);
  });
});

describe('Kradzież Życia', () => {
  it('costs 1 Zapał, arms the next attack and pays Krew for HP actually lost', async () => {
    const actor = makeActor({ zeal: 2 });
    expect(await useLifeSteal(actor)).toEqual({ ok: true, stepsEasier: 1 });
    expect(actor.update).toHaveBeenCalledWith({ 'system.attributes.zeal.value': 1 });
    expect(await resolveLifeSteal(actor, 4)).toBe(4);
  });

  it('greater version pays 2 Krew per HP and may be used twice per round', async () => {
    const actor = makeActor({ slugs: ['wieksza-kradziez-zycia'], used: { lifeSteal: 1 } });
    expect((await useLifeSteal(actor, { greater: true })).stepsEasier).toBe(2);
    expect(await resolveLifeSteal(actor, 3)).toBe(6);
    const spent = makeActor({ slugs: ['wieksza-kradziez-zycia'], used: { lifeSteal: 2 } });
    expect((await useLifeSteal(spent, { greater: true })).reason).toBe('already-used');
  });
});

describe('Złożenie w Ofierze / Wielka Ofiara', () => {
  it('heals Sukcesy + Magia and gains Krew = Sukcesy', async () => {
    const actor = makeActor({ hp: 10 });
    expect(await sacrifice(actor, 2)).toMatchObject({ ok: true, hpGained: 5, krewGained: 2 });
  });

  it('Wielka Ofiara kills when Sukcesy exceed the highest Atrybut, else heals', async () => {
    const actor = makeActor({ slugs: ['rytualista-krwi'], hp: 10 });
    const kill = await greatSacrifice(actor, 6, { highestAttribute: 5, health: 12 });
    expect(kill).toMatchObject({ ok: true, kills: true, targetHpLost: 12, krewGained: 12 });
    const other = makeActor({ slugs: ['rytualista-krwi'], hp: 10 });
    expect(await greatSacrifice(other, 4, { highestAttribute: 5, health: 12 })).toMatchObject({ kills: false, hpGained: 4, krewGained: 0 });
    expect((await sacrifice(actor, 2)).reason).toBe('replaced-by-wielka-ofiara');
  });
});

describe('Wchłanianie Krwi', () => {
  it('needs at least 1 Krew; 2 HP per Krew once per round, 3 HP greater', async () => {
    expect((await absorbBlood(makeActor({ blood: 5 }), 0)).reason).toBe('minimum-one-blood');
    expect((await absorbBlood(makeActor({ blood: 5, hp: 10 }), 3))).toMatchObject({ ok: true, hpGained: 6 });
    expect((await absorbBlood(makeActor({ blood: 5, used: { absorb: 1 } }), 1)).reason).toBe('already-used');
    expect((await absorbBlood(makeActor({ blood: 5, hp: 10 }), 2, { greater: true }))).toMatchObject({ hpGained: 6 });
  });
});

describe('passive Krew', () => {
  it('Szacunek do Życia 1 per 4 HP, Krwisty Pojedynkowicz 1 per 2 HP', async () => {
    expect(krewFromWeaponHpLoss(9, 'respect-for-life')).toBe(2);
    expect(krewFromWeaponHpLoss(9, 'krwisty-pojedynkowicz')).toBe(4);
    expect(krewFromWeaponHpLoss(9, 'rytualista-krwi')).toBe(0);
    expect(await gainKrewFromWeaponDamage(makeActor({ slugs: ['respect-for-life'] }), 9)).toBe(2);
    expect(await gainKrewFromWeaponDamage(makeActor(), 9)).toBe(0);
  });

  it('fight start/end: Rytualista starts with 4, leftover Krew heals 2 HP each', async () => {
    expect(startingKrew('rytualista-krwi')).toBe(4);
    const rit = makeActor({ slugs: ['rytualista-krwi'], blood: 0 });
    await startOfFightKrew(rit);
    expect(rit.update).toHaveBeenCalledWith({ 'system.attributes.blood.value': 4 });
    const end = makeActor({ slugs: ['respect-for-life'], blood: 5, hp: 10 });
    expect(await endOfFightKrew(end)).toBe(10);
  });
});

describe('Runiczny Pancerz – single hit', () => {
  it('> 5 disables 1 point; shield-breakers disable per 2 damage', () => {
    expect(runicArmorPointsDisabled(5)).toBe(0);
    expect(runicArmorPointsDisabled(6)).toBe(1);
    expect(runicArmorPointsDisabled(40)).toBe(1);
    expect(runicArmorPointsDisabled(7, 2)).toBe(3);
  });
});
