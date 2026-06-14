import {
  makeIntField,
  makeStringField,
  makeBoolField,
  makeHtmlField,
  makeArrayField,
  fields,
} from './fields';
import {
  CASTING_MODES,
  SPELL_SCHOOLS,
  SACRED_DEITIES,
  SOURCE_BOOKS,
  AOE_SHAPES,
  SPELL_DAMAGE_TYPES,
  TRIGGER_EVENTS,
  TS_DEFAULT_THRESHOLD,
  TS_DEFAULT_REQUIRED,
} from '../constants';

export class SpellData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();
    return {
      // Identification
      circle: makeIntField(1, { min: 0, max: 9 }),
      school: makeStringField('', { blank: true, choices: SPELL_SCHOOLS as unknown as readonly string[] }),
      discipline: makeStringField(''),
      deity: makeStringField('', { blank: true, choices: SACRED_DEITIES as unknown as readonly string[] }),
      sourceBook: makeStringField('', { blank: true, choices: SOURCE_BOOKS as unknown as readonly string[] }),

      // Casting mode + resources
      castingMode: makeStringField('standard', { blank: false, choices: CASTING_MODES as unknown as readonly string[] }),
      manaCost: makeIntField(1, { min: 0 }),
      bloodCost: makeIntField(0, { min: 0 }),

      // Difficulty
      difficulty: new f.SchemaField({
        threshold: makeIntField(TS_DEFAULT_THRESHOLD, { min: 2, max: 6 }),
        successes: makeIntField(TS_DEFAULT_REQUIRED, { min: 1, max: 10 }),
      }),

      // Components
      components: new f.SchemaField({
        verbal: makeBoolField(false),
        somatic: makeBoolField(false),
        material: makeStringField(''),
        symbols: makeArrayField(new f.StringField({ blank: false })),
      }),

      // Timing & geometry
      castingTime: makeStringField('1 akcja'),
      castingTimeRounds: makeIntField(0, { min: 0 }),
      castingTimeMinutes: makeIntField(0, { min: 0 }),
      range: makeStringField(''),
      targets: makeStringField(''),
      duration: makeStringField(''),
      areaOfEffect: new f.SchemaField({
        shape: makeStringField('point', { blank: false, choices: AOE_SHAPES as unknown as readonly string[] }),
        x: makeIntField(0, { min: 0 }),
        y: makeIntField(0, { min: 0 }),
        unit: makeStringField('m'),
      }),

      // Damage
      damageBase: makeStringField(''),
      damageType: makeStringField('magical', { blank: false, choices: SPELL_DAMAGE_TYPES as unknown as readonly string[] }),
      ignoresArmor: makeBoolField(false),

      // Status effects on hit
      statusEffects: makeArrayField(new f.StringField({ blank: false })),
      saveAttribute: makeStringField(''),
      saveSkill: makeStringField(''),

      // Requirements
      requirements: new f.SchemaField({
        race: makeArrayField(new f.StringField({ blank: false })),
        talent: makeArrayField(new f.StringField({ blank: false })),
        discipline: makeArrayField(new f.StringField({ blank: false })),
      }),

      // Flags
      isSuperspell: makeBoolField(false),
      requiresGroupCast: makeBoolField(false),
      minCasters: makeIntField(1, { min: 1 }),
      nonCombatOnly: makeBoolField(false),

      // Overcast - structured
      overcastOptions: makeArrayField(new f.SchemaField({
        description: makeStringField(''),
        manaPerStep: makeIntField(1, { min: 0 }),
      })),

      // Reactive triggers
      triggers: makeArrayField(new f.SchemaField({
        event: makeStringField('killWithWeapon', { blank: false, choices: TRIGGER_EVENTS as unknown as readonly string[] }),
        effect: makeStringField(''),
      })),

      // Variable success summons (Przywołanie Istoty z Otchłani)
      variableSuccesses: makeArrayField(new f.SchemaField({
        label: makeStringField(''),
        successes: makeIntField(1, { min: 1, max: 10 }),
      })),

      // Description
      description: makeHtmlField(''),
      higherCircles: makeHtmlField(''), // legacy - superseded by overcastOptions

      // Legacy fields (kept for migration; will be removed in a later release)
      overcasting: makeStringField(''),
      complexityLevel: makeIntField(0, { min: 0, max: 10 }),
    };
  }
}
