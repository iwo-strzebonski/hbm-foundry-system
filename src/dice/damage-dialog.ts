/**
 * Apply-damage dialog: collects amount, type, and bypass flags. Returns
 * an `ApplyDamageOptions` object suitable for passing into `applyDamage`,
 * or `null` if cancelled.
 */

import { ApplyDamageOptions } from '../logic/damage';
import { DamageType } from '../constants';

interface ActorLike { name: string; system: any }

export async function askApplyDamage(actor: ActorLike, presetAmount = 0): Promise<ApplyDamageOptions | null> {
  const ma = actor.system?.attributes?.magicalArmor?.value ?? 0;
  const ms = actor.system?.attributes?.magicalShield?.value ?? 0;
  const pa = actor.system?.attributes?.physicalArmor?.value ?? 0;

  return new Promise((resolve) => {
    new foundry.appv1.api.Dialog({
      title: `${game.i18n.localize('HBM.damage.title')} - ${actor.name}`,
      content: `
        <form class="hbm-dialog">
          <div class="form-group">
            <label>${game.i18n.localize('HBM.damage.amount')}</label>
            <input type="number" name="amount" value="${presetAmount}" min="0"/>
          </div>
          <div class="form-group">
            <label>${game.i18n.localize('HBM.damage.type')}</label>
            <select name="type">
              <option value="physical">${game.i18n.localize('HBM.gear.physical')}</option>
              <option value="magical">${game.i18n.localize('HBM.gear.magical')}</option>
              <option value="environmental">${game.i18n.localize('HBM.gear.environmental')}</option>
            </select>
          </div>
          <p class="hint">
            ${game.i18n.localize('HBM.resources.magicalArmor')}: <strong>${ma}</strong> ·
            ${game.i18n.localize('HBM.resources.magicalShield')}: <strong>${ms}</strong> ·
            ${game.i18n.localize('HBM.resources.physicalArmor')}: <strong>${pa}</strong>
          </p>
          <div class="form-group">
            <label><input type="checkbox" name="ignoreMagicalArmor"/> ${game.i18n.localize('HBM.damage.ignoreMagicalArmor')}</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="ignoreMagicalShield"/> ${game.i18n.localize('HBM.damage.ignoreMagicalShield')}</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="ignorePhysicalArmor"/> ${game.i18n.localize('HBM.damage.ignorePhysicalArmor')}</label>
          </div>
          <div class="form-group">
            <label><input type="checkbox" name="damageArmor"/> ${game.i18n.localize('HBM.damage.damageArmor')}</label>
          </div>
        </form>`,
      buttons: {
        apply: {
          icon: '<i class="fas fa-burst"></i>',
          label: game.i18n.localize('HBM.damage.apply'),
          callback: (html: any) => {
            const form = (html?.jquery ? html[0] : html as HTMLElement).querySelector('form') as HTMLFormElement;
            const fd = new foundry.applications.ux.FormDataExtended(form).object as Record<string, unknown>;
            resolve({
              amount: Math.max(0, Number(fd['amount']) || 0),
              type: (fd['type'] as DamageType) ?? 'physical',
              ignoreMagicalArmor: Boolean(fd['ignoreMagicalArmor']),
              ignoreMagicalShield: Boolean(fd['ignoreMagicalShield']),
              ignorePhysicalArmor: Boolean(fd['ignorePhysicalArmor']),
              damageArmor: Boolean(fd['damageArmor']),
            });
          },
        },
      },
      default: 'apply',
      close: () => resolve(null),
    }).render(true);
  });
}
