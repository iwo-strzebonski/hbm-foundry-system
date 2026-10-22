/**
 * Damage application engine - flows through 4 layers:
 * 1. Runiczny Pancerz (DR; one hit > 5 disables 1 point until end of fight / restore)
 * 2. Magical Shield (raw temp HP; cannot be healed; vanishes at 0)
 * 3. Physical Armor (flat DR; optionally degrade `condition` by 1)
 * 4. Health (the leftover hits HP)
 *
 * Bypass flags allow effects to skip individual layers.
 *
 * After resolving, if HP loss (after reductions) is at least half of max
 * Żywotność (= C+U+D) the Oszołomiony status is applied (lasts until the end
 * of that character's next turn). Żywotność lost also yields a Koncentracja
 * test 4:⌈⅓ lost⌉ (min 1).
 */

import { DamageType } from '../constants';
import { triggersStun, concentrationTest, runicArmorPointsDisabled } from './rules';
import { gainKrewFromWeaponDamage } from './blood-magic';

export interface ApplyDamageOptions {
  amount: number;
  type?: DamageType;
  ignoreMagicalArmor?: boolean;
  ignoreMagicalShield?: boolean;
  ignorePhysicalArmor?: boolean;
  damageArmor?: boolean;
  /** Magiczny Pocisk: at least 1 damage gets through Pancerz to Żywotność. */
  minDamageAfterArmor?: boolean;
  /** Shield-breaker: every N (2 instead of 5) damage disable a Runiczny Pancerz point. */
  runicArmorStep?: number;
  /** Shield-breaker: damage counts ×N against Magiczna Osłona. */
  shieldMultiplier?: number;
  /** Prawdziwa Dezintegracja: disables all Runiczny Pancerz points and destroys Magiczna Osłona. */
  destroyMagicalDefenses?: boolean;
  /** Rozerwanie Run: permanently destroys N Runiczny Pancerz points (lowers its maximum). */
  destroyRunicPoints?: number;
  /** Wound kind of a weapon hit (gear data has none yet – callers pass it); drives passive Krew. */
  woundKind?: 'cutting' | 'piercing' | 'blunt';
  /** Attacker, for passive Krew gain (Szacunek do Życia / Krwisty Pojedynkowicz). */
  sourceActor?: any;
  postChat?: boolean;
}

export interface DamageReport {
  amount: number;
  absorbed: { magicalArmor: number; magicalShield: number; physicalArmor: number };
  hpDamage: number;
  shieldDropped: boolean;
  oszolomionyApplied: boolean;
  /** Runiczny Pancerz points disabled by this hit (restored at end of fight). */
  runicArmorDisabled?: number;
  /** Runiczny Pancerz points destroyed permanently by this hit. */
  runicArmorDestroyed?: number;
  /** Krew gained by the victim / attacker through weapon-damage talents. */
  krewGained?: { victim: number; source: number };
  /** Dusza (Determinacja) 4:S for a concentrating target; absent when no Żywotność was lost. */
  concentrationTest?: { threshold: number; successes: number };
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

  // Layer 1: Runiczny Pancerz - flat DR. ONE hit disables points (never accumulated across hits):
  // > 5 damage after the step → 1 point; shield-breakers: every 2 damage → 1 point. Disabled
  // points come back at the end of the fight / when restored (see logic/runic-armor.ts).
  if (a.magicalArmor && opts.destroyRunicPoints) {
    // Rozerwanie Run: permanent – lowers the maximum, cannot be restored.
    const value = Math.max(0, Number(a.magicalArmor.value) || 0);
    const max = Math.max(0, Number(a.magicalArmor.max) || 0);
    const lost = Math.min(max, opts.destroyRunicPoints);
    updates['system.attributes.magicalArmor.max'] = max - lost;
    updates['system.attributes.magicalArmor.value'] = Math.min(value, max - lost);
    report.runicArmorDestroyed = lost;
  }
  if (!opts.ignoreMagicalArmor && a.magicalArmor) {
    const dr = Math.max(0, Number(a.magicalArmor.value) || 0);
    const absorbed = Math.min(dr, remaining);
    if (absorbed > 0) {
      const incoming = remaining;
      report.absorbed.magicalArmor = absorbed;
      remaining -= absorbed;
      const disabled = opts.destroyMagicalDefenses
        ? dr
        : runicArmorPointsDisabled(opts.runicArmorStep ? incoming : remaining, opts.runicArmorStep);
      const current = (updates['system.attributes.magicalArmor.value'] as number | undefined) ?? dr;
      const newValue = Math.max(0, Math.min(current, dr) - disabled);
      if (disabled > 0) report.runicArmorDisabled = Math.min(dr, disabled);
      updates['system.attributes.magicalArmor.value'] = newValue;
    }
  }

