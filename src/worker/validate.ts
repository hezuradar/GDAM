import { isValidIsoDate } from '../domain/dates';
import {
  CURRENCIES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  type Currency,
  type Order,
  type OrderLine,
  type OrderStatus,
  type Payment,
  type PaymentMethod,
  type Supplier,
} from '../domain/types';
import { badRequest } from './http';

/** Server-side validation of every API input. Never trust the client. */

export type SupplierInput = Omit<Supplier, 'id'>;
export type OrderInput = Omit<Order, 'id'>;
export type LineInput = Pick<OrderLine, 'quantity' | 'pieceType' | 'measurements' | 'unitPriceCents' | 'rawText'>;
export type PaymentInput = Omit<Payment, 'id' | 'orderId'>;
export interface SettingsInput {
  readonly defaultCurrency: Currency;
  readonly fxAuto: boolean;
  readonly manualFxRateMicros: number | null;
}
export interface ImportInput {
  readonly lines: readonly LineInput[];
  readonly replaceExisting: boolean;
}

const MAX_CENTS = 100_000_000_000; // 1.000 millones
const MAX_QUANTITY = 10_000_000;
const MAX_IMPORT_LINES = 1000;
const MIN_RATE_MICROS = 100_000; // 0,1
const MAX_RATE_MICROS = 10_000_000; // 10

type Body = Record<string, unknown>;

function asObject(value: unknown): Body {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw badRequest('Se esperaba un objeto');
  return value as Body;
}

function text(body: Body, key: string, max: number, required = false): string {
  const value = body[key] ?? '';
  if (typeof value !== 'string') throw badRequest(`«${key}» debe ser texto`);
  const trimmed = value.trim();
  if (required && trimmed.length === 0) throw badRequest(`«${key}» es obligatorio`);
  if (trimmed.length > max) throw badRequest(`«${key}» es demasiado largo (máx. ${max})`);
  return trimmed;
}

function integer(body: Body, key: string, min: number, max: number): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`«${key}» debe ser un entero entre ${min} y ${max}`);
  }
  return value;
}

function nullableInteger(body: Body, key: string, min: number, max: number): number | null {
  return body[key] === null || body[key] === undefined ? null : integer(body, key, min, max);
}

function oneOf<T extends string>(body: Body, key: string, options: readonly T[]): T {
  const value = body[key];
  const match = options.find((option) => option === value);
  if (!match) throw badRequest(`«${key}» no es válido`);
  return match;
}

function isoDate(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || !isValidIsoDate(value)) throw badRequest(`«${key}» debe ser una fecha AAAA-MM-DD`);
  return value;
}

export function parseId(raw: string | undefined): number {
  if (!raw || !/^\d{1,9}$/.test(raw) || Number(raw) <= 0) throw badRequest('Identificador no válido');
  return Number(raw);
}

export function parseSupplierInput(raw: unknown): SupplierInput {
  const body = asObject(raw);
  return { name: text(body, 'name', 80, true), whatsapp: text(body, 'whatsapp', 40), notes: text(body, 'notes', 1000) };
}

export function parseOrderInput(raw: unknown): OrderInput {
  const body = asObject(raw);
  return {
    supplierId: integer(body, 'supplierId', 1, 999_999_999),
    orderDate: isoDate(body, 'orderDate'),
    status: oneOf<OrderStatus>(body, 'status', ORDER_STATUSES),
    currency: oneOf<Currency>(body, 'currency', CURRENCIES),
    shippingCents: integer(body, 'shippingCents', 0, MAX_CENTS),
    shippingCurrency: oneOf<Currency>(body, 'shippingCurrency', CURRENCIES),
    customsCents: integer(body, 'customsCents', 0, MAX_CENTS),
    customsCurrency: oneOf<Currency>(body, 'customsCurrency', CURRENCIES),
    fxRateMicros: nullableInteger(body, 'fxRateMicros', MIN_RATE_MICROS, MAX_RATE_MICROS),
    carrier: text(body, 'carrier', 80),
    trackingNumber: text(body, 'trackingNumber', 80),
    notes: text(body, 'notes', 2000),
  };
}

export function parseStatus(raw: unknown): OrderStatus {
  return oneOf<OrderStatus>(asObject(raw), 'status', ORDER_STATUSES);
}

export function parseLineInput(raw: unknown): LineInput {
  const body = asObject(raw);
  const quantity = body.quantity;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    throw badRequest('«quantity» debe ser un número mayor que 0');
  }
  return {
    quantity,
    pieceType: text(body, 'pieceType', 200, true),
    measurements: text(body, 'measurements', 200),
    unitPriceCents: nullableInteger(body, 'unitPriceCents', 0, MAX_CENTS),
    rawText: text(body, 'rawText', 500),
  };
}

export function parseImportInput(raw: unknown): ImportInput {
  const body = asObject(raw);
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > MAX_IMPORT_LINES) {
    throw badRequest(`«lines» debe tener entre 1 y ${MAX_IMPORT_LINES} líneas`);
  }
  if (typeof body.replaceExisting !== 'boolean') throw badRequest('«replaceExisting» debe ser verdadero o falso');
  return { lines: body.lines.map(parseLineInput), replaceExisting: body.replaceExisting };
}

