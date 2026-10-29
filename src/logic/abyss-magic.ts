/**
 * Magia Otchłani - Abyss Magic logic (Klątwa Otchłani Ch. III–VIII).
 *
 * The Abyss splits into two disciplines:
 *   - Magia Aspektów  ("aspects")  - controlled, low-risk, predictable
 *   - Pierwotna Magia ("primal")   - chaotic, high-power, requires `Dary Otchłani` rolls
 *
 * This module exposes:
 *   - dispatchAbyssCast(spell)      - returns 'aspects' | 'primal' from spell.discipline.
 *   - rollAbyssGift(actor)          - d100 against a roll table (resolved at runtime
 *                                     from the `roll-tables-abyss.dary-otchlani` pack
 *                                     when present; otherwise falls back to a chat
 *                                     prompt for the GM).
 *   - rollMistrzLosuPenalty(actor)  - d100 penalty roll (Klątwa Otchłani VII).
 *   - addInsanity(actor, n)         - adds Punkty Obłędu; at Próg Obłędu resets them,
 *                                     rolls the illness k100 and fires `hbm.mentalIllness`.
 */

import type { CastableActor } from './spell-cast';
import { madnessThreshold } from './rules';

export type AbyssDiscipline = 'aspects' | 'primal';

const PRIMAL_KEYS = new Set(['primal', 'pierwotna-magia', 'pierwotna_magia', 'magia-otchlani-pierwotna']);

interface SpellLikeForAbyss {
  system?: {
    school?: string;
    discipline?: string | string[];
    requirements?: { discipline?: string[] };
  };
}

export function dispatchAbyssCast(spell: SpellLikeForAbyss): AbyssDiscipline {
  const disc = spell.system?.discipline ?? spell.system?.requirements?.discipline ?? [];
  const list = (Array.isArray(disc) ? disc : [disc]).map((s) => String(s).toLowerCase());
  for (const d of list) {
    if (PRIMAL_KEYS.has(d)) return 'primal';
  }
  return 'aspects';
}

/**
 * Punkty Obłędu (Choroby Psychiczne). On reaching Próg Obłędu (Dusza + 3, Krasnolud +1) the points reset
 * to 0 (the excess is lost) and the character gains one illness: k100 against the 50-illness table in the
 * vault (`rules/02. Klątwa Otchłani/Rozdział IV - Choroby Psychiczne.md`), re-rolling duplicates. The table
 * itself is not copied here, so the roll is posted to chat for the GM and `hbm.mentalIllness` is fired.
 */
export async function addInsanity(actor: CastableActor, n: number): Promise<{ before: number; after: number; thresholdsCrossed: number[] }> {
  if (n <= 0) return { before: 0, after: 0, thresholdsCrossed: [] };
  const attrs = actor.system.attributes as any;
  const before = (attrs.insanity ?? 0) as number;
  const after = before + n;
  const raceItem = (actor as any).items?.find?.((i: any) => i.type === 'race');
  const raceId = String(raceItem?.system?.raceId ?? raceItem?.name ?? (actor as any).system?.details?.raceId ?? '');
  const threshold = madnessThreshold(Number(attrs.soul?.value ?? 0), raceId);
  if (after < threshold) {
    await actor.update({ 'system.attributes.insanity': after });
    return { before, after, thresholdsCrossed: [] };
  }
  await actor.update({ 'system.attributes.insanity': 0 });
  const roll = new Roll('1d100');
  await roll.evaluate();
  await roll.toMessage({
    flavor: `${game.i18n.localize('HBM.insanity.illnessRoll')} - ${actor.name}`,
    speaker: ChatMessage.getSpeaker({ actor: actor as unknown as Actor }),
  });
  Hooks.callAll('hbm.mentalIllness', actor, { before, after, threshold, roll: roll.total });
  return { before, after: 0, thresholdsCrossed: [threshold] };
}

/** Roll d100 against a named table inside the abyss roll-tables pack. */
export async function rollAbyssGift(actor: CastableActor, tableName = 'dary-otchlani'): Promise<Roll> {
  return rollAgainstAbyssTable(actor, tableName, 'Dary Otchłani');
}

export async function rollMistrzLosuPenalty(actor: CastableActor): Promise<Roll> {
  return rollAgainstAbyssTable(actor, 'mistrz-losu', 'Mistrz Losu');
}

async function rollAgainstAbyssTable(actor: CastableActor, slug: string, flavor: string): Promise<Roll> {
  const roll = new Roll('1d100');
  await roll.evaluate();
  const speaker = ChatMessage.getSpeaker({ actor: actor as unknown as Actor });
  await roll.toMessage({
    flavor: `${flavor} - ${actor.name} (${slug})`,
    speaker,
  });
  Hooks.callAll('hbm.abyssTableRoll', actor, slug, roll.total);
  return roll;
}
