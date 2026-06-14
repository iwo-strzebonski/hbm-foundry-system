/**
 * Spell casting workflow - handles standard, sacred (Magia Sakralna),
 * witch (Wiedźmia Magia), and blood (Magia Krwi) modes.
 *
 * Pipeline per cast:
 *   1. validateCast()              - gate on resources, race, talent, discipline,
 *                                    deity, group-cast, in-combat, witch symbols
 *   2. Resource deduction          - mana / zeal / blood
 *   3. TS test roll                - pool depends on mode
 *   4. (success) damage roll       - parses spell.damageBase
 *   5. Status effect auto-apply    - from spell.statusEffects[]
 *   6. Trigger registration        - from spell.triggers[]
 *
 * Bypasses for GM workflows: opts.bypassSuperspellWarning, opts.bypassNonCombatBlock.
 */

import { HbmTSRoll } from '../dice/ts-roll';
import { TS_DEFAULT_REQUIRED, TS_DEFAULT_THRESHOLD, getMagicPowerEntry } from '../constants';
import { validateCast } from './spell-validation';
import type { ValidationResult } from './spell-validation';
import { rollSpellDamage } from './spell-damage';
import { registerSpellTriggers } from './spell-triggers';
import { CONDITIONS } from './conditions';

export interface CastableActor {
  id: string;
  name: string;
  type: 'character' | 'npc';
  system: {
    attributes: {
      magic: { value: number; actual?: number; dicePool?: number };
      soul: { value: number };
      mana: { value: number; max: number; maxPerSpell: number };
      zeal: { value: number; max: number };
      blood?: { value: number; max: number };
    };
    skills?: Record<string, { value: number }>;
  };
  update: (changes: Record<string, unknown>) => Promise<unknown>;
}

export interface SpellLike {
  id?: string;
  name: string;
  system: {
    castingMode: 'standard' | 'sacred' | 'witch' | 'blood';
    school?: string;
    deity?: string;
    manaCost: number;
    bloodCost?: number;
    complexityLevel: number;
    isSuperspell?: boolean;
    requiresGroupCast?: boolean;
    minCasters?: number;
    nonCombatOnly?: boolean;
    damageBase?: string;
    damageType?: string;
    ignoresArmor?: boolean;
    statusEffects?: string[];
    saveAttribute?: string;
    saveSkill?: string;
    triggers?: Array<{ event: string; effect: string }>;
    components?: { symbols?: string[] };
    requirements?: { race?: string[]; talent?: string[]; discipline?: string[] };
    difficulty: { threshold: number; successes: number };
  };
}

export interface CastOptions {
  manaSpent?: number;
  zealSpent?: number;
  bloodSpent?: number;
  hekateMode?: 'sacred' | 'witch';
  castAsPrayer?: boolean;
  bypassSuperspellWarning?: boolean;
  bypassNonCombatBlock?: boolean;
  groupCasters?: string[];
  /** Override required successes (used by variableSuccesses summons). */
  requiredOverride?: number;
  speaker?: ChatMessage.SpeakerData;
}

export interface CastResult {
  validation: ValidationResult;
  baseRoll: HbmTSRoll | null;
  damageRoll: Roll | null;
  triggersRegistered: number;
}

function notify(text: string, severity: 'warn' | 'error' | 'info' = 'info'): void {
  const u = ui as unknown as { notifications?: { warn: (s: string) => void; error: (s: string) => void; info: (s: string) => void } };
  u.notifications?.[severity](text);
}