export interface LinePricesInput {
  readonly prices: readonly { readonly lineId: number; readonly unitPriceCents: number }[];
}

/** Unit prices for several lines of one order (total split among its lines). */
export function parseLinePricesInput(raw: unknown): LinePricesInput {
  const body = asObject(raw);
  if (!Array.isArray(body.prices) || body.prices.length === 0 || body.prices.length > MAX_IMPORT_LINES) {
    throw badRequest(`«prices» debe tener entre 1 y ${MAX_IMPORT_LINES} líneas`);
  }
  const prices = body.prices.map((item: unknown) => {
    const price = asObject(item);
    return { lineId: integer(price, 'lineId', 1, 999_999_999), unitPriceCents: integer(price, 'unitPriceCents', 0, MAX_CENTS) };
  });
  if (new Set(prices.map((p) => p.lineId)).size !== prices.length) throw badRequest('Hay líneas repetidas');
  return { prices };
}

export interface ReceptionInput {
  readonly lines: readonly { readonly lineId: number; readonly receivedQuantity: number | null }[];
  /** Also set the order status to "recibido". */
  readonly markReceived: boolean;
}

/** Pieces received per line (null = not checked), and whether to mark the order as received. */
export function parseReceptionInput(raw: unknown): ReceptionInput {
  const body = asObject(raw);
  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > MAX_IMPORT_LINES) {
    throw badRequest(`«lines» debe tener entre 1 y ${MAX_IMPORT_LINES} líneas`);
  }
  if (typeof body.markReceived !== 'boolean') throw badRequest('«markReceived» debe ser verdadero o falso');
  const lines = body.lines.map((item: unknown) => {
    const line = asObject(item);
    const received = line.receivedQuantity;
    if (received !== null && (typeof received !== 'number' || !Number.isFinite(received) || received < 0 || received > MAX_QUANTITY)) {
      throw badRequest(`«receivedQuantity» debe ser un número entre 0 y ${MAX_QUANTITY}`);
    }
    return { lineId: integer(line, 'lineId', 1, 999_999_999), receivedQuantity: received as number | null };
  });
  if (new Set(lines.map((l) => l.lineId)).size !== lines.length) throw badRequest('Hay líneas repetidas');
  return { lines, markReceived: body.markReceived };
}

export interface LinePricingInput {
  readonly salePriceCents: number | null;
  readonly saleCurrency: Currency | null;
  readonly marginBp: number | null;
  readonly theoreticalCostCents: number | null;
  readonly theoreticalCurrency: Currency | null;
  readonly handlingCostCents: number | null;
  readonly handlingCurrency: Currency | null;
}

/** An optional amount with its currency: the currency is required with an amount and dropped without one. */
function optionalAmount(body: Body, amountKey: string, currencyKey: string, what: string) {
  const cents = nullableInteger(body, amountKey, 0, MAX_CENTS);
  const currency = body[currencyKey] === null || body[currencyKey] === undefined ? null : oneOf<Currency>(body, currencyKey, CURRENCIES);
  if (cents !== null && currency === null) throw badRequest(`«${currencyKey}» es obligatorio con ${what}`);
  return { cents, currency: cents === null ? null : currency };
}

/** Either a sale price (with its currency) or a margin over cost; both null clears the pricing. */
export function parseLinePricingInput(raw: unknown): LinePricingInput {
  const body = asObject(raw);
  const sale = optionalAmount(body, 'salePriceCents', 'saleCurrency', 'un precio de venta');
  const marginBp = nullableInteger(body, 'marginBp', -10_000, 10_000_000);
  const theoretical = optionalAmount(body, 'theoreticalCostCents', 'theoreticalCurrency', 'un valor teórico');
  const handling = optionalAmount(body, 'handlingCostCents', 'handlingCurrency', 'unos gastos de manipulación');
  return {
    salePriceCents: sale.cents,
    saleCurrency: sale.currency,
    marginBp,
    theoreticalCostCents: theoretical.cents,
    theoreticalCurrency: theoretical.currency,
    handlingCostCents: handling.cents,
    handlingCurrency: handling.currency,
  };
}

export function parsePaymentInput(raw: unknown): PaymentInput {
  const body = asObject(raw);
  return {
    amountCents: integer(body, 'amountCents', 1, MAX_CENTS),
    currency: oneOf<Currency>(body, 'currency', CURRENCIES),
    paidOn: isoDate(body, 'paidOn'),
    method: oneOf<PaymentMethod>(body, 'method', PAYMENT_METHODS),
    fxRateMicros: nullableInteger(body, 'fxRateMicros', MIN_RATE_MICROS, MAX_RATE_MICROS),
    note: text(body, 'note', 500),
  };
}

export function parseSettingsInput(raw: unknown): SettingsInput {
  const body = asObject(raw);
  if (typeof body.fxAuto !== 'boolean') throw badRequest('«fxAuto» debe ser verdadero o falso');
  return {
    defaultCurrency: oneOf<Currency>(body, 'defaultCurrency', CURRENCIES),
    fxAuto: body.fxAuto,
    manualFxRateMicros: nullableInteger(body, 'manualFxRateMicros', MIN_RATE_MICROS, MAX_RATE_MICROS),
  };
}
