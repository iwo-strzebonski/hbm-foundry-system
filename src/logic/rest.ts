/**
 * Rest logic.
 *
 *   Short Rest (Krótki Odpoczynek):
 *     - Restore HP equal to actor.body.value (capped at max).
 *     - Restore mana to max-per-spell? - no: short rest does NOT restore mana.
 *     - Holders of `Nadzwyczajna Odporność` (alchemy passive) restore 1 elixir tolerance.
 *
 *   Long Rest (Długi Odpoczynek):
 *     - Restore HP, mana, zeal to max.
 *     - Restore 1 elixir tolerance (or all, if `Nadzwyczajna Odporność`? - book says
 *       elixir tolerance recovers per long rest by default; tracked here as -1).
 *     - Reset blood pool to max (assumption - refine when AS spell list lands).
 *     - Clear runic counter on magical armor.
 *
 * Hooks `hbm.beforeRest` and `hbm.afterRest` fire for module integration.
 */

import type { CastableActor } from './spell-cast';
import { CONDITIONS } from './conditions';

export type RestKind = 'breather' | 'short' | 'long';

declare const Hooks: any;
declare const Roll: any;

interface ActorWithItems extends CastableActor {
  items?: Iterable<{ type: string; system?: { slug?: string }; flags?: any }>;
}

function hasExtraordinaryResilience(actor: ActorWithItems): boolean {
  if (!actor.items) return false;
  for (const it of actor.items) {
    const slug = (it as any).system?.slug ?? (it as any).flags?.['hbm-rpg-v3']?.slug ?? '';
    if (slug === 'extraordinary-resilience' || slug === 'nadzwyczajna-odpornosc') return true;
  }
  return false;
}

export interface RestResult {
  kind: RestKind;
  hpRestored: number;
  manaRestored: number;
  zealRestored: number;
  bloodRestored: number;
  toleranceRecovered: number;
  effectsCleared: number;
}

export async function rest(actor: CastableActor, kind: RestKind): Promise<RestResult> {
  Hooks.callAll('hbm.beforeRest', actor, kind);
  const a = actor.system.attributes as any;
  const update: Record<string, unknown> = {};

  const hpBefore = a.health?.value ?? 0;
  const manaBefore = a.mana?.value ?? 0;
  const zealBefore = a.zeal?.value ?? 0;
  const bloodBefore = a.blood?.value ?? 0;
  const toleranceBefore = a.elixirTolerance ?? 0;

  let hpRestored = 0;
  let manaRestored = 0;
  let zealRestored = 0;
  let bloodRestored = 0;
  let toleranceRecovered = 0;

  if (kind === 'breather') {
    if (a.mana?.max != null && manaBefore < a.mana.max) {
      update['system.attributes.mana.value'] = a.mana.max;
      manaRestored = a.mana.max - manaBefore;
    }
    const endurance = actor.system.skills?.endurance?.value ?? 0;
    const roll = new Roll('1d6 + @endurance', { endurance });
    await roll.evaluate();
    const rollTotal = roll.total;
    const heal = Math.min(rollTotal, (a.health?.max ?? 0) - hpBefore);
    if (heal > 0) {
      update['system.attributes.health.value'] = hpBefore + heal;
      hpRestored = heal;
    }
  } else if (kind === 'short') {
    if (a.mana?.max != null && manaBefore < a.mana.max) {
      update['system.attributes.mana.value'] = a.mana.max;
      manaRestored = a.mana.max - manaBefore;
    }
    const healAmount = Math.ceil((a.health?.max ?? 0) / 3);
    const heal = Math.min(healAmount, (a.health?.max ?? 0) - hpBefore);
    if (heal > 0) {
      update['system.attributes.health.value'] = hpBefore + heal;
      hpRestored = heal;
    }
    if (hasExtraordinaryResilience(actor as ActorWithItems) && toleranceBefore > 0) {
      update['system.attributes.elixirTolerance'] = toleranceBefore - 1;
      toleranceRecovered = 1;
    }
  } else {
    if (a.health?.max != null && hpBefore < a.health.max) {
      update['system.attributes.health.value'] = a.health.max;
      hpRestored = a.health.max - hpBefore;
    }
    if (a.mana?.max != null && manaBefore < a.mana.max) {
      update['system.attributes.mana.value'] = a.mana.max;
      manaRestored = a.mana.max - manaBefore;
    }
    if (a.zeal?.max != null && zealBefore < a.zeal.max) {
      update['system.attributes.zeal.value'] = a.zeal.max;
      zealRestored = a.zeal.max - zealBefore;
    }
    if (a.blood?.max != null && bloodBefore < a.blood.max) {
      update['system.attributes.blood.value'] = a.blood.max;
      bloodRestored = a.blood.max - bloodBefore;
    }
    if (toleranceBefore > 0) {
      update['system.attributes.elixirTolerance'] = Math.max(0, toleranceBefore - 1);
      toleranceRecovered = 1;
    }
    if (a.magicalArmor?.runicCounter && a.magicalArmor.runicCounter > 0) {
      update['system.attributes.magicalArmor.runicCounter'] = 0;
    }
  }

  if (Object.keys(update).length > 0) await actor.update(update);

  let effectsCleared = 0;
  const actorAny = actor as unknown as { effects?: any; deleteEmbeddedDocuments?: (t: string, ids: string[]) => Promise<unknown> };
  const ids: string[] = [];

  if (kind === 'short') {
    for (const ef of actorAny.effects ?? []) {
      const isUnconscious = ef.statuses?.has('nieprzytomny') || ef.flags?.core?.statusId === 'nieprzytomny' || ef.id === 'nieprzytomny';
      if (isUnconscious) ids.push(ef.id);
    }
  } else if (kind === 'long') {
    const conditionIds = new Set(CONDITIONS.map(c => c.id));
    for (const ef of actorAny.effects ?? []) {
      const isState = conditionIds.has(ef.id) ||
        (ef.statuses && [...ef.statuses].some(s => conditionIds.has(s))) ||
        conditionIds.has(ef.flags?.core?.statusId);

      if (isState) {
        ids.push(ef.id);
        continue;
      }

      if (ef.origin) continue;
      const dur = ef.duration ?? {};
      const isTemporary = (dur.seconds ?? 0) > 0 || (dur.rounds ?? 0) > 0 || (dur.turns ?? 0) > 0 || ef.flags?.['hbm-rpg-v3']?.untilLongRest === true;
      if (isTemporary) ids.push(ef.id);
    }
  }

  if (ids.length > 0 && actorAny.deleteEmbeddedDocuments) {
    await actorAny.deleteEmbeddedDocuments('ActiveEffect', ids);
    effectsCleared = ids.length;
  }

  const result: RestResult = { kind, hpRestored, manaRestored, zealRestored, bloodRestored, toleranceRecovered, effectsCleared };
  Hooks.callAll('hbm.afterRest', actor, result);
  return result;
}
