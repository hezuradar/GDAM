import { isFxStale, isPlausibleFxChange, parseCurrencyApi, parseOpenErApi, type FxQuote } from '../domain/fxRate';
import { getSettings, saveFxQuote } from './repo';

const REQUEST_TIMEOUT_MS = 8000;

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

export async function refreshFx(db: D1Database): Promise<FxQuote> {
  const quote = await fetchEurUsd();
  const current = await getSettings(db);
  const previousMarketRate = current.fxSource && current.fxSource !== 'manual' ? current.fxRateMicros : null;
  if (!isPlausibleFxChange(previousMarketRate, quote.rateMicros)) {
    console.warn('Rejected implausible EUR/USD quote', quote, 'previous', previousMarketRate);
    throw new Error('La fuente devolvió un cambio muy distinto al anterior; se mantiene el cambio actual.');
  }
  await saveFxQuote(db, quote, new Date().toISOString());
  return quote;
}

/** Cron + app start: refresh only in automatic mode and when the stored rate is older than an hour. */
export async function refreshFxIfStale(db: D1Database): Promise<void> {
  const settings = await getSettings(db);
  if (settings.fxAuto && isFxStale(settings.fxUpdatedAt)) await refreshFx(db);
}
