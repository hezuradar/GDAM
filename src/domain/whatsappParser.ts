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
/** Spanish and English unit words: "10 pcs", "50 uds", "12 piezas", "30 units", "5 sets"… */
const UNIT_WORDS = 'pcs?|pieces?|pzas?|pzs?|piezas?|uds?|unidades?|unid|units?|ea|sets?|juegos?|nos';
/** "Qty: 20", "Quantity 20", "Cantidad: 8" (only when a number follows). */
const QUANTITY_PREFIX = /^(?:qty|quantity|cantidad|cant)\.?\s*:?\s*(?=\d)/i;
const QUANTITY = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:(?:x|${UNIT_WORDS})\\.?\\s+|\\s+)(.+)$`, 'i');
/** Quantity written after the description: "Hex bolt M8 - 100 pcs", "Tornillo M8 x 50 uds". */
const TRAILING_QUANTITY = new RegExp(`\\s*(?:[-–,:x×]\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT_WORDS})\\.?$`, 'i');
const PRICE_SUFFIX =
  /\s+(@|a|at|precio(?:\s+unitario)?|unit\s+price|price|pvp|p\/u)?\s*(€|us\$|\$|usd|eur)?\s*(\d[\d.,]*)\s*(€|\$|usd|eur|euros?|d[oó]lares?|dollars?)?\s*(?:each|ea|c\/u|cada\s+un[oa]|(?:per|por)\s+(?:pc|piece|unit|ud|unidad|pieza)|\/\s*(?:uds?|u|pzas?|pcs?|pc|piece|unit|unidad))?\s*$/i;
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
  const text = cleanLine(line).replace(QUANTITY_PREFIX, '');
  if (text.length === 0) return null;

  const issues: string[] = [];
  const quantityMatch = QUANTITY.exec(text);
  let quantity = 1;
  let hasQuantity = false;
  let body = text;

  if (quantityMatch) {
    quantity = parseDecimal(quantityMatch[1]) ?? 0;
    body = quantityMatch[2];
    hasQuantity = true;
  }

  const price = extractPrice(body);
  let rest = price.rest;
  if (!hasQuantity) {
    const trailing = TRAILING_QUANTITY.exec(rest);
    if (trailing && trailing.index > 0) {
      quantity = parseDecimal(trailing[1]) ?? 0;
      rest = rest.slice(0, trailing.index).trim();
      hasQuantity = true;
    }
  }
  if (!hasQuantity) issues.push(ISSUE_NO_QUANTITY);
  else if (!(quantity > 0)) issues.push(ISSUE_BAD_QUANTITY);

  const { pieceType, measurements } = splitPieceAndMeasurements(rest);

  if (pieceType.length === 0) issues.push(ISSUE_NO_PIECE_TYPE);
  if (price.unitPriceCents === null && BARE_INTEGER_TOKEN.test(rest) && measurements.includes(' ')) {
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

export interface ShippingQuote {
  readonly cents: number;
  /** null when the message gives no currency (the order currency is assumed). */
  readonly currency: Currency | null;
  readonly rawText: string;
}

export interface ParsedMessage {
  readonly lines: ParsedLine[];
  readonly shipping: ShippingQuote | null;
  /** Lines recognised but not imported: totals, extra or amount-less shipping lines. */
  readonly ignored: string[];
}

/** Shipping lines in Spanish or English: "Envío: 25 €", "Gastos de envío…", "Shipping cost $40", "Freight 35$". */
const SHIPPING_LINE =
  /^(?:gastos\s+de\s+)?(?:env[ií]o|transporte|portes?|flete|mensajer[ií]a|shipping|freight|delivery|courier|postage)\b/i;
const TOTAL_LINE = /^(?:sub\s*-?\s*total|total|importe\s+total|grand\s+total)\b/i;
const AMOUNT = /(€|us\$|\$|usd|eur)?\s*(\d[\d.,]*)\s*(€|\$|usd|eur|euros?|d[oó]lares?|dollars?)?/i;

function parseShipping(text: string, rawText: string): ShippingQuote | null {
  const match = AMOUNT.exec(text);
  const cents = match ? parseAmount(match[2]) : null;
  if (!match || cents === null) return null;
  return { cents, currency: currencyFromToken(match[1]) ?? currencyFromToken(match[3]), rawText };
}

/**
 * Parses a pasted WhatsApp message (Spanish or English): product lines, the shipping cost
 * if the supplier included it, and totals (ignored, they are recalculated).
 */
export function parseWhatsAppMessage(text: string): ParsedMessage {
  const lines: ParsedLine[] = [];
  const ignored: string[] = [];
  let shipping: ShippingQuote | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const cleaned = cleanLine(raw);
    if (cleaned.length === 0) continue;
    if (SHIPPING_LINE.test(cleaned)) {
      const quote: ShippingQuote | null = shipping === null ? parseShipping(cleaned, raw.trim()) : null;
      if (quote) shipping = quote;
      else ignored.push(raw.trim());
      continue;
    }
    if (TOTAL_LINE.test(cleaned)) {
      ignored.push(raw.trim());
      continue;
    }
    const line = parseWhatsAppLine(raw);
    if (line) lines.push(line);
  }
  return { lines, shipping, ignored };
}

/** Parses a pasted WhatsApp message into order lines (shipping and totals left out). */
export function parseWhatsAppText(text: string): ParsedLine[] {
  return parseWhatsAppMessage(text).lines;
}
