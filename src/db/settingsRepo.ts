import type { SQLiteDatabase } from 'expo-sqlite';
import { CURRENCIES, type Currency } from '@/domain/types';

export interface AppSettings {
  /** "1 EUR = X USD" * 1e6 */
  readonly fxRateMicros: number;
  readonly defaultCurrency: Currency;
}

export const DEFAULT_SETTINGS: AppSettings = { fxRateMicros: 1_080_000, defaultCurrency: 'USD' };

const KEY_FX = 'fx_eur_usd_micros';
const KEY_CURRENCY = 'default_currency';

function parseFx(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SETTINGS.fxRateMicros;
}

function parseCurrency(value: string | undefined): Currency {
  return CURRENCIES.find((c) => c === value) ?? DEFAULT_SETTINGS.defaultCurrency;
}

export async function getSettings(db: SQLiteDatabase): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return { fxRateMicros: parseFx(map.get(KEY_FX)), defaultCurrency: parseCurrency(map.get(KEY_CURRENCY)) };
}

export async function saveSettings(db: SQLiteDatabase, settings: AppSettings): Promise<void> {
  await db.withTransactionAsync(async () => {
    const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
    await db.runAsync(upsert, [KEY_FX, String(settings.fxRateMicros)]);
    await db.runAsync(upsert, [KEY_CURRENCY, settings.defaultCurrency]);
  });
}
