/**
 * Active-Effect-driven roll modifier collection.
 * Reads `flags.hbm.*` metadata from the actor's currently-applied effects
 * (`actor.appliedEffects` in v13) and aggregates threshold steps + blocked tags.
 */

import { SkillTag } from '../constants';

export interface RollModifiers {
  thresholdSteps: number;
  requiredSteps: number;
  /** First blocked condition encountered, for friendly error message. */
  blockedBy?: { conditionLabel: string; tag: SkillTag };
}

export function collectRollModifiers(actor: any, tags: readonly SkillTag[]): RollModifiers {
  const result: RollModifiers = { thresholdSteps: 0, requiredSteps: 0 };
  const effects = (actor?.appliedEffects ?? actor?.effects ?? []) as Iterable<any>;
  for (const ef of effects) {
    if (ef?.disabled) continue;
    const hbm = ef?.flags?.hbm;
    if (!hbm) continue;

    // Threshold step modifiers - keys may be tag names or 'all'
    const ts = hbm.thresholdSteps as Record<string, number> | undefined;
    if (ts && typeof ts === 'object') {
      if (typeof ts['all'] === 'number') result.thresholdSteps += ts['all'];
      for (const t of tags) {
        if (typeof ts[t] === 'number') result.thresholdSteps += ts[t]!;
      }
    }
    if (typeof hbm.requiredSteps === 'number') result.requiredSteps += hbm.requiredSteps;

    // Blocked tags
    const blocked = (hbm.blocksTags ?? []) as SkillTag[];
    if (Array.isArray(blocked) && !result.blockedBy) {
      for (const t of tags) {
        if (blocked.includes(t)) {
          result.blockedBy = { conditionLabel: ef?.name ?? ef?.label ?? '?', tag: t };
          break;
        }
      }
    }
  }
  return result;
}

export class RollBlockedError extends Error {
  constructor(public conditionLabel: string, public tag: SkillTag) {
    super(`Roll blocked by ${conditionLabel} (${tag})`);
  }
}
