/** A market EUR→USD quote: "1 EUR = X USD" stored as X * 1e6. */
export interface FxQuote {
  readonly rateMicros: number;
  /** When the provider last updated the rate (ISO date or date-time). */
  readonly asOf: string;
  readonly source: string;
}

const MICROS = 1_000_000;
/** Sanity bounds for EUR/USD: anything outside is treated as bad data, not a real quote. */
const MIN_PLAUSIBLE = 0.5;
const MAX_PLAUSIBLE = 2.5;
/** Market rates are refreshed at most once per hour. */
export const FX_MAX_AGE_MS = 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toRateMicros(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < MIN_PLAUSIBLE || value > MAX_PLAUSIBLE) return null;
  return Math.round(value * MICROS);
}

/** https://open.er-api.com/v6/latest/EUR */
export function parseOpenErApi(payload: unknown): FxQuote | null {
  if (!isRecord(payload) || payload.result !== 'success' || payload.base_code !== 'EUR') return null;
  const rates = payload.rates;
  if (!isRecord(rates)) return null;
  const rateMicros = toRateMicros(rates.USD);
  if (rateMicros === null) return null;
  const unix = payload.time_last_update_unix;
  const asOf = typeof unix === 'number' ? new Date(unix * 1000).toISOString() : new Date().toISOString();
  return { rateMicros, asOf, source: 'open.er-api.com' };
}

/** https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json */
export function parseCurrencyApi(payload: unknown): FxQuote | null {
  if (!isRecord(payload) || !isRecord(payload.eur)) return null;
  const rateMicros = toRateMicros(payload.eur.usd);
  if (rateMicros === null) return null;
  const asOf = typeof payload.date === 'string' ? payload.date : new Date().toISOString();
  return { rateMicros, asOf, source: 'currency-api' };
}

/** Largest accepted jump versus the stored market rate; bigger jumps are treated as bad data. */
export const FX_MAX_CHANGE_RATIO = 0.1;

/**
 * Protects totals from a faulty provider: a new market quote may differ at most 10 % from the
 * previous market quote. A manual or missing previous rate imposes no limit.
 */
export function isPlausibleFxChange(previousMicros: number | null, nextMicros: number): boolean {
  if (previousMicros === null || previousMicros <= 0) return true;
  return Math.abs(nextMicros - previousMicros) / previousMicros <= FX_MAX_CHANGE_RATIO;
}

export function isFxStale(updatedAt: string | null, now: Date = new Date(), maxAgeMs: number = FX_MAX_AGE_MS): boolean {
  if (!updatedAt) return true;
  const time = Date.parse(updatedAt);
  return Number.isNaN(time) || now.getTime() - time > maxAgeMs;
}
