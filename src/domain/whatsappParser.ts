import { convert, parseAmount, parseDecimal } from './money';
import type { Currency } from './types';

export interface ParsedLine {
  readonly rawText: string;
  readonly quantity: number;
  readonly pieceType: string;
  readonly measurements: string;
  readonly unitPriceCents: number | null;
  readonly priceCurrency: Currency | null;
  readonly issues: readonly string[];
}

export const ISSUE_NO_QUANTITY = 'Sin cantidad';
export const ISSUE_BAD_QUANTITY = 'Cantidad no válida';
export const ISSUE_NO_PIECE_TYPE = 'Sin tipo de pieza';
export const ISSUE_MAYBE_PRICE = '¿El último número es un precio?';

/** "[10/10/26, 17:43] Nombre: " prefix added when copying WhatsApp messages. */
const WHATSAPP_PREFIX = /^\[[^\]]{4,30}\]\s*[^:]{1,60}:\s*/;
const LEADING_NOISE = /^[^\p{L}\p{N}]+/u;
const QUANTITY =
  /^(\d+(?:[.,]\d+)?)\s*(?:(?:x|pcs?|pzas?|pzs?|piezas?|uds?|unidades?|unid)\.?\s+|\s+)(.+)$/i;
const PRICE_SUFFIX =
  /\s+(@|a|precio|pvp|p\/u)?\s*(€|\$|us\$|usd|eur)?\s*(\d[\d.,]*)\s*(€|\$|usd|eur|euros?|d[oó]lares?)?\s*(?:\/\s*(?:uds?|u|pzas?|pcs?|unidad))?\s*$/i;
const BARE_INTEGER_TOKEN = /\s(\d+)$/;

function currencyFromToken(token: string | undefined): Currency | null {
  if (!token) return null;
  const t = token.toLowerCase();
  if (t === '€' || t.startsWith('eur')) return 'EUR';
  if (t.includes('$') || t === 'usd' || t.startsWith('d')) return 'USD';
  return null;
}

function cleanLine(line: string): string {
  return line
    .replace(/[  -​ ]/g, ' ')
    .replace(/×/g, 'x')
    .trim()
    .replace(WHATSAPP_PREFIX, '')
    .replace(LEADING_NOISE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PriceSplit {
  readonly rest: string;
  readonly unitPriceCents: number | null;
  readonly priceCurrency: Currency | null;
}

function extractPrice(text: string): PriceSplit {
  const match = PRICE_SUFFIX.exec(text);
  if (!match) return { rest: text, unitPriceCents: null, priceCurrency: null };

  const [whole, marker, preCurrency, amount, postCurrency] = match;
  const currency = currencyFromToken(preCurrency) ?? currencyFromToken(postCurrency);
  const hasDecimals = /[.,]\d{1,2}$/.test(amount);
  const isExplicitPrice = Boolean(marker) || currency !== null || hasDecimals;
  const rest = text.slice(0, text.length - whole.length).trim();

  if (!isExplicitPrice || rest.length === 0) {
    return { rest: text, unitPriceCents: null, priceCurrency: null };
  }
  return { rest, unitPriceCents: parseAmount(amount), priceCurrency: currency };
}

function splitPieceAndMeasurements(text: string): { pieceType: string; measurements: string } {
  const tokens = text.split(' ').filter(Boolean);
  const firstWithDigit = tokens.findIndex((token) => /\d/.test(token));
  if (firstWithDigit === -1) return { pieceType: tokens.join(' '), measurements: '' };
  return {
    pieceType: tokens.slice(0, firstWithDigit).join(' '),
    measurements: tokens.slice(firstWithDigit).join(' '),
  };
}

export function parseWhatsAppLine(line: string): ParsedLine | null {
  const rawText = line.trim();
  const text = cleanLine(line);
  if (text.length === 0) return null;

  const issues: string[] = [];
  const quantityMatch = QUANTITY.exec(text);
  let quantity = 1;
  let body = text;

  if (quantityMatch) {
    quantity = parseDecimal(quantityMatch[1]) ?? 0;
    body = quantityMatch[2];
    if (!(quantity > 0)) issues.push(ISSUE_BAD_QUANTITY);
  } else {
    issues.push(ISSUE_NO_QUANTITY);
  }

  const price = extractPrice(body);
  const { pieceType, measurements } = splitPieceAndMeasurements(price.rest);

  if (pieceType.length === 0) issues.push(ISSUE_NO_PIECE_TYPE);
  if (price.unitPriceCents === null && BARE_INTEGER_TOKEN.test(price.rest) && measurements.includes(' ')) {
    issues.push(ISSUE_MAYBE_PRICE);
  }

  return {
    rawText,
    quantity,
    pieceType,
    measurements,
    unitPriceCents: price.unitPriceCents,
    priceCurrency: price.priceCurrency,
    issues,
  };
}

export interface ImportableLine {
  readonly quantity: number;
  readonly pieceType: string;
  readonly measurements: string;
  readonly unitPriceCents: number | null;
  readonly rawText: string;
}

export function canImport(line: ParsedLine): boolean {
  return line.quantity > 0;
}

/** Converts a parsed line to an order line, converting the price into the order currency. */
export function toImportableLine(line: ParsedLine, orderCurrency: Currency, rateMicros: number): ImportableLine {
  const priceCurrency = line.priceCurrency ?? orderCurrency;
  const unitPriceCents =
    line.unitPriceCents === null ? null : convert(line.unitPriceCents, priceCurrency, orderCurrency, rateMicros);
  return {
    quantity: line.quantity,
    pieceType: line.pieceType || line.rawText,
    measurements: line.measurements,
    unitPriceCents,
    rawText: line.rawText,
  };
}

/** Parses a pasted WhatsApp message into order lines. Blank lines are skipped. */
export function parseWhatsAppText(text: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map(parseWhatsAppLine)
    .filter((line): line is ParsedLine => line !== null);
}
