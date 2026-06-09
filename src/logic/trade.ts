/**
 * Trade logic — founding companies, transactions, smuggling.
 * Source: Złoto Stal i Magia, Rozdział IX.
 *
 * The book's exact difficulty formulas depend on commodity, route, and party
 * skill, so this module exposes the *primitives*; the cast dialog/UI passes
 * the threshold and required-successes derived from the table.
 *
 * State: a "company" is just a JournalEntry created in a configurable folder;
 * here we only expose the rolling helpers.
 */

import { HbmTSRoll } from '../dice/ts-roll';
import { TS_DEFAULT_REQUIRED, TS_DEFAULT_THRESHOLD } from '../constants';
import type { CastableActor } from './spell-cast';

export interface TradeTestParams {
  /** TS threshold, default 5. */
  threshold?: number;
  /** Required successes, default 2. */
  required?: number;
  /** Skill key contributing to the pool (e.g. `tradeAndPersuasion`). */
  skill?: string;
  /** Attribute key whose `value` adds to the pool (default `mind`). */
  attribute?: 'body' | 'mind' | 'soul' | 'magic';
  /** Free-form description for the chat card. */
  flavor?: string;
}

function rollTrade(actor: CastableActor, label: string, params: TradeTestParams): Promise<HbmTSRoll> {
  const attribute = params.attribute ?? 'mind';
  const attrVal = (actor.system.attributes as any)[attribute]?.value ?? 0;
  const skillVal = params.skill ? (actor.system.skills?.[params.skill]?.value ?? 0) : 0;
  const pool = attrVal + skillVal;
  const flavor = params.flavor ?? `${label}: ${actor.name}`;
  const roll = HbmTSRoll.fromParams({
    pool,
    threshold: params.threshold ?? TS_DEFAULT_THRESHOLD,
    required: params.required ?? TS_DEFAULT_REQUIRED,
    flavor,
  });
  return roll.evaluate().then(async () => {
    await roll.toMessage({ flavor });
    return roll;
  });
}

/** Founding a trading company — usually a single TS test plus capital. */
export function foundCompany(actor: CastableActor, params: TradeTestParams = {}): Promise<HbmTSRoll> {
  return rollTrade(actor, 'Założenie Firmy Handlowej', params);
}

/** Standard legal transaction. */
export function transaction(actor: CastableActor, params: TradeTestParams = {}): Promise<HbmTSRoll> {
  return rollTrade(actor, 'Transakcja', params);
}

/** Smuggling — illegal transaction; failure should fire `hbm.smugglingFailed`. */
export async function smuggling(actor: CastableActor, params: TradeTestParams = {}): Promise<HbmTSRoll> {
  const roll = await rollTrade(actor, 'Przemyt', params);
  if (!roll.ts?.isSuccess) {
    Hooks.callAll('hbm.smugglingFailed', actor, roll);
  }
  return roll;
}
