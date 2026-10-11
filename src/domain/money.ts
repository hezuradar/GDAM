import type { Currency } from './types';

const MICROS = 1_000_000;
const CURRENCY_SUFFIX: Record<Currency, string> = { EUR: '€', USD: 'US$' };
const AMOUNT_NOISE = /[\s€$]|eur|usd|us/gi;

/**
 * Normalises a number written in Spanish or English style ("1.234,50", "1,234.50",
 * "4,20", "1.000") to a JS number. Returns null when the text is not a number.
 */
export function parseDecimal(input: string): number | null {
  const text = input.replace(AMOUNT_NOISE, '');
  if (!/^\d[\d.,]*$/.test(text)) return null;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let normalised: string;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandsSep = decimalSep === '.' ? ',' : '.';
    normalised = text.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    if (text.indexOf(',') !== lastComma) return null;
    normalised = text.replace(',', '.');
  } else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalised = text.split('.').join('');
  } else {
    if (lastDot >= 0 && text.indexOf('.') !== lastDot) return null;
    normalised = text;
  }

  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** Parses a user-entered amount to integer cents (half-up). */
export function parseAmount(input: string): number | null {
  const value = parseDecimal(input.trim());
  return value === null ? null : Math.round(value * 100 + Number.EPSILON);
}

function groupThousands(integerPart: string): string {
  return integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formats cents as Spanish-style money: 1.234,50 € / 1.234,50 US$. */
export function formatMoney(cents: number, currency: Currency): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const integerPart = groupThousands(String(Math.floor(abs / 100)));
  const decimals = String(abs % 100).padStart(2, '0');
  return `${sign}${integerPart},${decimals} ${CURRENCY_SUFFIX[currency]}`;
}

/** Formats cents for an editable input field ("1234,50" style, no grouping). */
export function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  const abs = Math.abs(cents);
  const decimals = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${decimals}`;
}

/**
 * Converts cents between currencies. rateMicros is "1 EUR = X USD" * 1e6.
 */
export function convert(cents: number, from: Currency, to: Currency, rateMicros: number): number {
  if (from === to) return cents;
  if (!(rateMicros > 0)) {
    throw new Error('El tipo de cambio debe ser mayor que cero');
  }
  return from === 'EUR'
    ? Math.round((cents * rateMicros) / MICROS)
    : Math.round((cents * MICROS) / rateMicros);
}

/**
 * Amount to show when the user picks a display currency (null = keep the original).
 * Display only: stored amounts never change.
 */
export function displayAmount(
  cents: number,
  from: Currency,
  display: Currency | null,
  rateMicros: number,
): { cents: number; currency: Currency } {
  if (display === null || display === from) return { cents, currency: from };
  return { cents: convert(cents, from, display, rateMicros), currency: display };
}

/** Parses "1,08" → 1080000 micros. Null when invalid or not positive. */
export function parseRate(input: string): number | null {
  const value = parseDecimal(input.trim());
  if (value === null || value <= 0) return null;
  return Math.round(value * MICROS);
}

export function formatRate(rateMicros: number): string {
  return (rateMicros / MICROS).toFixed(6).replace(/\.?0+$/, '').replace('.', ',');
}
