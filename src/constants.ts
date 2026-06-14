/**
 * Shared constants for the HbM RPG v3 Foundry system.
 * All identifiers are English; UI labels live in lang/{pl,en}.json.
 */

export const ATTRIBUTES = ['body', 'mind', 'soul', 'magic'] as const;
export type AttributeKey = (typeof ATTRIBUTES)[number];

/** Skill tag categories used by the roll-modifier pipeline. */
export type SkillTag = 'sight' | 'hearing' | 'social' | 'attack' | 'magic' | 'movement';

/**
 * Canonical 24 skills. Each maps to its default associated attribute,
 * but the GM may permit a different attribute for a specific roll
 * (handled at the roller level via attributeOverride).
 */
export const SKILLS: Readonly<Record<string, AttributeKey>> = Object.freeze({
  athletics: 'body',
  agility: 'body',
  strength: 'body',
  melee: 'body',
  ranged: 'body',
  stealth: 'body',
  endurance: 'body',
  reflex: 'body',

  perception: 'mind',
  intuition: 'mind',
  craft: 'mind',
  medicine: 'mind',
  generalLore: 'mind',
  natureLore: 'mind',
  magicLore: 'mind',
  theology: 'mind',

  empathy: 'soul',
  persuasion: 'soul',
  intimidation: 'soul',
  determination: 'soul',
  devotion: 'soul',
  disguise: 'soul',
  animalHandling: 'soul',

  magicalAbilities: 'magic',
});

/**
 * Skill → tag mapping consulted by Active-Effect-driven roll modifiers.
 * `blocksTags` on a condition prevents rolls of any skill containing that tag.
 */
export const SKILL_TAGS: Readonly<Record<string, readonly SkillTag[]>> = Object.freeze({
  athletics: ['movement'],
  agility: ['movement'],
  strength: [],
  melee: ['attack'],
  ranged: ['attack', 'sight'],
  stealth: ['movement', 'sight'],
  endurance: [],
  reflex: [],
  perception: ['sight', 'hearing'],
  intuition: ['social'],
  craft: [],
  medicine: [],
  generalLore: [],
  natureLore: [],
  magicLore: [],
  theology: [],
  empathy: ['social', 'hearing'],
  persuasion: ['social', 'hearing'],
  intimidation: ['social'],
  determination: [],
  devotion: [],
  disguise: ['social'],
  animalHandling: ['social'],
  magicalAbilities: ['magic'],
});

export const SKILL_KEYS = Object.freeze(Object.keys(SKILLS)) as readonly string[];

/**
 * Magic Power Level lookup table (level 0..10 → I..X).
 * Drives dice pool size, max mana per single spell, and total mana per round.
 */
export interface MagicPowerEntry {
  level: number;       // 0..10
  label: string;       // '0' | 'I' | 'II' | ... | 'X'
  dicePool: number;    // dice added when casting
  maxPerSpell: number; // max mana spent on one spell
  manaPerRound: number; // mana budget per combat round
}

export const MAGIC_POWER_TABLE: readonly MagicPowerEntry[] = Object.freeze([
  { level: 0, label: '0', dicePool: 6, maxPerSpell: 10, manaPerRound: 20 },
  { level: 1, label: 'I', dicePool: 4, maxPerSpell: 6, manaPerRound: 12 },
  { level: 2, label: 'II', dicePool: 4, maxPerSpell: 5, manaPerRound: 10 },
  { level: 3, label: 'III', dicePool: 3, maxPerSpell: 5, manaPerRound: 7 },
  { level: 4, label: 'IV', dicePool: 3, maxPerSpell: 4, manaPerRound: 8 },
  { level: 5, label: 'V', dicePool: 3, maxPerSpell: 4, manaPerRound: 6 },
  { level: 6, label: 'VI', dicePool: 2, maxPerSpell: 3, manaPerRound: 6 },
  { level: 7, label: 'VII', dicePool: 2, maxPerSpell: 3, manaPerRound: 4 },
  { level: 8, label: 'VIII', dicePool: 1, maxPerSpell: 2, manaPerRound: 3 },
  { level: 9, label: 'IX', dicePool: 1, maxPerSpell: 1, manaPerRound: 2 },
  { level: 10, label: 'X', dicePool: 0, maxPerSpell: 1, manaPerRound: 1 },
]);

export function getMagicPowerEntry(level: number): MagicPowerEntry {
  const clamped = Math.max(0, Math.min(10, Math.floor(level ?? 0)));
  return MAGIC_POWER_TABLE[clamped]!;
}

