/**
 * Damage application engine — flows through 4 layers:
 * 1. Magical Armor (DR + every 5 dmg absorbed degrades value by 1 via runicCounter)
 * 2. Magical Shield (raw temp HP; cannot be healed; vanishes at 0)
 * 3. Physical Armor (flat DR; optionally degrade `condition` by 1)
 * 4. Health (the leftover hits HP)
 *
 * Bypass flags allow effects to skip individual layers.
 *
 * After resolving, if HP loss meets the Oszołomiony threshold ⌈(C+U+D)/3⌉
 * the effect is auto-applied to character actors.
 */

import { DamageType } from '../constants';

export interface ApplyDamageOptions {
  amount: number;
  type?: DamageType;
  ignoreMagicalArmor?: boolean;
  ignoreMagicalShield?: boolean;
  ignorePhysicalArmor?: boolean;
  damageArmor?: boolean;
  postChat?: boolean;
}

export interface DamageReport {
  amount: number;
  absorbed: { magicalArmor: number; magicalShield: number; physicalArmor: number };
  hpDamage: number;
  shieldDropped: boolean;
  oszolomionyApplied: boolean;
}

interface ActorLike {
  name: string;
  type: string;
  system: any;
  update: (changes: Record<string, unknown>) => Promise<unknown>;
  toggleStatusEffect?: (id: string, options?: any) => Promise<any> | any;
  effects?: { find: (fn: (e: any) => boolean) => any };
}

export async function applyDamage(actor: ActorLike, opts: ApplyDamageOptions): Promise<DamageReport> {
  const total = Math.max(0, Math.floor(opts.amount));
  const a = actor.system.attributes;
  const updates: Record<string, unknown> = {};
  const report: DamageReport = {
    amount: total,
    absorbed: { magicalArmor: 0, magicalShield: 0, physicalArmor: 0 },
    hpDamage: 0,
    shieldDropped: false,
    oszolomionyApplied: false,
  };

  let remaining = total;

  // Layer 1: Magical Armor — DR-based; runicCounter accumulates incoming damage.
  if (!opts.ignoreMagicalArmor && a.magicalArmor) {
    const dr = Math.max(0, Number(a.magicalArmor.value) || 0);
    const absorbed = Math.min(dr, remaining);
    if (absorbed > 0) {
      const incomingDmg = remaining;
      report.absorbed.magicalArmor = absorbed;
      remaining -= absorbed;
      const newCounter = (Number(a.magicalArmor.runicCounter) || 0) + incomingDmg;
      const decrements = Math.floor(newCounter / 5);
      const newValue = Math.max(0, dr - decrements);
      updates['system.attributes.magicalArmor.runicCounter'] = newCounter % 5;
      updates['system.attributes.magicalArmor.value'] = newValue;
    }
  }

  // Layer 2: Magical Shield — pure temp HP (raw subtraction).
  if (remaining > 0 && !opts.ignoreMagicalShield && a.magicalShield) {
    const shield = Math.max(0, Number(a.magicalShield.value) || 0);
    const taken = Math.min(shield, remaining);
    if (taken > 0) {
      report.absorbed.magicalShield = taken;
      remaining -= taken;
      const newShield = shield - taken;
      updates['system.attributes.magicalShield.value'] = newShield;
      if (newShield === 0) report.shieldDropped = true;
    }
  }

  // Layer 3: Physical Armor — flat DR; optionally degrade condition.
  if (remaining > 0 && !opts.ignorePhysicalArmor && a.physicalArmor) {
    const dr = Math.max(0, Number(a.physicalArmor.value) || 0);
    const absorbed = Math.min(dr, remaining);
    if (absorbed > 0) {
      report.absorbed.physicalArmor = absorbed;
      remaining -= absorbed;
    }
    if (opts.damageArmor && actor.type === 'character' && a.physicalArmor.condition != null) {
      // Decrement durability of the first equipped armor piece (character only)
      const items = (actor as any).items as Iterable<any> | undefined;
      if (items) {
        for (const it of items) {
          if (it.type === 'gear' && it.system?.equipped && it.system?.category === 'armor') {
            const cond = Math.max(0, Number(it.system.armor?.condition ?? 0) - 1);
            await it.update({ 'system.armor.condition': cond });
            break;
          }
        }
      }
    }
  }

  // Layer 4: Health
  if (remaining > 0 && a.health) {
    const hp = Math.max(0, Number(a.health.value) || 0);
    const newHp = Math.max(0, hp - remaining);
    report.hpDamage = hp - newHp;
    updates['system.attributes.health.value'] = newHp;
  }

  if (Object.keys(updates).length > 0) await actor.update(updates);

  if (opts.postChat ?? true) {
    const lines: string[] = [
      `<strong>${actor.name}</strong> — ${game.i18n.localize('HBM.damage.report.title')}: <strong>${total}</strong>`,
    ];
    if (report.absorbed.magicalArmor) lines.push(`${game.i18n.localize('HBM.resources.magicalArmor')}: −${report.absorbed.magicalArmor}`);
    if (report.absorbed.magicalShield) lines.push(`${game.i18n.localize('HBM.resources.magicalShield')}: −${report.absorbed.magicalShield}${report.shieldDropped ? ' ✦' : ''}`);
    if (report.absorbed.physicalArmor) lines.push(`${game.i18n.localize('HBM.resources.physicalArmor')}: −${report.absorbed.physicalArmor}`);
    if (report.hpDamage) lines.push(`${game.i18n.localize('HBM.resources.health')}: −${report.hpDamage}`);
    await ChatMessage.create({ content: `<div class="hbm-damage-report">${lines.join('<br/>')}</div>` });
  }

  return report;
}