export async function castSpell(actor: CastableActor, spell: SpellLike, opts: CastOptions = {}): Promise<CastResult> {
  // 1. Validate
  const validation = validateCast(actor, spell, opts);
  if (!validation.ok) {
    for (const err of validation.errors) {
      notify(err.i18nKey ? game.i18n.format(err.i18nKey, (err.i18nArgs ?? {}) as Record<string, string>) : err.message, 'warn');
    }
    return { validation, baseRoll: null, damageRoll: null, triggersRegistered: 0 };
  }
  for (const w of validation.warnings) {
    notify(w.i18nKey ? game.i18n.format(w.i18nKey, (w.i18nArgs ?? {}) as Record<string, string>) : w.message, 'info');
  }

  // 2-3. Mode dispatch
  const mode = spell.system.castingMode ?? 'standard';
  let baseRoll: HbmTSRoll | null = null;
  if (mode === 'sacred') {
    baseRoll = opts.hekateMode === 'witch'
      ? await castWitch(actor, spell, opts)
      : await castSacred(actor, spell, opts);
  } else if (mode === 'witch') {
    baseRoll = await castWitch(actor, spell, opts);
  } else if (mode === 'blood') {
    baseRoll = await castBlood(actor, spell, opts);
  } else {
    baseRoll = await castStandard(actor, spell, opts);
  }

  let damageRoll: Roll | null = null;
  let triggersRegistered = 0;

  if (baseRoll?.ts?.isSuccess) {
    // 4. Damage
    if (spell.system.damageBase) {
      damageRoll = await rollSpellDamage(spell.system.damageBase, { actor, spellName: spell.name });
    }

    // 6. Triggers
    triggersRegistered = await registerSpellTriggers(actor as any, spell);
  }

  // Render unified rich chat card (Phase 1.6)
  await renderCastCard(actor, spell, opts, baseRoll, damageRoll, triggersRegistered);

  return { validation, baseRoll, damageRoll, triggersRegistered };
}

async function renderCastCard(
  actor: CastableActor,
  spell: SpellLike,
  opts: CastOptions,
  baseRoll: HbmTSRoll | null,
  damageRoll: Roll | null,
  triggersRegistered: number,
): Promise<void> {
  const success = baseRoll?.ts?.isSuccess ?? false;
  const mode = opts.castAsPrayer ? 'prayer' : (spell.system.castingMode ?? 'standard');

  // Costs ledger
  const costs: Array<{ label: string; amount: number }> = [];
  if ((opts.manaSpent ?? 0) > 0) costs.push({ label: game.i18n.localize('HBM.spellCast.manaSpent'), amount: opts.manaSpent! });
  if (opts.castAsPrayer) {
    costs.push({ label: game.i18n.localize('HBM.spellCast.zealSpent'), amount: 1 });
  } else if ((opts.zealSpent ?? 0) > 0) {
    costs.push({ label: game.i18n.localize('HBM.spellCast.zealSpent'), amount: opts.zealSpent! });
  }
  if ((opts.bloodSpent ?? 0) > 0) costs.push({ label: game.i18n.localize('HBM.spellCast.bloodSpent'), amount: opts.bloodSpent! });

  // Damage block
  let damage: Record<string, unknown> | null = null;
  if (success && damageRoll) {
    const targets: Array<{ uuid: string; name: string }> = [];
    const userTargets = (game.user as any)?.targets;
    if (userTargets && typeof userTargets[Symbol.iterator] === 'function') {
      for (const t of userTargets) {
        if (t?.actor?.uuid) targets.push({ uuid: t.actor.uuid, name: t.actor.name ?? t.name });
      }
    }
    damage = {
      total: damageRoll.total,
      formula: damageRoll.formula,
      type: spell.system.damageType ?? 'magical',
      ignoresArmor: !!spell.system.ignoresArmor,
      targets: targets.length > 0 ? targets : null,
    };
  }

  // Status effects (with apply buttons)
  const statusEffects: Array<{ id: string; label: string }> = [];
  if (success && Array.isArray(spell.system.statusEffects)) {
    for (const id of spell.system.statusEffects) {
      const def = CONDITIONS.find((c) => c.id === id);
      const label = def ? game.i18n.localize(def.i18nKey) : id;
      statusEffects.push({ id, label });
    }
  }

  // Save line
  const save = success && spell.system.saveAttribute
    ? { attribute: spell.system.saveAttribute, skill: spell.system.saveSkill ?? '' }
    : null;

  const triggers = success && triggersRegistered > 0 && Array.isArray(spell.system.triggers)
    ? spell.system.triggers
    : [];

  const data = {
    spell: { name: spell.name },
    mode,
    school: spell.system.school ?? '',
    circle: (spell.system as any).circle ?? 0,
    outcome: { success },
    costs,
    damage,
    save,
    statusEffects,
    triggers,
    description: (spell.system as any).description ?? '',
  };

  const html = await renderTemplate('systems/hbm-rpg-v3/templates/chat/spell-cast.hbs', data);
  await ChatMessage.create({
    content: html,
    speaker: opts.speaker ?? ChatMessage.getSpeaker({ actor: actor as any }),
    flags: { 'hbm-rpg-v3': { spellCast: { spellName: spell.name, success } } },
  });
}

