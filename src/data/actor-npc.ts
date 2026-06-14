import {
  makeIntField,
  makeStringField,
  makeHtmlField,
  makeValueMaxField,
  makeArrayField,
  fields,
} from './fields';
import { ATTRIBUTES, SKILL_KEYS, SKILLS, AttributeKey, getMagicPowerEntry } from '../constants';

/**
 * NPC / Creature data model.
 * Looser than character (no derived health formula - set directly).
 */
export class NpcData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();

    const attackSchema = () => new f.SchemaField({
      name: makeStringField(''),
      description: makeStringField(''),
      damage: makeStringField(''),
      damageType: makeStringField('physical'),
      bonus: makeIntField(0),
    });

    const namedEntry = () => new f.SchemaField({
      name: makeStringField(''),
      description: makeStringField(''),
    });

    const skillEntries: Record<string, foundry.data.fields.DataField.Any> = {};
    for (const key of SKILL_KEYS) {
      skillEntries[key] = new f.SchemaField({
        value: makeIntField(0, { min: 0, max: 8 }),
        defaultAttribute: makeStringField(SKILLS[key] as AttributeKey, {
          blank: false,
          choices: ATTRIBUTES as unknown as readonly string[],
        }),
      });
    }

    return {
      attributes: new f.SchemaField({
        body: new f.SchemaField({ value: makeIntField(1, { min: 1, max: 12 }) }),
        mind: new f.SchemaField({ value: makeIntField(1, { min: 1, max: 12 }) }),
        soul: new f.SchemaField({ value: makeIntField(1, { min: 1, max: 12 }) }),
        magic: new f.SchemaField({
          value: makeIntField(0, { min: 0, max: 10 }),
          actual: makeIntField(0, { min: 0, max: 10 }), // derived
        }),
        mana: new f.SchemaField({
          value: makeIntField(0, { min: 0 }),
          max: makeIntField(0, { min: 0 }),
          maxPerSpell: makeIntField(0, { min: 0 }),
        }),
        zeal: makeValueMaxField(0, 0),
        blood: makeValueMaxField(0, 0),
        health: makeValueMaxField(1, 1),
        magicalArmor: makeValueMaxField(0, 0),
        magicalShield: makeValueMaxField(0, 0),
        physicalArmor: new f.SchemaField({ value: makeIntField(0, { min: 0 }) }),
        initiative: new f.SchemaField({
          value: makeIntField(0, { min: 0 }),
          bonus: makeIntField(0, { min: 0 }),
        }),
        speed: makeStringField('5m'),
      }),
      skills: new f.SchemaField(skillEntries),
      details: new f.SchemaField({
        type: makeStringField(''),
        size: makeStringField('medium'),
        alignment: makeStringField(''),
        xp: makeIntField(0, { min: 0 }),
        senses: makeStringField(''),
        languages: makeStringField(''),
        customEquipment: makeHtmlField(''),
        money: makeIntField(0, { min: 0 }),
        startingYear: makeIntField(2026, { min: 1900 }),
        currentYear: makeIntField(2026, { min: 1900 }),
      }),
      combat: new f.SchemaField({
        attacks: makeArrayField(attackSchema()),
        specialAbilities: makeArrayField(namedEntry()),
        reactions: makeArrayField(namedEntry()),
        legendaryActions: makeArrayField(namedEntry()),
      }),
      defenses: new f.SchemaField({
        savingThrows: makeArrayField(new f.StringField({ blank: false })),
        damageResistances: makeArrayField(new f.StringField({ blank: false })),
        damageImmunities: makeArrayField(new f.StringField({ blank: false })),
        conditionImmunities: makeArrayField(new f.StringField({ blank: false })),
      }),
      lore: new f.SchemaField({
        description: makeHtmlField(''),
        habitat: makeStringField(''),
        behavior: makeStringField(''),
        history: makeStringField(''),
      }),
    };
  }

  override prepareDerivedData() {
    const self = this as unknown as { parent?: { items?: Iterable<any> } } & Record<string, any>;
    const sys = this as unknown as {
      attributes: {
        mind: { value: number };
        magic: { value: number; actual: number };
        mana: { value: number; max: number; maxPerSpell: number };
        health: { value: number; max: number };
        magicalArmor: { value: number; max: number };
        magicalShield: { value: number; max: number };
        initiative: { value: number; bonus: number };
      };
    };
    const a = sys.attributes;

    // Compute magic.actual based on NPC talents
    const items = (self.parent?.items ? Array.from(self.parent.items as Iterable<any>) : []) as any[];
    let magicMod = 0;
    for (const it of items) {
      if (it.type === 'talent') {
        const slug = it.flags?.['hbm-rpg-v3']?.slug || '';
        const name = it.name?.toLowerCase() || '';
        if (slug === 'jednosc-z-magia' || slug === 'unity-with-magic' || name === 'jedność z magią' || name === 'unity with magic') {
          magicMod -= 1;
        } else if (slug === 'odpornosc-na-magie' || slug === 'magic-resistance' || name === 'odporność na magię' || name === 'magic resistance') {
          magicMod += 1;
        }
      }
    }
    const actualMagic = a.magic.value + magicMod;
    a.magic.actual = Math.max(0, Math.min(10, actualMagic));

    // Derive NPC mana from MAGIC_POWER_TABLE
    const mp = getMagicPowerEntry(a.magic.actual);
    a.mana.max = mp.manaPerRound;
    a.mana.maxPerSpell = mp.maxPerSpell;
    if (a.mana.value > a.mana.max) a.mana.value = a.mana.max;

    let initiativeBonus = 0;
    for (const it of items) {
      if (it.type === 'talent') {
        const slug = it.flags?.['hbm-rpg-v3']?.slug || '';
        const name = it.name?.toLowerCase() || '';
        if (
          slug === 'battle-readiness' || slug === 'gotowosc-do-walki' ||
          name === 'gotowo\u015b\u0107 do walki' || name === 'battle readiness'
        ) {
          initiativeBonus += 2;
        }
      }
    }

    a.initiative.value =
      a.mind.value +
      initiativeBonus +
      (a.initiative.bonus ?? 0);

    if (a.health.value > a.health.max) a.health.value = a.health.max;
    if (a.magicalArmor.value > a.magicalArmor.max) a.magicalArmor.value = a.magicalArmor.max;
    if (a.magicalShield.value > a.magicalShield.max) a.magicalShield.value = a.magicalShield.max;
  }

  /** Migrate legacy `attributes.armor` → `physicalArmor.value` */
  _initializeSource(data: any, options: any): any {
    const initialized = super._initializeSource(data, options);
    if (initialized?.attributes && typeof initialized.attributes.armor === 'number') {
      const legacy = initialized.attributes.armor;
      if (!initialized.attributes.physicalArmor) {
        initialized.attributes.physicalArmor = { value: legacy };
      }
      delete initialized.attributes.armor;
    }
    if (initialized?.attributes && typeof initialized.attributes.initiative === 'number') {
      const legacy = initialized.attributes.initiative;
      initialized.attributes.initiative = { value: legacy, bonus: 0 };
    }
    return initialized;
  }
}
