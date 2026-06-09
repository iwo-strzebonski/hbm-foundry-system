/**
 * Reactive spell trigger registry.
 *
 * Spells with `triggers[]` register flag-based listeners on the caster:
 *   actor.flags.hbm.triggers[] = [{ event, effect, spellId, expiresAt }]
 *
 * Hooks check the matching event and prompt/resolve the trigger.
 *
 * Supported events:
 *   - killWithWeapon       (e.g. Szkarłatny Sztylet — free spell after kill)
 *   - targetCastsSpell     (e.g. Klątwa Szkarłatu — opposed save → unconscious)
 *   - damageTaken          (reactive shields)
 *   - turnStart            (per-turn drains)
 *
 * Triggers are stored as world-flag data (serialisable); the runtime hook
 * dispatches based on `event`. Effect strings are advisory text (GM-resolved)
 * unless they map to a known machine effect ID.
 */

import { SYSTEM_ID } from '../hbm';

export interface SpellTrigger {
  event: string;
  effect: string;
  spellId: string;
  spellName: string;
  /** Optional: combat round at which this trigger expires. */
  expiresAtRound?: number;
  /** Single-use after fire. */
  oneShot?: boolean;
}

interface ActorWithFlags {
  id?: string;
  name?: string;
  getFlag?: (scope: string, key: string) => unknown;
  setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
  unsetFlag?: (scope: string, key: string) => Promise<unknown>;
}

function readTriggers(actor: ActorWithFlags): SpellTrigger[] {
  const raw = actor.getFlag?.(SYSTEM_ID, 'triggers') as SpellTrigger[] | undefined;
  return Array.isArray(raw) ? raw.slice() : [];
}

async function writeTriggers(actor: ActorWithFlags, triggers: SpellTrigger[]): Promise<void> {
  if (triggers.length === 0) {
    await actor.unsetFlag?.(SYSTEM_ID, 'triggers');
  } else {
    await actor.setFlag?.(SYSTEM_ID, 'triggers', triggers);
  }
}

export async function registerSpellTriggers(
  actor: ActorWithFlags,
  spell: { id?: string; name?: string; system?: { triggers?: Array<{ event: string; effect: string }> } },
): Promise<number> {
  const list = spell.system?.triggers ?? [];
  if (!Array.isArray(list) || list.length === 0) return 0;
  const existing = readTriggers(actor);
  const now = (game as any).combat?.round ?? 0;
  for (const t of list) {
    existing.push({
      event: t.event,
      effect: t.effect,
      spellId: spell.id ?? '',
      spellName: spell.name ?? '',
      expiresAtRound: now + 1, // default: end of next round; spell may override later
      oneShot: true,
    });
  }
  await writeTriggers(actor, existing);
  return list.length;
}

export async function fireTriggers(
  actor: ActorWithFlags,
  event: string,
  payload?: Record<string, unknown>,
): Promise<SpellTrigger[]> {
  const triggers = readTriggers(actor);
  const fired: SpellTrigger[] = [];
  const remaining: SpellTrigger[] = [];
  for (const t of triggers) {
    if (t.event === event) {
      fired.push(t);
      // Post chat card so GM can resolve the effect manually if no auto-handler.
      await ChatMessage.create({
        content: `<strong>${actor.name ?? ''}</strong> — Wyzwalacz: <em>${t.spellName}</em><br/>Efekt: ${t.effect}`,
        whisper: ChatMessage.getWhisperRecipients?.('GM') ?? [],
      });
      if (!t.oneShot) remaining.push(t);
    } else {
      remaining.push(t);
    }
  }
  if (fired.length > 0) await writeTriggers(actor, remaining);
  return fired;
}

export function registerTriggerHooks(): void {
  // Combat-end / actor death events feed triggers.
  // Foundry hooks: 'updateActor' (HP delta), 'createChatMessage' (attack rolls), 'updateCombat'.
  Hooks.on('updateActor', async (actor: any, change: any) => {
    const newHp = change?.system?.attributes?.health?.value;
    if (typeof newHp === 'number' && newHp <= 0) {
      // Find any actor in combat with a killWithWeapon trigger awaiting fire
      const combat = (game as any).combat;
      if (!combat?.started) return;
      for (const c of combat.combatants ?? []) {
        const a = c.actor as ActorWithFlags;
        if (!a) continue;
        const triggers = readTriggers(a);
        if (triggers.some((t) => t.event === 'killWithWeapon')) {
          await fireTriggers(a, 'killWithWeapon', { victim: actor.id });
        }
      }
    }
  });
}