async function castStandard(actor: CastableActor, spell: SpellLike, opts: CastOptions): Promise<HbmTSRoll | null> {
  const baseCost = Math.max(0, spell.system.manaCost ?? 0);
  const manaSpent = Math.max(baseCost, Math.floor(opts.manaSpent ?? baseCost));
  const a = actor.system.attributes;

  const updates: Record<string, any> = { 'system.attributes.mana.value': a.mana.value - manaSpent };
  if (opts.castAsPrayer) {
    updates['system.attributes.zeal.value'] = a.zeal.value - 1;
  }
  await actor.update(updates);

  const magicDice = typeof a.magic.dicePool === 'number'
    ? a.magic.dicePool
    : getMagicPowerEntry(a.magic.actual ?? a.magic.value ?? 0).dicePool;
  const pool = opts.castAsPrayer
    ? a.soul.value + (actor.system.skills?.devotion?.value ?? 0)
    : magicDice + (actor.system.skills?.magicalAbilities?.value ?? 0);
  const flavor = opts.castAsPrayer
    ? `${spell.name} - ${game.i18n.localize('HBM.spell.castingMode.prayer')}`
    : `${spell.name}`;
  const required = opts.requiredOverride ?? spell.system.difficulty.successes ?? TS_DEFAULT_REQUIRED;
  const baseRoll = HbmTSRoll.fromParams({
    pool,
    threshold: spell.system.difficulty.threshold ?? TS_DEFAULT_THRESHOLD,
    required,
    flavor,
  });
  await baseRoll.evaluate();
  await baseRoll.toMessage({ flavor, speaker: opts.speaker });

  // Overcast - extra TS test if manaSpent exceeds maxPerSpell.
  if (manaSpent > a.mana.maxPerSpell && a.mana.maxPerSpell > 0) {
    const excess = manaSpent - a.mana.maxPerSpell;
    const tThreshold = Math.min(6, Math.max(2, baseCost));
    const ySuccesses = Math.min(10, Math.max(1, excess));
    const overcastFlavor = `${game.i18n.localize('HBM.spellCast.overcastTest')}: ${spell.name}`;
    const overcastRoll = HbmTSRoll.fromParams({
      pool,
      threshold: tThreshold,
      required: ySuccesses,
      flavor: overcastFlavor,
    });
    await overcastRoll.evaluate();
    await overcastRoll.toMessage({ flavor: overcastFlavor, speaker: opts.speaker });
  }

  return baseRoll;
}

async function castSacred(actor: CastableActor, spell: SpellLike, opts: CastOptions): Promise<HbmTSRoll | null> {
  const a = actor.system.attributes;
  const zealCost = Math.max(1, opts.zealSpent ?? 1);
  await actor.update({ 'system.attributes.zeal.value': a.zeal.value - zealCost });

  const pool = a.soul.value + (actor.system.skills?.devotion?.value ?? 0);
  const flavor = `${spell.name} - ${game.i18n.localize('HBM.spell.castingMode.sacred')}`;
  const required = opts.requiredOverride ?? spell.system.difficulty.successes ?? TS_DEFAULT_REQUIRED;
  const roll = HbmTSRoll.fromParams({
    pool,
    threshold: spell.system.difficulty.threshold ?? TS_DEFAULT_THRESHOLD,
    required,
    flavor,
  });
  await roll.evaluate();
  await roll.toMessage({ flavor, speaker: opts.speaker });
  return roll;
}