  // Layer 2: Magiczna Osłona - pure temp HP; shield-breakers count damage ×N against it.
  if (remaining > 0 && !opts.ignoreMagicalShield && a.magicalShield) {
    const shield = Math.max(0, Number(a.magicalShield.value) || 0);
    const mult = Math.max(1, opts.shieldMultiplier ?? 1);
    const effective = Math.min(shield, remaining * mult);
    if (effective > 0) {
      const consumed = Math.ceil(effective / mult);
      report.absorbed.magicalShield = consumed;
      remaining -= consumed;
      const newShield = opts.destroyMagicalDefenses ? 0 : shield - effective;
      updates['system.attributes.magicalShield.value'] = newShield;
      if (newShield === 0) report.shieldDropped = true;
    }
  }

  // Layer 3: Physical Armor - flat DR; optionally degrade condition.
  if (remaining > 0 && !opts.ignorePhysicalArmor && a.physicalArmor) {
    const dr = Math.max(0, Number(a.physicalArmor.value) || 0);
    const absorbed = Math.min(dr, remaining);
    if (absorbed > 0) {
      report.absorbed.physicalArmor = absorbed;
      remaining -= absorbed;
      if (opts.minDamageAfterArmor && remaining === 0 && absorbed > 0) {
        remaining = 1;
        report.absorbed.physicalArmor = absorbed - 1;
      }
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

  // Passive Krew from cutting / piercing weapons (talents): victim and attacker side.
  if (report.hpDamage > 0 && (opts.woundKind === 'cutting' || opts.woundKind === 'piercing')) {
    report.krewGained = {
      victim: await gainKrewFromWeaponDamage(actor as any, report.hpDamage),
      source: opts.sourceActor ? await gainKrewFromWeaponDamage(opts.sourceActor, report.hpDamage) : 0,
    };
  }

  // Oszołomiony: a single hit that costs ≥ half max Żywotność after all reductions.
  if (triggersStun(report.hpDamage, Number(a.health?.max) || 0) && actor.toggleStatusEffect) {
    const already = actor.effects?.find((e: any) => e.statuses?.has?.('oszolomiony'));
    if (!already) await actor.toggleStatusEffect('oszolomiony', { active: true });
    report.oszolomionyApplied = true;
  }
  const concentration = concentrationTest(report.hpDamage);
  if (concentration) report.concentrationTest = concentration;

  if (opts.postChat ?? true) {
    const lines: string[] = [
      `<strong>${actor.name}</strong> - ${game.i18n.localize('HBM.damage.report.title')}: <strong>${total}</strong>`,
    ];
    if (report.absorbed.magicalArmor) lines.push(`${game.i18n.localize('HBM.resources.magicalArmor')}: −${report.absorbed.magicalArmor}`);
    if (report.absorbed.magicalShield) lines.push(`${game.i18n.localize('HBM.resources.magicalShield')}: −${report.absorbed.magicalShield}${report.shieldDropped ? ' ✦' : ''}`);
    if (report.absorbed.physicalArmor) lines.push(`${game.i18n.localize('HBM.resources.physicalArmor')}: −${report.absorbed.physicalArmor}`);
    if (report.hpDamage) lines.push(`${game.i18n.localize('HBM.resources.health')}: −${report.hpDamage}`);
    await ChatMessage.create({ content: `<div class="hbm-damage-report">${lines.join('<br/>')}</div>` });
  }

  return report;
}
