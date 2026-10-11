import { isFxStale, isPlausibleFxChange, parseCurrencyApi, parseOpenErApi, type FxQuote } from '../domain/fxRate';
import { getSettings, markInrChecked, saveFxQuote } from './repo';

const REQUEST_TIMEOUT_MS = 8000;
/** A stored rupee rate older than this no longer limits how much the next quote may differ. */
const INR_JUMP_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Public, key-less EUR/USD sources. Tried in order; the first valid answer wins. */
const SOURCES: readonly { url: string; parse: (payload: unknown) => FxQuote | null }[] = [
  { url: 'https://open.er-api.com/v6/latest/EUR', parse: parseOpenErApi },
  { url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.min.json', parse: parseCurrencyApi },
];

export async function fetchEurUsd(): Promise<FxQuote> {
  const failures: string[] = [];
  for (const source of SOURCES) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const quote = source.parse(await response.json());
      if (quote) return quote;
      failures.push(`${new URL(source.url).host}: respuesta no válida`);
    } catch (e: unknown) {
      failures.push(`${new URL(source.url).host}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }
  throw new Error(`No se pudo obtener el cambio (${failures.join('; ')})`);
}

/**
 * Downloads the market rates. EUR/USD is stored only when `updateUsd` (it may be manual);
 * EUR/INR is always market-based and stored whenever the quote has a plausible value.
 */
export async function refreshFx(db: D1Database, updateUsd = true): Promise<FxQuote> {
  const quote = await fetchEurUsd();
  const current = await getSettings(db);
  const previousMarketRate = current.fxSource && current.fxSource !== 'manual' ? current.fxRateMicros : null;
  if (updateUsd && !isPlausibleFxChange(previousMarketRate, quote.rateMicros)) {
    console.warn('Rejected implausible EUR/USD quote', quote, 'previous', previousMarketRate);
    throw new Error('La fuente devolvió un cambio muy distinto al anterior; se mantiene el cambio actual.');
  }
  // Only a recent rupee rate limits the jump, so a legitimate move cannot block updates forever.
  const hasRecentInr = current.inrUpdatedAt !== null && !isFxStale(current.inrUpdatedAt, new Date(), INR_JUMP_WINDOW_MS);
  const previousInr = hasRecentInr ? current.inrRateMicros : null;
  const isInrPlausible = quote.inrMicros !== null && isPlausibleFxChange(previousInr, quote.inrMicros);
  if (quote.inrMicros !== null && !isInrPlausible) {
    console.warn('Rejected implausible EUR/INR quote', quote.inrMicros, 'previous', previousInr);
  }
  await saveFxQuote(
    db,
    { usd: updateUsd ? quote : null, inrMicros: isInrPlausible ? quote.inrMicros : null },
    new Date().toISOString(),
  );
  return quote;
}

/** Cron + app start: refresh rates older than an hour (EUR/USD only in automatic mode). */
export async function refreshFxIfStale(db: D1Database): Promise<void> {
  const settings = await getSettings(db);
  const isUsdDue = settings.fxAuto && isFxStale(settings.fxUpdatedAt);
  const isInrDue = isFxStale(settings.inrCheckedAt);
  if (!isUsdDue && !isInrDue) return;
  // Recorded before fetching: a failing or rate-less source is retried at most once per hour.
  if (isInrDue) await markInrChecked(db, new Date().toISOString());
  await refreshFx(db, isUsdDue);
}
