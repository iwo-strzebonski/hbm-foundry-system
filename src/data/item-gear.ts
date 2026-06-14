import {
  makeIntField,
  makeStringField,
  makeBoolField,
  makeHtmlField,
  makeArrayField,
  fields,
} from './fields';
import { GEAR_CATEGORIES, DAMAGE_TYPES, ARMOR_TYPES, RARITIES } from '../constants';

/**
 * Unified Gear item - discriminated by `category`.
 * Weapon/armor/equipment all share base fields; specialised fields
 * are scoped under `weapon` and `armor` sub-schemas.
 */
export class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();
    return {
      category: makeStringField('equipment', {
        blank: false,
        choices: GEAR_CATEGORIES as unknown as readonly string[],
      }),
      rarity: makeStringField('common', {
        blank: false,
        choices: RARITIES as unknown as readonly string[],
      }),
      quantity: makeIntField(1, { min: 0 }),
      weight: makeIntField(0, { min: 0 }),
      value: makeIntField(0, { min: 0 }),
      equipped: makeBoolField(false),
      damageReductionBonus: makeIntField(0, { min: 0 }),
      description: makeHtmlField(''),

      weapon: new f.SchemaField({
        damage: makeStringField(''),
        damageType: makeStringField('physical', {
          blank: false,
          choices: DAMAGE_TYPES as unknown as readonly string[],
        }),
        properties: makeArrayField(new f.StringField({ blank: false })),
      }),

      armor: new f.SchemaField({
        damageReduction: makeIntField(0, { min: 0 }),
        condition: makeIntField(1, { min: 0 }),
        conditionMax: makeIntField(1, { min: 0 }),
        armorType: makeStringField('light', {
          blank: false,
          choices: ARMOR_TYPES as unknown as readonly string[],
        }),
        stealthDisadvantage: makeBoolField(false),
        strengthRequirement: makeIntField(0, { min: 0 }),
      }),
    };
  }

  /** Migrate legacy `armor.armorClass` → `armor.damageReduction`. */
  _initializeSource(data: any, options: any): any {
    const initialized = super._initializeSource(data, options);
    if (initialized?.armor && typeof initialized.armor.armorClass === 'number' && initialized.armor.damageReduction == null) {
      initialized.armor.damageReduction = initialized.armor.armorClass;
      delete initialized.armor.armorClass;
    }
    return initialized;
  }
}