/** TS roll defaults */
export const TS_DEFAULT_THRESHOLD = 4;
export const TS_DEFAULT_REQUIRED = 1;
export const TS_DIE_FACES = 6;
export const TS_AUTO_FAILURE_FACE = 1;
export const TS_AUTO_SUCCESS_FACE = 6;

/** Casting modes for spells */
export const CASTING_MODES = ['standard', 'sacred', 'witch', 'blood'] as const;
export type CastingMode = (typeof CASTING_MODES)[number];

/**
 * Spell schools / disciplines (English identifiers).
 * Covers academic, sacred, witch, and forbidden disciplines from all books.
 */
export const SPELL_SCHOOLS = [
  // Generic / unclassified
  'general',
  // Academic disciplines
  'alchemyTransmutation', 'alchemyBrewing', 'botany',
  'elementsAir', 'elementsWater', 'elementsFire', 'elementsEarth',
  'artifice', 'golemancy', 'runes', 'manaSourceMage',
  'illusion', 'sacred', 'sacredExorcism', 'witch', 'necromancy',
  // Forbidden / extra-academic
  'blood', 'crimson', 'abyssAspects', 'abyssPrimal', 'wildWitch',
  'eldritch',
] as const;
export type SpellSchool = (typeof SPELL_SCHOOLS)[number];

/** Sacred Magic deities (sub-school identifier when school === 'sacred'). */
export const SACRED_DEITIES = [
  'common', 'jahwe', 'zeus', 'demeter', 'artemis',
  'hekate', 'aphrodite', 'eros',
] as const;
export type SacredDeity = (typeof SACRED_DEITIES)[number];

/**
 * Witch magic symbols. EXTENSIBLE - additional content may add more.
 * Used for autocomplete only; spell.components.symbols accepts arbitrary strings.
 */
export const WITCH_SYMBOLS: readonly string[] = Object.freeze([
  'Potentia', 'Tutamen', 'Lux', 'Motus', 'Iter', 'Vacuos', 'Vitium',
  'Praecantatio', 'Aer', 'Aqua', 'Gelum', 'Ignis', 'Terra',
  'Cognitio', 'Alienis', 'Illusio', 'Somnium', 'Tenebrae', 'Auram',
  'Vinculum', 'Telum', 'Sensus', 'Perditio', 'Perfodio', 'Sano',
  'Volatus', 'Tempestas',
]);

/** Source-book provenance for compendium content. */
export const SOURCE_BOOKS = [
  'core-rules', 'magic-book', 'arcanum-sanguinis',
  'crimson-cult', 'abyss-curse', 'humanity-guide',
  'bestiary', 'gold-steel-magic',
] as const;
export type SourceBook = (typeof SOURCE_BOOKS)[number];

/** Area-of-effect shapes for spells. */
export const AOE_SHAPES = ['point', 'square', 'rectangle', 'cone', 'sphere', 'line'] as const;
export type AoeShape = (typeof AOE_SHAPES)[number];

/** Spell damage types (extends DAMAGE_TYPES with magical variants). */
export const SPELL_DAMAGE_TYPES = ['magical', 'physicalMagical', 'pure'] as const;
export type SpellDamageType = (typeof SPELL_DAMAGE_TYPES)[number];

/** Trigger event identifiers (reactive spell hooks). */
export const TRIGGER_EVENTS = ['killWithWeapon', 'targetCastsSpell', 'damageTaken', 'turnStart'] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

/** Gear categories */
export const GEAR_CATEGORIES = ['weapon', 'armor', 'equipment'] as const;
export type GearCategory = (typeof GEAR_CATEGORIES)[number];

/** Damage types */
export const DAMAGE_TYPES = ['physical', 'magical', 'environmental'] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** Armor types */
export const ARMOR_TYPES = ['light', 'medium', 'heavy', 'shield'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];

/** Ability action type */
export const ABILITY_TYPES = ['passive', 'active', 'reaction', 'freeAction'] as const;
export type AbilityType = (typeof ABILITY_TYPES)[number];

/** Item rarity (Polish-source naming preserved as identifiers in English form) */
export const RARITIES = ['common', 'uncommon', 'rare', 'veryRare', 'legendary', 'artifact'] as const;
export type Rarity = (typeof RARITIES)[number];

/**
 * Mental illness condition IDs (Klątwa Otchłani VIII).
 * Registered as ActiveEffect-driven status conditions alongside physical conditions.
 */
export const MENTAL_CONDITIONS = ['paranoja', 'fobia', 'depresja', 'mania', 'schizofrenia'] as const;
export type MentalCondition = (typeof MENTAL_CONDITIONS)[number];
