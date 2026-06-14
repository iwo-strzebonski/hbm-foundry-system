/**
 * HbM canonical status conditions (Aneks A - Podręcznik Gry).
 * 15 entries with Active-Effect change ops and `flags.hbm.*` metadata
 * consumed by the roll pipeline and combat hooks.
 */

import { SYSTEM_ID } from '../hbm';

export interface ConditionDef {
  id: string;
  i18nKey: string;
  icon: string;
  changes?: Array<{ key: string; mode: number; value: string; priority?: number }>;
  flags?: Record<string, unknown>;
}

const CHANGE_MODE_ADD = 2;

export const CONDITIONS: ConditionDef[] = [
  { id: 'przewrocony', i18nKey: 'HBM.conditions.przewrocony', icon: 'icons/svg/falling.svg', flags: { hbm: { prone: true } } },
  { id: 'unieruchomiony', i18nKey: 'HBM.conditions.unieruchomiony', icon: 'icons/svg/net.svg', flags: { hbm: { thresholdSteps: { attack: 1 }, defenseSteps: -1 } } },
  { id: 'obezwladniony', i18nKey: 'HBM.conditions.obezwladniony', icon: 'icons/svg/blood.svg', flags: { hbm: { blocksTags: ['attack'], defenseT: 2 } } },
  { id: 'nieprzytomny', i18nKey: 'HBM.conditions.nieprzytomny', icon: 'icons/svg/unconscious.svg', flags: { hbm: { skipTurn: true, blocksAllActions: true } } },
  { id: 'umierajacy', i18nKey: 'HBM.conditions.umierajacy', icon: 'icons/svg/skull.svg', flags: { hbm: { dyingState: { failures: 0, hits: 0, mortalDamage: 0 } } } },
  { id: 'ogluszony', i18nKey: 'HBM.conditions.ogluszony', icon: 'icons/svg/deaf.svg', flags: { hbm: { blocksTags: ['hearing'] } } },
  { id: 'oslepiony', i18nKey: 'HBM.conditions.oslepiony', icon: 'icons/svg/blind.svg', flags: { hbm: { blocksTags: ['sight'] } } },
  { id: 'oszolomiony', i18nKey: 'HBM.conditions.oszolomiony', icon: 'icons/svg/daze.svg', flags: { hbm: { maxActions: 1, blockZeal: true, halveSpeed: true } } },
  {
    id: 'zatruty',
    i18nKey: 'HBM.conditions.zatruty',
    icon: 'icons/svg/poison.svg',
    changes: [
      { key: 'system.attributes.body.value', mode: CHANGE_MODE_ADD, value: '-1' },
      { key: 'system.attributes.mind.value', mode: CHANGE_MODE_ADD, value: '-1' },
      { key: 'system.attributes.soul.value', mode: CHANGE_MODE_ADD, value: '-1' },
      { key: 'system.attributes.magic.value', mode: CHANGE_MODE_ADD, value: '1' },
    ],
  },
  { id: 'podpalony', i18nKey: 'HBM.conditions.podpalony', icon: 'icons/svg/fire.svg', flags: { hbm: { damagePerRound: { amount: 1, type: 'environmental' } } } },
  { id: 'spowolniony', i18nKey: 'HBM.conditions.spowolniony', icon: 'icons/svg/clockwork.svg', flags: { hbm: { halveSpeed: true } } },
  {
    id: 'przeklety',
    i18nKey: 'HBM.conditions.przeklety',
    icon: 'icons/svg/sun.svg',
    changes: [
      { key: 'system.attributes.body.value', mode: CHANGE_MODE_ADD, value: '-1' },
      { key: 'system.attributes.mind.value', mode: CHANGE_MODE_ADD, value: '-1' },
      { key: 'system.attributes.soul.value', mode: CHANGE_MODE_ADD, value: '-1' },
      { key: 'system.attributes.magic.value', mode: CHANGE_MODE_ADD, value: '1' },
    ],
    flags: { hbm: { blocksRegen: true } },
  },
  { id: 'zauroczony', i18nKey: 'HBM.conditions.zauroczony', icon: 'icons/svg/heal.svg', flags: { hbm: { thresholdSteps: { social: 1 }, charmedBy: '' } } },
  { id: 'koncentracja', i18nKey: 'HBM.conditions.koncentracja', icon: 'icons/svg/aura.svg', flags: { hbm: { concentration: true, persistent: true } } },
  // Provisional: book description incomplete for Przerażony (Aneks A placeholder).
  { id: 'przerazony', i18nKey: 'HBM.conditions.przerazony', icon: 'icons/svg/terror.svg', flags: { hbm: { thresholdSteps: { all: 1 }, todoBookGap: true } } },

  // Mental illnesses (Klątwa Otchłani Ch. VIII - book chapter currently a placeholder;
  // these are stub registrations with `todoBookGap: true` until full mechanics drop).
  { id: 'paranoja', i18nKey: 'HBM.conditions.paranoja', icon: 'icons/svg/eye.svg', flags: { hbm: { mental: true, todoBookGap: true } } },
  { id: 'fobia', i18nKey: 'HBM.conditions.fobia', icon: 'icons/svg/silenced.svg', flags: { hbm: { mental: true, todoBookGap: true } } },
  { id: 'depresja', i18nKey: 'HBM.conditions.depresja', icon: 'icons/svg/sleep.svg', flags: { hbm: { mental: true, todoBookGap: true } } },
  { id: 'mania', i18nKey: 'HBM.conditions.mania', icon: 'icons/svg/lightning.svg', flags: { hbm: { mental: true, todoBookGap: true } } },
  { id: 'schizofrenia', i18nKey: 'HBM.conditions.schizofrenia', icon: 'icons/svg/stoned.svg', flags: { hbm: { mental: true, todoBookGap: true } } },
];

export function registerHbmConditions(): void {
  CONFIG.statusEffects = CONDITIONS.map((c) => ({
    id: c.id,
    name: c.i18nKey,
    img: c.icon,
    statuses: [c.id],
    changes: c.changes ?? [],
    flags: c.flags ?? {},
  }));
  console.log(`${SYSTEM_ID} | Registered ${CONDITIONS.length} canonical status effects`);
}
