/**
 * Interactive dialogs for TS roll configuration and spell mana input.
 * Uses the v12-compat foundry.appv1.api.Dialog which is always available in v13.
 */

import { TS_DEFAULT_REQUIRED, TS_DEFAULT_THRESHOLD } from '../constants';

export interface RollDialogResult {
  pool: number;
  threshold: number;
  required: number;
  flavor?: string;
}

/** Prompt to (optionally) adjust T and Y before rolling. Returns null if cancelled. */
export async function askRollParams(initial: {
  pool: number;
  threshold?: number;
  required?: number;
  flavor?: string;
}): Promise<RollDialogResult | null> {
  const t = initial.threshold ?? TS_DEFAULT_THRESHOLD;
  const y = initial.required ?? TS_DEFAULT_REQUIRED;

  return new Promise((resolve) => {
    new foundry.appv1.api.Dialog({
      title: game.i18n.localize('HBM.roll.configTitle'),
      content: `
        <form class="hbm-dialog">
          <p class="hint">${game.i18n.localize('HBM.roll.pool')}: <strong>${initial.pool}</strong></p>
          <div class="form-group">
            <label>${game.i18n.localize('HBM.roll.threshold')} (2–6)</label>
            <input type="number" name="threshold" value="${t}" min="2" max="6"/>
          </div>
          <div class="form-group">
            <label>${game.i18n.localize('HBM.roll.required')} (1–10)</label>
            <input type="number" name="required" value="${y}" min="1" max="10"/>
          </div>
        </form>`,
      buttons: {
        roll: {
          icon: '<i class="fas fa-dice-d6"></i>',
          label: game.i18n.localize('HBM.roll.roll'),
          callback: (html: any) => {
            const form = (html?.jquery ? html[0] : html as HTMLElement).querySelector('form') as HTMLFormElement;
            const fd = new foundry.applications.ux.FormDataExtended(form).object as Record<string, unknown>;
            resolve({
              pool:      initial.pool,
              threshold: Math.min(6, Math.max(2, Number(fd['threshold']) || t)),
              required:  Math.min(10, Math.max(1, Number(fd['required'])  || y)),
              flavor:    initial.flavor,
            });
          },
        },
      },
      default: 'roll',
      close: () => resolve(null),
    }).render(true);
  });
}

/** Prompt for how many mana to spend when casting a standard or witch spell. */
export async function askManaSpent(
  spell: { name: string; system: { manaCost: number } },
  actor: { system: { attributes: { mana: { value: number; maxPerSpell: number } } } },
): Promise<number | null> {
  const base        = Math.max(0, spell.system.manaCost ?? 0);
  const current     = actor.system.attributes.mana.value;
  const maxPerSpell = actor.system.attributes.mana.maxPerSpell;
  const overcastHint = base >= maxPerSpell
    ? `<em class="warn"> &mdash; ${game.i18n.localize('HBM.spellCast.overcastWarning')}</em>`
    : '';

  return new Promise((resolve) => {
    new foundry.appv1.api.Dialog({
      title: `${game.i18n.localize('HBM.spell.cast')}: ${spell.name}`,
      content: `
        <form class="hbm-dialog">
          <div class="form-group">
            <label>${game.i18n.localize('HBM.spellCast.manaSpent')}</label>
            <input type="number" name="manaSpent" value="${base}" min="${base}" max="${current}"/>
          </div>
          <p class="hint">
            ${game.i18n.localize('HBM.resources.mana')}: <strong>${current}</strong>
            &nbsp;|&nbsp;
            ${game.i18n.localize('HBM.resources.maxManaPerSpell')}: <strong>${maxPerSpell}</strong>
            ${overcastHint}
          </p>
        </form>`,
      buttons: {
        cast: {
          icon: '<i class="fas fa-hat-wizard"></i>',
          label: game.i18n.localize('HBM.spell.cast'),
          callback: (html: any) => {
            const form = (html?.jquery ? html[0] : html as HTMLElement).querySelector('form') as HTMLFormElement;
            const fd = new foundry.applications.ux.FormDataExtended(form).object as Record<string, unknown>;
            resolve(Math.max(base, Math.min(current, Number(fd['manaSpent']) || base)));
          },
        },
      },
      default: 'cast',
      close: () => resolve(null),
    }).render(true);
  });
}
