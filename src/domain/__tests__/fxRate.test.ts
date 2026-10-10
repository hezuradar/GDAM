import { isFxStale, isPlausibleFxChange, parseCurrencyApi, parseOpenErApi } from '../fxRate';

describe('isPlausibleFxChange', () => {
  it('accepts normal market moves', () => {
    expect(isPlausibleFxChange(1_120_000, 1_131_000)).toBe(true);
  });
  it('rejects jumps above 10 %', () => {
    expect(isPlausibleFxChange(1_120_000, 1_300_000)).toBe(false);
    expect(isPlausibleFxChange(1_120_000, 900_000)).toBe(false);
  });
  it('accepts anything when there is no previous market rate', () => {
    expect(isPlausibleFxChange(null, 1_300_000)).toBe(true);
  });
});

describe('parseOpenErApi', () => {
  it('reads the EUR→USD rate and the update date', () => {
    const quote = parseOpenErApi({
      result: 'success',
      base_code: 'EUR',
      time_last_update_unix: 1791590551,
      rates: { USD: 1.120597, EUR: 1 },
    });
    expect(quote).toEqual({
      rateMicros: 1_120_597,
      asOf: new Date(1791590551 * 1000).toISOString(),
      source: 'open.er-api.com',
    });
  });

  it.each([
    [{ result: 'error' }],
    [{ result: 'success', base_code: 'USD', rates: { USD: 1 } }],
    [{ result: 'success', base_code: 'EUR', rates: { USD: 0 } }],
    [{ result: 'success', base_code: 'EUR', rates: { USD: 'x' } }],
    [null],
    ['texto'],
  ])('rejects invalid payload %p', (payload) => {
    expect(parseOpenErApi(payload)).toBeNull();
  });

  it('rejects absurd rates (protects totals from bad data)', () => {
    expect(parseOpenErApi({ result: 'success', base_code: 'EUR', rates: { USD: 50 } })).toBeNull();
  });
});

describe('parseCurrencyApi', () => {
  it('reads eur.usd and the date', () => {
    expect(parseCurrencyApi({ date: '2026-10-10', eur: { usd: 1.1201766 } })).toEqual({
      rateMicros: 1_120_177,
      asOf: '2026-10-10',
      source: 'currency-api',
    });
  });

  it('rejects missing data', () => {
    expect(parseCurrencyApi({ date: '2026-10-10', eur: {} })).toBeNull();
    expect(parseCurrencyApi(undefined)).toBeNull();
  });
});

describe('isFxStale', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  it('is stale when never updated', () => {
    expect(isFxStale(null, now)).toBe(true);
  });

  it('is fresh within the max age', () => {
    expect(isFxStale('2026-10-10T11:30:00Z', now)).toBe(false);
  });

  it('is stale after the max age', () => {
    expect(isFxStale('2026-10-10T10:59:00Z', now)).toBe(true);
  });

  it('treats an invalid timestamp as stale', () => {
    expect(isFxStale('ayer', now)).toBe(true);
  });
});
