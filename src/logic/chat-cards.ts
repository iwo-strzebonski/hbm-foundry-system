/**
 * Click handlers for the rich spell-cast chat card.
 *
 * Wires:
 *   - `data-action="hbm-apply-status"` → toggle/add a CONFIG.statusEffects entry
 *     on every selected/targeted token of the current user.
 *   - `data-action="hbm-apply-damage"` → run the system damage pipeline against
 *     the actor identified by `data-target-uuid`.
 */

import { applyDamage } from './damage';
import { CONDITIONS } from './conditions';

declare const Hooks: any;
declare const fromUuid: <T = unknown>(uuid: string) => Promise<T | null>;
declare const game: any;
declare const canvas: any;
declare const ui: any;

export function registerChatCardHooks(): void {
  Hooks.on('renderChatMessageHTML', (_msg: unknown, html: HTMLElement | JQuery) => {
    const root = (html as any)?.jquery ? (html as any)[0] : (html as HTMLElement);
    if (!root) return;
    root.querySelectorAll<HTMLElement>('button.hbm-action[data-action="hbm-apply-status"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        void onApplyStatus(btn);
      });
    });
    root.querySelectorAll<HTMLElement>('button.hbm-action[data-action="hbm-apply-damage"]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        void onApplyDamage(btn);
      });
    });
  });
}

async function onApplyStatus(btn: HTMLElement): Promise<void> {
  const id = btn.dataset.effectId;
  if (!id) return;
  const def = CONDITIONS.find((c) => c.id === id);
  if (!def) {
    ui.notifications?.warn(`Unknown condition: ${id}`);
    return;
  }

  const tokens = collectTargetTokens();
  if (tokens.length === 0) {
    ui.notifications?.warn(game.i18n?.localize?.('HBM.spellCast.noTargets') ?? 'No targets selected.');
    return;
  }

  for (const token of tokens) {
    const actor = token.actor;
    if (!actor) continue;
    if (typeof actor.toggleStatusEffect === 'function') {
      await actor.toggleStatusEffect(id, { active: true });
    }
  }
  ui.notifications?.info(`${game.i18n?.localize?.(def.i18nKey) ?? id} → ${tokens.length}`);
}

async function onApplyDamage(btn: HTMLElement): Promise<void> {
  const uuid = btn.dataset.targetUuid;
  const amount = Number(btn.dataset.amount ?? 0);
  if (!uuid || !Number.isFinite(amount) || amount <= 0) return;
  const target = await fromUuid<any>(uuid);
  if (!target) {
    ui.notifications?.warn(`Target not found: ${uuid}`);
    return;
  }
  const ignoresArmor = btn.dataset.ignoresArmor === 'true';
  await applyDamage(target, {
    amount,
    type: (btn.dataset.type as any) ?? 'magical',
    ignoreMagicalArmor: ignoresArmor,
    ignoreMagicalShield: ignoresArmor,
    ignorePhysicalArmor: ignoresArmor,
  } as any);
}

function collectTargetTokens(): any[] {
  const tokens: any[] = [];
  const targets = game.user?.targets;
  if (targets && typeof targets[Symbol.iterator] === 'function') {
    for (const t of targets) tokens.push(t);
  }
  if (tokens.length === 0 && canvas?.tokens?.controlled?.length) {
    tokens.push(...canvas.tokens.controlled);
  }
  return tokens;
}
