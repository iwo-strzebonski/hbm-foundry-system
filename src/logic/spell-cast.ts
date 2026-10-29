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
import { manaToBorrow, exhaustionDice, manaExhaustionTier, overLimitTest, applyDiceModifier, SPELL_DAMAGE_PROFILES } from './rules';
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
  /** Modifier to the number of dice in the casting test (+/-, pool never below 0). */
  diceModifier?: number;
  /** Override required successes (used by variableSuccesses summons). */
  requiredOverride?: number;
  speaker?: ChatMessage.SpeakerData;
}

/** A roll made during a cast; rendered inline in the cast card. */
interface CastRollEntry {
  label: string;
  roll: HbmTSRoll;
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

/** Queue a roll for the cast card and play the 3D dice animation if available. */
async function recordRoll(rolls: CastRollEntry[], roll: HbmTSRoll, label: string): Promise<void> {
  rolls.push({ label, roll });
  try {
    await (game as any).dice3d?.showForRoll?.(roll, game.user, true);
  } catch {
    // Dice So Nice is optional; the card still shows the faces.
  }
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
  const rolls: CastRollEntry[] = [];
  if (mode === 'sacred') {
    baseRoll = opts.hekateMode === 'witch'
      ? await castWitch(actor, spell, opts, rolls)
      : await castSacred(actor, spell, opts, rolls);
  } else if (mode === 'witch') {
    baseRoll = await castWitch(actor, spell, opts, rolls);
  } else if (mode === 'blood') {
    baseRoll = await castBlood(actor, spell, opts, rolls);
  } else {
    baseRoll = await castStandard(actor, spell, opts, rolls);
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
  await renderCastCard(actor, spell, opts, baseRoll, damageRoll, triggersRegistered, rolls);

  return { validation, baseRoll, damageRoll, triggersRegistered };
}

async function renderCastCard(
  actor: CastableActor,
  spell: SpellLike,
  opts: CastOptions,
  baseRoll: HbmTSRoll | null,
  damageRoll: Roll | null,
  triggersRegistered: number,
  rolls: CastRollEntry[],
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
      dice: ((damageRoll as any).dice ?? []).map((d: any) => ({
        expression: d.expression,
        results: (d.results ?? []).filter((r: any) => !r.discarded).map((r: any) => r.result),
      })),
      type: spell.system.damageType ?? 'magical',
      ignoresArmor: !!spell.system.ignoresArmor,
      // Magiczny Pocisk: at least 1 damage reaches Żywotność after Pancerz.
      minAfterArmor: ((spell as any).flags?.['hbm-rpg-v3']?.slug ?? (spell.system as any).slug) === 'magic-missile',
      // Shield-breakers / Szkarłatny Pocisk / Prawdziwa Dezintegracja treat the magical defences specially.
      profile: (() => {
        const p = SPELL_DAMAGE_PROFILES[((spell as any).flags?.['hbm-rpg-v3']?.slug ?? (spell.system as any).slug) as string];
        return p ? JSON.stringify(p) : '';
      })(),
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

  const rollsHtml = await Promise.all(rolls.map(async (r) => ({
    label: r.label,
    html: await r.roll.render(),
  })));

  const data = {
    spell: { name: spell.name },
    rolls: rollsHtml,
    mode,
    school: spell.system.school ?? '',
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
    rolls: [...rolls.map((r) => r.roll), ...(damageRoll ? [damageRoll] : [])].map((r) => r.toJSON()),
    flags: { 'hbm-rpg-v3': { spellCast: { spellName: spell.name, success } } },
  });
}

async function castStandard(actor: CastableActor, spell: SpellLike, opts: CastOptions, rolls: CastRollEntry[]): Promise<HbmTSRoll | null> {
  const baseCost = Math.max(0, spell.system.manaCost ?? 0);
  const manaSpent = Math.max(baseCost, Math.floor(opts.manaSpent ?? baseCost));
  const a = actor.system.attributes;

  // Casting beyond the remaining daily pool is allowed: the missing mana is
  // "borrowed" and triggers a Wyczerpanie Many roll (N d6, N = cumulative
  // borrowed mana since the last Długi Odpoczynek, incl. this cast).
  const borrowed = manaToBorrow(manaSpent, a.mana.value);
  const updates: Record<string, any> = { 'system.attributes.mana.value': Math.max(0, a.mana.value - manaSpent) };
  if (borrowed > 0) updates['system.attributes.manaBorrowed'] = (a.manaBorrowed ?? 0) + borrowed;
  if (opts.castAsPrayer) {
    updates['system.attributes.zeal.value'] = a.zeal.value - 1;
  }
  await actor.update(updates);
  if (borrowed > 0) await rollManaExhaustion(actor, exhaustionDice(a.manaBorrowed ?? 0, borrowed));

  const magicDice = typeof a.magic.dicePool === 'number'
    ? a.magic.dicePool
    : getMagicPowerEntry(a.magic.actual ?? a.magic.value ?? 0).dicePool;
  const basePool = opts.castAsPrayer
    ? a.soul.value + (actor.system.skills?.devotion?.value ?? 0)
    : magicDice + (actor.system.skills?.magicalAbilities?.value ?? 0);
  const pool = applyDiceModifier(basePool, opts.diceModifier);
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
  await recordRoll(rolls, baseRoll, flavor);

  // Overcast beyond Maksymalny Koszt Zaklęcia - extra TS test.
  // T depends on the spell's BASE cost; S grows triangularly with the excess
  // (E) over maxPerSpell: S = E * (E + 1) / 2 (Zasada Nadczarowywania Zaklęć).
  if (manaSpent > a.mana.maxPerSpell && a.mana.maxPerSpell > 0) {
    const excess = manaSpent - a.mana.maxPerSpell;
    const { threshold: tThreshold, successes: ySuccesses } = overLimitTest(baseCost, excess);
    const overcastFlavor = `${game.i18n.localize('HBM.spellCast.overcastTest')}: ${spell.name}`;
    const overcastRoll = HbmTSRoll.fromParams({
      pool,
      threshold: tThreshold,
      required: ySuccesses,
      flavor: overcastFlavor,
    });
    await overcastRoll.evaluate();
    await recordRoll(rolls, overcastRoll, overcastFlavor);
    // Failure → Kara za Nieudolność: N d6, N = missing Sukcesy.
    const got = Number((overcastRoll as any).ts?.successes ?? 0);
    if (got < ySuccesses) await rollIncompetencePenalty(actor, ySuccesses - got, baseCost);
  }

  return baseRoll;
}

/** Wyczerpanie Many: roll N d6 and post the tier (tiers in Wyczerpanie Many.md). */
async function rollManaExhaustion(actor: CastableActor, dice: number): Promise<void> {
  if (dice <= 0) return;
  const roll = new Roll(`${dice}d6`);
  await roll.evaluate();
  const tier = manaExhaustionTier(roll.total ?? 0);
  await ChatMessage.create({
    content: `<strong>${(actor as any).name}</strong>: ${game.i18n.localize('HBM.spellCast.manaExhaustion')} (${dice}k6 = ${roll.total}) → <strong>${tier.label}</strong>`,
    rolls: [roll.toJSON()],
    speaker: ChatMessage.getSpeaker({ actor: actor as any }),
  });
}

/** Kara za Nieudolność: N d6 where N = missing Sukcesy; tier 5–8 also drains the daily pool by the base cost. */
async function rollIncompetencePenalty(actor: CastableActor, missing: number, baseCost: number): Promise<void> {
  const roll = new Roll(`${missing}d6`);
  await roll.evaluate();
  const total = roll.total ?? 0;
  if (total >= 5 && total <= 8) {
    const a = actor.system.attributes;
    await actor.update({ 'system.attributes.mana.value': Math.max(0, a.mana.value - baseCost) });
  }
  await ChatMessage.create({
    content: `<strong>${(actor as any).name}</strong>: ${game.i18n.localize('HBM.spellCast.incompetencePenalty')} (${missing}k6 = ${total})`,
    rolls: [roll.toJSON()],
    speaker: ChatMessage.getSpeaker({ actor: actor as any }),
  });
}

async function castSacred(actor: CastableActor, spell: SpellLike, opts: CastOptions, rolls: CastRollEntry[]): Promise<HbmTSRoll | null> {
  const a = actor.system.attributes;
  const zealCost = Math.max(1, opts.zealSpent ?? 1);
  await actor.update({ 'system.attributes.zeal.value': a.zeal.value - zealCost });

  const pool = applyDiceModifier(a.soul.value + (actor.system.skills?.devotion?.value ?? 0), opts.diceModifier);
  const flavor = `${spell.name} - ${game.i18n.localize('HBM.spell.castingMode.sacred')}`;
  const required = opts.requiredOverride ?? spell.system.difficulty.successes ?? TS_DEFAULT_REQUIRED;
  const roll = HbmTSRoll.fromParams({
    pool,
    threshold: spell.system.difficulty.threshold ?? TS_DEFAULT_THRESHOLD,
    required,
    flavor,
  });
  await roll.evaluate();
  await recordRoll(rolls, roll, flavor);
  return roll;
}

async function castWitch(actor: CastableActor, spell: SpellLike, opts: CastOptions, rolls: CastRollEntry[]): Promise<HbmTSRoll | null> {
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
  const basePool = opts.castAsPrayer
    ? a.soul.value + (actor.system.skills?.devotion?.value ?? 0)
    : magicDice + (actor.system.skills?.magicalAbilities?.value ?? 0);
  const pool = applyDiceModifier(basePool, opts.diceModifier);
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
  await recordRoll(rolls, roll, flavor);
  return roll;
}

async function castBlood(actor: CastableActor, spell: SpellLike, opts: CastOptions, rolls: CastRollEntry[]): Promise<HbmTSRoll | null> {
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
  const basePool = opts.castAsPrayer
    ? a.soul.value + (actor.system.skills?.devotion?.value ?? 0)
    : magicDice + (actor.system.skills?.magicalAbilities?.value ?? 0);
  const pool = applyDiceModifier(basePool, opts.diceModifier);
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
  await recordRoll(rolls, roll, flavor);
  return roll;
}
