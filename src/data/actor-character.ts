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
 * Player Character data model.
 *
 * Derived stats (computed in prepareDerivedData):
 *  - attributes.health.max = 3 * (body + mind + soul)
 *  - attributes.zeal.max   = ceil(soul / 2)
 *  - attributes.initiative = mind + skills.reflex.value + skills.perception.value
 *  - attributes.mana.max / .maxPerSpell / magic.dicePool - from MAGIC_POWER_TABLE
 */
export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const f = fields();

    const attributeSchema = () => new f.SchemaField({
      value: makeIntField(1, { min: 1, max: 8 }),
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

    const scheduleRows: Record<string, foundry.data.fields.DataField.Any> = {};
    for (let i = 1; i <= 12; i++) {
      scheduleRows[`row${i}`] = new f.SchemaField({
        hours: makeStringField('', { blank: true }),
        mon: makeStringField('', { blank: true }),
        tue: makeStringField('', { blank: true }),
        wed: makeStringField('', { blank: true }),
        thu: makeStringField('', { blank: true }),
        fri: makeStringField('', { blank: true }),
        sat: makeStringField('', { blank: true }),
      });
    }

    return {
      attributes: new f.SchemaField({
        body: attributeSchema(),
        mind: attributeSchema(),
        soul: attributeSchema(),
        magic: new f.SchemaField({
          value: makeIntField(0, { min: 0, max: 10 }),
          actual: makeIntField(0, { min: 0, max: 10 }), // derived
          dicePool: makeIntField(0, { min: 0 }), // derived
        }),
        health: makeValueMaxField(0, 0),
        mana: new f.SchemaField({
          value: makeIntField(0, { min: 0 }),
          max: makeIntField(0, { min: 0 }),
          maxPerSpell: makeIntField(0, { min: 0 }),
        }),
        zeal: makeValueMaxField(0, 0),
        // Blood Pool (Arcanum Sanguinis Ch. III) - experimental until full spell list ships.
        // Placeholder formula: max = body + soul.
        blood: makeValueMaxField(0, 0),
        // Elixir tolerance (Podręcznik Gry - brewing). Each potion consumed adds 1;
        // recovers 1 per long rest. Soft cap = body + 1; over cap → poisoning.
        elixirTolerance: makeIntField(0, { min: 0 }),
        // Insanity points (Klątwa Otchłani VIII). Each Abyss exposure may add 1; rolls
        // mental-condition table when reaching thresholds.
        insanity: makeIntField(0, { min: 0 }),
        magicalArmor: new f.SchemaField({
          value: makeIntField(0, { min: 0 }),
          max: makeIntField(0, { min: 0 }),
          runicCounter: makeIntField(0, { min: 0 }),
        }),
        magicalShield: new f.SchemaField({
          value: makeIntField(0, { min: 0 }),
        }),
        physicalArmor: new f.SchemaField({
          value: makeIntField(0, { min: 0 }),        // derived
          max: makeIntField(0, { min: 0 }),           // derived: base DR from equipment
          bonus: makeIntField(0, { min: 0 }),         // editable bonus (flat +DR)
          condition: makeIntField(0, { min: 0 }),     // derived: sum of armor conditions
          conditionMax: makeIntField(0, { min: 0 }), // derived: sum of armor conditionMax
        }),
        initiative: new f.SchemaField({
          value: makeIntField(0, { min: 0 }),
          bonus: makeIntField(0, { min: 0 }),
        }),
      }),
      skills: new f.SchemaField(skillEntries),
      details: new f.SchemaField({
        race: makeStringField('', { blank: true }),
        raceId: makeStringField('', { blank: true }),
        classIds: makeArrayField(new f.StringField({ blank: true })),
        year: makeIntField(1, { min: 1, max: 4 }),
        discipline: makeStringField('', { blank: true }),
        title: makeStringField('', { blank: true }),
        biography: makeHtmlField(''),
        customEquipment: makeHtmlField(''), // legacy textarea - kept for migration
        customItems: makeArrayField(new f.SchemaField({
          name: makeStringField('', { blank: true }),
          qty: makeIntField(1, { min: 0 }),
          note: makeStringField('', { blank: true }),
        })),
        experience: makeIntField(0, { min: 0 }),
        money: makeIntField(0, { min: 0 }),
        classSchedule: makeStringField('', { blank: true }),
        schedule: new f.SchemaField(scheduleRows),
        personalDetails: makeHtmlField(''),
        startingYear: makeIntField(2026, { min: 1900 }),
        currentYear: makeIntField(2026, { min: 1900 }),
      }),
      advancement: new f.SchemaField({
        attributePointsAvailable: makeIntField(0, { min: 0 }),
        skillPointsAvailable: makeIntField(0, { min: 0 }),
        freeTalentsAvailable: makeIntField(0, { min: 0 }), // derived
        bonusAttributePoints: makeIntField(0, { min: 0 }),
        bonusSkillPoints: makeIntField(0, { min: 0 }),
        bonusFreeTalents: makeIntField(0, { min: 0 }),
      }),
    };
  }

  /** prepareDerivedData runs after source data loads; compute formulas here. */
  override prepareDerivedData() {
    const self = this as unknown as { parent?: { items?: Iterable<any> } } & Record<string, any>;
    const sys = this as unknown as {
      attributes: {
        body: { value: number };
        mind: { value: number };
        soul: { value: number };
        magic: { value: number; actual: number; dicePool: number };
        health: { value: number; max: number };
        mana: { value: number; max: number; maxPerSpell: number };
        zeal: { value: number; max: number };
        blood: { value: number; max: number };
        elixirTolerance: number;
        insanity: number;
        magicalArmor: { value: number; max: number; runicCounter: number };
        magicalShield: { value: number };
        physicalArmor: { value: number; max: number; condition: number; conditionMax: number };
        initiative: { value: number; bonus: number };
      };
      skills: Record<string, { value: number; defaultAttribute: AttributeKey }>;
      details: { raceId?: string; classIds?: string[] };
      advancement: {
        attributePointsAvailable: number;
        skillPointsAvailable: number;
        freeTalentsAvailable: number;
        bonusAttributePoints: number;
        bonusSkillPoints: number;
        bonusFreeTalents: number;
      };
    };

    const a = sys.attributes;

    a.health.max = 3 * (a.body.value + a.mind.value + a.soul.value);
    if (a.health.value > a.health.max) a.health.value = a.health.max;

    a.zeal.max = Math.ceil(a.soul.value / 2);
    if (a.zeal.value > a.zeal.max) a.zeal.value = a.zeal.max;

    // Compute physical armor DR from equipped gear + talents
    const items = (self.parent?.items ? Array.from(self.parent.items as Iterable<any>) : []) as any[];

    // Calculate actual magic circle based on talents
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

    const mp = getMagicPowerEntry(a.magic.actual);
    a.magic.dicePool = mp.dicePool;
    a.mana.max = mp.manaPerRound;
    a.mana.maxPerSpell = mp.maxPerSpell;
    if (a.mana.value > a.mana.max) a.mana.value = a.mana.max;

    // Count battle-readiness stacks for initiative bonus (+2 per copy)
    let initiativeBonus = 0;
    // Count Man of Iron copies for passive armor (only applies when no physical armor is worn)
    let manOfIronStacks = 0;
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
        if (
          slug === 'man-of-iron' || slug === 'czlowiek-z-zelaza' ||
          name === 'cz\u0142owiek z \u017celaza' || name === 'man of iron'
        ) {
          manOfIronStacks += 1;
        }
      }
    }

    a.initiative.value =
      a.mind.value +
      (sys.skills.reflex?.value ?? 0) +
      (sys.skills.perception?.value ?? 0) +
      initiativeBonus +
      (a.initiative.bonus ?? 0);

    // Clamp magical armor / shield
    if (a.magicalArmor.value > a.magicalArmor.max) a.magicalArmor.value = a.magicalArmor.max;

    let armorDR = 0;
    let armorPieces = 0;
    let totalArmorCondition = 0;
    let totalArmorConditionMax = 0;
    // Compute effective DR per piece using condition scaling
    let effectiveDR = 0;
    for (const it of items) {
      if (it.type === 'gear') {
        const g = it.system;
        if (!g) continue;
        if (g.equipped && g.category === 'armor') {
          const baseDR = Number(g.armor?.damageReduction ?? 0);
          const cond = Number(g.armor?.condition ?? 0);
          const condMax = Number(g.armor?.conditionMax ?? 1);
          armorDR += baseDR;
          armorPieces += 1;
          totalArmorCondition += cond;
          totalArmorConditionMax += condMax;
          // Condition-scaled DR: broken armor (cond=0) gives 0 DR
          if (condMax > 0) {
            effectiveDR += Math.floor(baseDR * (cond / condMax));
          }
        }
      }
    }

    // physicalArmorBonus is stored/editable; add it to effective DR
    const paBonus = (sys as any).attributes?.physicalArmor?.bonus ?? 0;
    a.physicalArmor.max = Math.max(0, armorDR + paBonus);
    a.physicalArmor.value = Math.max(0, effectiveDR + paBonus);

    if (armorPieces > 0) {
      a.physicalArmor.condition = totalArmorCondition;
      a.physicalArmor.conditionMax = totalArmorConditionMax;
    }

    // Man of Iron: +1 passive armor per stack, only when wearing no physical armor
    if (manOfIronStacks > 0 && armorPieces === 0) {
      a.physicalArmor.max = Math.max(a.physicalArmor.max, manOfIronStacks);
      a.physicalArmor.value = Math.max(a.physicalArmor.value, manOfIronStacks);
    }

    // Blood Pool (placeholder formula): max = body + soul.
    a.blood.max = a.body.value + a.soul.value;
    if (a.blood.value > a.blood.max) a.blood.value = a.blood.max;
  }

  /**
   * Migration shim: map legacy `attributes.armor` (single number) to new
   * `physicalArmor.value` so existing characters do not crash on load.
   */
  _initializeSource(data: any, options: any): any {
    const initialized = super._initializeSource(data, options);
    if (initialized?.attributes && typeof initialized.attributes.armor === 'number') {
      const legacy = initialized.attributes.armor;
      if (!initialized.attributes.physicalArmor) {
        initialized.attributes.physicalArmor = { value: legacy, condition: 1, conditionMax: 1 };
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
