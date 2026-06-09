/**
 * Combat hooks — handle per-round Mana reset, per-turn Zeal regen,
 * and condition-driven turn behavior (skip / damage tick / death save).
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

export function registerCombatHooks(): void {
  Hooks.on('combatRound', async (combat: Combat, _updateData: unknown, _options: { advanceTime?: number; direction?: number }) => {
    for (const combatant of combat.combatants) {
      const actor = combatant.actor;
      if (!actor || actor.type !== 'character') continue;
      const sys = actor.system as { attributes: { mana: { max: number; value: number } } };
      await actor.update({ 'system.attributes.mana.value': sys.attributes.mana.max });
    }
    ChatMessage.create({
      content: `<em>${game.i18n.localize('HBM.combat.newRound')}</em>`,
      whisper: ChatMessage.getWhisperRecipients('GM'),
    });
  });

  Hooks.on('combatTurn', async (combat: Combat) => {
    const combatant = combat.combatant;
    const actor = combatant?.actor;
    if (!actor) return;

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

    // Dying: prompt death save (simplified — posts a chat reminder)
    if (hasStatus(actor, 'umierajacy')) {
      ChatMessage.create({
        content: `<strong>${actor.name}</strong>: ${game.i18n.localize('HBM.combat.deathSavePrompt')}`,
      });
    }

    // Per-turn Zeal regen (characters) — base 1 + talent bonus from flag.
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
