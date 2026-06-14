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
 *   - addInsanity(actor, n)         - increments actor.system.attributes.insanity;
 *                                     when crossing a threshold, fires a hook for
 *                                     the GM to apply a mental condition.
 */

import type { CastableActor } from './spell-cast';

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

/** Insanity thresholds (Klątwa Otchłani VIII). Crossing any triggers a mental-condition roll. */
const INSANITY_THRESHOLDS = [3, 6, 10, 15] as const;

export async function addInsanity(actor: CastableActor, n: number): Promise<{ before: number; after: number; thresholdsCrossed: number[] }> {
  if (n <= 0) return { before: 0, after: 0, thresholdsCrossed: [] };
  const before = ((actor.system.attributes as any).insanity ?? 0) as number;
  const after = before + n;
  await actor.update({ 'system.attributes.insanity': after });
  const crossed = INSANITY_THRESHOLDS.filter((t) => before < t && after >= t);
  if (crossed.length > 0) {
    Hooks.callAll('hbm.insanityThreshold', actor, crossed, { before, after });
  }
  return { before, after, thresholdsCrossed: [...crossed] };
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
