/**
 * Combat hooks - handle per-turn Zeal regen and condition-driven turn
 * behavior (skip / damage tick / death save).
 *
 * Mana is a daily pool (see `constants.ts` MAGIC_POWER_TABLE), not a
 * per-round budget, so it is intentionally NOT reset on `combatRound`.
 */

import { applyDamage } from './damage';

function hasStatus(actor: any, id: string): boolean {
  const effects = actor?.effects ?? [];
  for (const ef of effects) {
    if (ef?.disabled) continue;
    const statuses = ef?.statuses;
    if (statuses && typeof statuses.has === 'function' ? statuses.has(id) : Array.isArray(statuses) && statuses.includes(id)) {
      return true;
    }
  }
  return false;
}

/** Statuses lasting "until the end of this character's next turn" (see conditions.ts `expires`). */
export const END_OF_NEXT_TURN_STATUSES = ['oszolomiony', 'przerazony'] as const;

const FLAG_SCOPE = 'hbm-rpg-v3';

function expiringEffects(actor: any): any[] {
  const out: any[] = [];
  for (const ef of actor?.effects ?? []) {
    const ids: string[] = ef?.statuses ? [...ef.statuses] : [];
    if (ids.some((s) => (END_OF_NEXT_TURN_STATUSES as readonly string[]).includes(s))) out.push(ef);
  }
  return out;
}

/** Start of the actor's turn: arm effects so they end with this turn. */
async function armExpiring(actor: any): Promise<void> {
  for (const ef of expiringEffects(actor)) {
    if (!ef.getFlag?.(FLAG_SCOPE, 'turnStarted')) await ef.setFlag?.(FLAG_SCOPE, 'turnStarted', true);
  }
}

/** End of the actor's turn: drop armed effects. */
async function expireArmed(actor: any): Promise<void> {
  const ids = expiringEffects(actor).filter((ef) => ef.getFlag?.(FLAG_SCOPE, 'turnStarted')).map((ef) => ef.id);
  if (ids.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids);
}

export function registerCombatHooks(): void {
  Hooks.on('combatRound', async (combat: Combat, _updateData: unknown, _options: { advanceTime?: number; direction?: number }) => {
    // One free Akcja Natychmiastowa per round – reset the per-round counter.
    for (const c of (combat as any)?.combatants ?? []) {
      const actor = c.actor;
      if (actor?.system?.attributes?.immediateActionsUsed) {
        await actor.update({ 'system.attributes.immediateActionsUsed': 0 });
      }
    }
    ChatMessage.create({
      content: `<em>${game.i18n.localize('HBM.combat.newRound')}</em>`,
      whisper: ChatMessage.getWhisperRecipients('GM'),
    });
  });

  Hooks.on('combatTurn', async (combat: Combat) => {
    // The previous combatant's turn just ended: expire their timed Stany.
    const prevId = (combat as any).previous?.combatantId;
    const prevActor = prevId ? (combat as any).combatants?.get?.(prevId)?.actor : null;
    if (prevActor) await expireArmed(prevActor);

    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if (!actor) return;
    await armExpiring(actor);

    // Skip turn for unconscious / restrained-to-incapacitation
    if (hasStatus(actor, 'nieprzytomny') || hasStatus(actor, 'obezwladniony')) {
      ChatMessage.create({
        content: `<em>${actor.name}: ${game.i18n.localize('HBM.combat.turnSkipped')}</em>`,
      });
      try { await (combat as any).nextTurn?.(); } catch { /* ignore */ }
      return;
    }

    // Burning: tick environmental damage
    if (hasStatus(actor, 'podpalony')) {
      await applyDamage(actor, { amount: 1, type: 'environmental', ignoreMagicalArmor: true, ignoreMagicalShield: true, ignorePhysicalArmor: true });
    }

    // Dying: prompt death save (simplified - posts a chat reminder)
    if (hasStatus(actor, 'umierajacy')) {
      ChatMessage.create({
        content: `<strong>${actor.name}</strong>: ${game.i18n.localize('HBM.combat.deathSavePrompt')}`,
      });
    }

    // Per-turn Zeal regen (characters) - base 1 + talent bonus from flag.
    if (actor.type === 'character') {
      const sys = actor.system as { attributes: { zeal: { value: number; max: number } } };
      const regen = getZealRegen(actor);
      const next = Math.min(sys.attributes.zeal.max, sys.attributes.zeal.value + regen);
      if (next !== sys.attributes.zeal.value) {
        await actor.update({ 'system.attributes.zeal.value': next });
      }
    }
  });
}

/**
 * Zeal regenerated at the start of an actor's turn.
 * Defaults to 1; talents may add bonus via `flags['hbm-rpg-v3'].zealRegenBonus`
 * (typically set by an ActiveEffect with mode ADD targeting that flag path).
 */
export function getZealRegen(actor: any): number {
  const base = 1;
  const bonus = Number(actor?.getFlag?.('hbm-rpg-v3', 'zealRegenBonus') ?? 0) || 0;
  return Math.max(0, base + bonus);
}
