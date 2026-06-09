/**
 * HbM TS (Trudność:Sukcesy) d6 dice pool roller.
 *
 * Mechanics:
 *  - Roll N d6.
 *  - For each die:
 *      face === 1            → forced failure (even if T ≤ 1)
 *      face === 6            → forced success (even if T > 6)
 *      otherwise face >= T   → success
 *  - Roll succeeds when total successes ≥ requiredSuccesses (Y).
 *
 * Formula syntax: `ts(N, T, Y)` — e.g. `/r ts(5, 4, 2)`.
 * The N/T/Y parameters are also accepted via constructor data.
 */

import {
  TS_DEFAULT_THRESHOLD,
  TS_DEFAULT_REQUIRED,
  TS_DIE_FACES,
  TS_AUTO_FAILURE_FACE,
  TS_AUTO_SUCCESS_FACE,
} from '../constants';

export interface HbmTsRollData {
  pool: number;
  threshold: number;
  required: number;
  flavor?: string;
  /** Optional pre-roll modifier (added to pool). */
  modifier?: number;
  /** Step adjustment to T (positive = harder, negative = easier). Clamped to 2..6. */
  thresholdSteps?: number;
  /** Step adjustment to Y (rare; e.g. extra successes required). */
  requiredSteps?: number;
}

export interface HbmTsRollResult {
  faces: number[];
  successes: number;
  required: number;
  threshold: number;
  pool: number;
  isSuccess: boolean;
  criticalSuccesses: number;
  criticalFailures: number;
}

/**
 * Custom Roll subclass. Stores the parsed TS parameters and the per-die
 * results in `this.options` for the chat renderer.
 */
export class HbmTSRoll extends Roll {
  static override CHAT_TEMPLATE = 'systems/hbm-rpg-v3/templates/chat/ts-roll.hbs';

  ts: HbmTsRollResult | null = null;

  constructor(formula: string, data: Record<string, unknown> = {}, options: Record<string, unknown> = {}) {
    super(formula, data, options);
  }

  /**
   * Build a roll from N/T/Y parameters directly.
   */
  static fromParams(params: HbmTsRollData): HbmTSRoll {
    const pool = Math.max(0, Math.floor((params.pool ?? 0) + (params.modifier ?? 0)));
    const threshold = clampThreshold((params.threshold ?? TS_DEFAULT_THRESHOLD) + (params.thresholdSteps ?? 0));
    const required = Math.max(1, Math.floor((params.required ?? TS_DEFAULT_REQUIRED) + (params.requiredSteps ?? 0)));
    const formula = `${pool}d${TS_DIE_FACES}`;
    const roll = new HbmTSRoll(formula, {}, { tsParams: { pool, threshold, required, flavor: params.flavor } });
    return roll;
  }

  override async evaluate(options: Parameters<Roll['evaluate']>[0] = {}): Promise<this> {
    await super.evaluate(options);
    this.ts = computeTsResult(this);
    return this;
  }

  /** Synchronous variant for non-async callers (Foundry exposes evaluateSync). */
  override evaluateSync(options: Parameters<Roll['evaluateSync']>[0] = {}): this {
    super.evaluateSync(options);
    this.ts = computeTsResult(this);
    return this;
  }

  override async render(options: Parameters<Roll['render']>[0] = {}): Promise<string> {
    if (!this.ts) this.ts = computeTsResult(this);
    const dice = this.ts.faces.map((face) => ({
      face,
      cls: faceClass(face, this.ts!.threshold),
    }));
    const data = {
      formula: this.formula,
      total: this.ts.successes,
      ts: this.ts,
      dice,
      flavor: (this.options as Record<string, unknown>).tsParams
        ? ((this.options as Record<string, { flavor?: string }>).tsParams.flavor ?? options.flavor)
        : options.flavor,
    };
    return foundry.applications.handlebars.renderTemplate(HbmTSRoll.CHAT_TEMPLATE, data);
  }
}

function clampThreshold(t: number): number {
  return Math.max(2, Math.min(6, Math.floor(t)));
}

function faceClass(face: number, threshold: number): string {
  if (face === TS_AUTO_FAILURE_FACE) return 'die crit-failure';
  if (face === TS_AUTO_SUCCESS_FACE) return 'die crit-success';
  if (face >= threshold) return 'die success';
  return 'die failure';
}

function computeTsResult(roll: Roll): HbmTsRollResult {
  const params = (roll.options as Record<string, HbmTsRollData | undefined>).tsParams;
  const threshold = clampThreshold(params?.threshold ?? TS_DEFAULT_THRESHOLD);
  const required = Math.max(1, Math.floor(params?.required ?? TS_DEFAULT_REQUIRED));

  // Collect raw die faces from all DiceTerm results in the roll.
  const faces: number[] = [];
  for (const term of roll.terms) {
    // foundry.dice.terms.DiceTerm — has .results array with { result } entries.
    const anyTerm = term as unknown as { results?: Array<{ result: number; active?: boolean; discarded?: boolean }> };
    if (Array.isArray(anyTerm.results)) {
      for (const r of anyTerm.results) {
        if (r.discarded) continue;
        faces.push(r.result);
      }
    }
  }

  let successes = 0;
  let criticalSuccesses = 0;
  let criticalFailures = 0;
  for (const face of faces) {
    if (face === TS_AUTO_FAILURE_FACE) {
      criticalFailures += 1;
      continue;
    }
    if (face === TS_AUTO_SUCCESS_FACE) {
      criticalSuccesses += 1;
      successes += 1;
      continue;
    }
    if (face >= threshold) successes += 1;
  }

  return {
    faces,
    successes,
    required,
    threshold,
    pool: faces.length,
    isSuccess: successes >= required,
    criticalSuccesses,
    criticalFailures,
  };
}
