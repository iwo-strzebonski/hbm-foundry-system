/**
 * NBP (Narodowy Bank Polski) table A mid rates for the money converter.
 * Campaign year → first published rate on/after 1 June of that year; a year in the
 * future (or no table found / request failed) → latest published rate.
 */

import { TRADE } from './rules';

export interface NbpRate {
  rate: number;
  /** Effective date (YYYY-MM-DD) of the table the rate comes from. */
  date: string;
}

const NBP_FIRST_YEAR = 2002;
const NBP_TIMEOUT_MS = 4000;

/** Offline fallbacks when NBP is unreachable. */
export const FALLBACK_RATES: Record<string, number> = { eur: TRADE.eurRate, usd: 4.0 };

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<any> }>;

async function getRates(url: string, fetchImpl: FetchLike): Promise<NbpRate | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NBP_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const first = (await res.json())?.rates?.[0];
    return typeof first?.mid === 'number' ? { rate: first.mid, date: String(first.effectiveDate ?? '') } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch the rate for `currency` (ISO code, any case) valid for the given campaign year. */
export async function fetchNbpRate(
  currency: string,
  year: number,
  now: Date = new Date(),
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<NbpRate | null> {
  const code = currency.toLowerCase();
  const base = `https://api.nbp.pl/api/exchangerates/rates/a/${code}`;
  if (year >= NBP_FIRST_YEAR && year <= now.getFullYear()) {
    // A two-week window always contains a working day; take the first table in it.
    const hit = await getRates(`${base}/${year}-06-01/${year}-06-14/?format=json`, fetchImpl);
    if (hit) return hit;
  }
  return getRates(`${base}/?format=json`, fetchImpl);
}
