/**
 * Generic Item sheet that delegates the body partial based on the item type.
 */

import {
  SPELL_SCHOOLS,
  SACRED_DEITIES,
  SOURCE_BOOKS,
  AOE_SHAPES,
  SPELL_DAMAGE_TYPES,
  TRIGGER_EVENTS,
} from '../constants';

const { ItemSheetV2 } = foundry.applications.sheets as unknown as {
  ItemSheetV2: typeof foundry.applications.sheets.ItemSheetV2;
};
const { HandlebarsApplicationMixin } = foundry.applications.api as unknown as {
  HandlebarsApplicationMixin: <T extends abstract new (...args: any[]) => any>(base: T) => T;
};

const TYPE_PARTIAL: Record<string, string> = {
  spell: 'systems/hbm-rpg-v3/templates/item/spell.hbs',
  gear: 'systems/hbm-rpg-v3/templates/item/gear.hbs',
  ability: 'systems/hbm-rpg-v3/templates/item/ability.hbs',
  class: 'systems/hbm-rpg-v3/templates/item/class.hbs',
  race: 'systems/hbm-rpg-v3/templates/item/race.hbs',
  discipline: 'systems/hbm-rpg-v3/templates/item/discipline.hbs',
  talent: 'systems/hbm-rpg-v3/templates/item/talent.hbs',
};

export class HbmItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ['hbm', 'sheet', 'item'],
    position: { width: 560, height: 600 },
    window: { resizable: true },
    actions: {
      addArrayEntry:    HbmItemSheet._onAddArrayEntry,
      removeArrayEntry: HbmItemSheet._onRemoveArrayEntry,
      effectCreate:     HbmItemSheet._onEffectCreate,
      effectEdit:       HbmItemSheet._onEffectEdit,
      effectDelete:     HbmItemSheet._onEffectDelete,
      effectToggle:     HbmItemSheet._onEffectToggle,
    },
    form: { submitOnChange: true, closeOnSubmit: false },
  };

  static override PARTS = {
    header: { template: 'systems/hbm-rpg-v3/templates/item/header.hbs' },
    body: { template: 'systems/hbm-rpg-v3/templates/item/_dispatch.hbs' },
  };

  override async _prepareContext(options: unknown) {
    const ctx = (await super._prepareContext(options)) as Record<string, unknown>;
    const item = (this as unknown as { item: { system: unknown; type: string; effects: any } }).item;
    const effects = Array.from(item.effects ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      icon: e.icon ?? e.img ?? 'icons/svg/aura.svg',
      disabled: e.disabled,
      transfer: e.transfer,
      changes: e.changes ?? [],
    }));
    const supportsEffects = item.type === 'talent' || item.type === 'gear';
    return {
      ...ctx,
      system: item.system,
      itemType: item.type,
      bodyPartial: TYPE_PARTIAL[item.type] ?? 'systems/hbm-rpg-v3/templates/item/_unknown.hbs',
      choices: buildChoiceMaps(),
      effects,
      supportsEffects,
    };
  }

  static async _onAddArrayEntry(this: HbmItemSheet, _event: PointerEvent, target: HTMLElement) {
    const path = target.dataset.path;
    if (!path) return;
    const item = (this as unknown as { item: any }).item;
    const current = (foundry.utils.getProperty(item, path) ?? []) as unknown[];
    const template = target.dataset.template;
    const entry = template ? JSON.parse(template) : '';
    await item.update({ [path]: [...current, entry] });
  }

  static async _onRemoveArrayEntry(this: HbmItemSheet, _event: PointerEvent, target: HTMLElement) {
    const path = target.dataset.path;
    const idx = Number(target.dataset.index);
    if (!path || Number.isNaN(idx)) return;
    const item = (this as unknown as { item: any }).item;
    const current = ([...(foundry.utils.getProperty(item, path) ?? [])] as unknown[]);
    current.splice(idx, 1);
    await item.update({ [path]: current });
  }

  static async _onEffectCreate(this: HbmItemSheet) {
    const item = (this as unknown as { item: any }).item;
    const created = await item.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize('HBM.activeEffect.newEffect'),
      icon: 'icons/svg/aura.svg',
      transfer: true,
      disabled: false,
      changes: [],
    }]);
    if (created?.[0]) created[0].sheet?.render(true);
  }

  static async _onEffectEdit(this: HbmItemSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const item = (this as unknown as { item: any }).item;
    const effect = item.effects.get(id);
    effect?.sheet?.render(true);
  }

  static async _onEffectDelete(this: HbmItemSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const item = (this as unknown as { item: any }).item;
    await item.deleteEmbeddedDocuments('ActiveEffect', [id]);
  }

  static async _onEffectToggle(this: HbmItemSheet, _event: PointerEvent, target: HTMLElement) {
    const id = target.dataset.effectId;
    if (!id) return;
    const item = (this as unknown as { item: any }).item;
    const effect = item.effects.get(id);
    if (!effect) return;
    await effect.update({ disabled: !effect.disabled });
  }
}

/** Build localized {key → label} maps for use in <select> options. */
function buildChoiceMaps(): Record<string, Record<string, string>> {
  const localize = (prefix: string, key: string) => {
    const k = `HBM.${prefix}.${key}`;
    const v = game.i18n.localize(k);
    return v === k ? key : v;
  };
  const map = (prefix: string, keys: readonly string[]) =>
    Object.fromEntries(keys.map((k) => [k, localize(prefix, k)]));
  return {
    schools:       map('spellSchool',     SPELL_SCHOOLS as unknown as readonly string[]),
    deities:       map('deity',           SACRED_DEITIES as unknown as readonly string[]),
    sourceBooks:   map('sourceBook',      SOURCE_BOOKS as unknown as readonly string[]),
    aoeShapes:     map('aoeShape',        AOE_SHAPES as unknown as readonly string[]),
    damageTypes:   map('damageType',      SPELL_DAMAGE_TYPES as unknown as readonly string[]),
    triggerEvents: map('triggerEvent',    TRIGGER_EVENTS as unknown as readonly string[]),
  };
}
