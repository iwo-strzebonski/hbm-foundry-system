/**
 * Warzenie Eliksirów — Brewing logic (Podręcznik Gry, Alchemia / Aneks C).
 *
 * Each character has `attributes.elixirTolerance` (default 0). Soft cap = body+1.
 * Drinking a potion increments the counter; exceeding the cap triggers a
 * poisoning hook (`hbm.elixirOverdose`). Long rest restores 1 tolerance
 * (handled by rest.ts); the `Nadzwyczajna Odporność` discipline-passive lets
 * a Short Rest restore 1 instead.
 *
 * Brewing a potion: TS test `Magic + Brewing skill` against the recipe's
 * difficulty. Caller passes the recipe (`{ name, difficulty, ingredients[] }`).
 */

import { HbmTSRoll } from '../dice/ts-roll';
import { TS_DEFAULT_REQUIRED, TS_DEFAULT_THRESHOLD } from '../constants';
import type { CastableActor } from './spell-cast';

export interface ElixirRecipe {
  name: string;
  /** TS test target — { threshold, successes }. */
  difficulty: { threshold: number; successes: number };
  /** Ingredient names (free-form). */
  ingredients: string[];
  /** Discipline skill key used for the brew test (default: alchemyBrewing). */
  skill?: string;
}

export function elixirToleranceCap(actor: CastableActor): number {
  const body = actor.system.attributes.body?.value ?? 1;
  return body + 1;
}

/** Drink a potion: increment tolerance, fire `hbm.elixirOverdose` on overflow. */
export async function consumeElixir(actor: CastableActor, recipe: Pick<ElixirRecipe, 'name'>): Promise<{ tolerance: number; overdose: boolean }> {
  const cur = ((actor.system.attributes as any).elixirTolerance ?? 0) as number;
  const next = cur + 1;
  await actor.update({ 'system.attributes.elixirTolerance': next });
  const overdose = next > elixirToleranceCap(actor);
  if (overdose) Hooks.callAll('hbm.elixirOverdose', actor, recipe.name, next);
  return { tolerance: next, overdose };
}

/** Brewing TS test: pool = magic + skill (default `alchemyBrewing`). */
export async function brewElixir(actor: CastableActor, recipe: ElixirRecipe): Promise<{ roll: HbmTSRoll; success: boolean }> {
  const skillKey = recipe.skill ?? 'alchemyBrewing';
  const skillValue = actor.system.skills?.[skillKey]?.value ?? 0;
  const pool = actor.system.attributes.magic.actual + skillValue;
  const roll = HbmTSRoll.fromParams({
    pool,
    threshold: recipe.difficulty.threshold ?? TS_DEFAULT_THRESHOLD,
    required: recipe.difficulty.successes ?? TS_DEFAULT_REQUIRED,
    flavor: `Warzenie: ${recipe.name}`,
  });
  await roll.evaluate();
  await roll.toMessage({
    flavor: `Warzenie ${recipe.name} (Składniki: ${recipe.ingredients.join(', ') || '—'})`,
  });
  return { roll, success: !!roll.ts?.isSuccess };
}