async function castWitch(actor: CastableActor, spell: SpellLike, opts: CastOptions): Promise<HbmTSRoll | null> {
  const a = actor.system.attributes;
  const required = Math.max(0, spell.system.complexityLevel ?? spell.system.components?.symbols?.length ?? 0);
  const maxSymbols = Math.ceil(a.magic.actual / 2);

  // Witch magic still has a mana cost.
  const baseCost = Math.max(0, spell.system.manaCost ?? 0);
  const updates: Record<string, any> = { 'system.attributes.mana.value': a.mana.value - baseCost };
  if (opts.castAsPrayer) {
    updates['system.attributes.zeal.value'] = a.zeal.value - 1;
  }
  await actor.update(updates);

  const magicDice = typeof (a.magic as any).dicePool === 'number'
    ? (a.magic as any).dicePool
    : getMagicPowerEntry((a.magic as any).actual ?? a.magic.value ?? 0).dicePool;
  const pool = opts.castAsPrayer
    ? a.soul.value + (actor.system.skills?.devotion?.value ?? 0)
    : magicDice + (actor.system.skills?.magicalAbilities?.value ?? 0);
  const flavor = opts.castAsPrayer
    ? `${spell.name} - ${game.i18n.localize('HBM.spell.castingMode.prayer')} (${required}/${maxSymbols})`
    : `${spell.name} - ${game.i18n.localize('HBM.spell.castingMode.witch')} (${required}/${maxSymbols})`;
  const reqSuccesses = opts.requiredOverride ?? spell.system.difficulty.successes ?? TS_DEFAULT_REQUIRED;
  const roll = HbmTSRoll.fromParams({
    pool,
    threshold: spell.system.difficulty.threshold ?? TS_DEFAULT_THRESHOLD,
    required: reqSuccesses,
    flavor,
  });
  await roll.evaluate();
  await roll.toMessage({ flavor, speaker: opts.speaker });
  return roll;
}

async function castBlood(actor: CastableActor, spell: SpellLike, opts: CastOptions): Promise<HbmTSRoll | null> {
  const a = actor.system.attributes;
  const baseCost = Math.max(0, spell.system.bloodCost ?? 0);
  const bloodSpent = Math.max(baseCost, Math.floor(opts.bloodSpent ?? baseCost));
  const blood = a.blood;

  const updates: Record<string, any> = {};
  if (blood) {
    updates['system.attributes.blood.value'] = Math.max(0, blood.value - bloodSpent);
  }

  // Mana cost (some blood spells may also have one)
  const manaCost = Math.max(0, spell.system.manaCost ?? 0);
  if (manaCost > 0) {
    updates['system.attributes.mana.value'] = a.mana.value - manaCost;
  }
  if (opts.castAsPrayer) {
    updates['system.attributes.zeal.value'] = a.zeal.value - 1;
  }
  await actor.update(updates);

  const magicDice = typeof (a.magic as any).dicePool === 'number'
    ? (a.magic as any).dicePool
    : getMagicPowerEntry((a.magic as any).actual ?? a.magic.value ?? 0).dicePool;
  const pool = opts.castAsPrayer
    ? a.soul.value + (actor.system.skills?.devotion?.value ?? 0)
    : magicDice + (actor.system.skills?.magicalAbilities?.value ?? 0);
  const flavor = opts.castAsPrayer
    ? `${spell.name} - ${game.i18n.localize('HBM.spell.castingMode.prayer')}`
    : `${spell.name} - ${game.i18n.localize('HBM.spell.castingMode.blood')}`;
  const required = opts.requiredOverride ?? spell.system.difficulty.successes ?? TS_DEFAULT_REQUIRED;
  const roll = HbmTSRoll.fromParams({
    pool,
    threshold: spell.system.difficulty.threshold ?? TS_DEFAULT_THRESHOLD,
    required,
    flavor,
  });
  await roll.evaluate();
  await roll.toMessage({ flavor, speaker: opts.speaker });
  return roll;
}
