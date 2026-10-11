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

export interface LinePricingInput {
  readonly salePriceCents: number | null;
  readonly saleCurrency: Currency | null;
  readonly marginBp: number | null;
}

/** Either a sale price (with its currency) or a margin over cost; both null clears the pricing. */
export function parseLinePricingInput(raw: unknown): LinePricingInput {
  const body = asObject(raw);
  const salePriceCents = nullableInteger(body, 'salePriceCents', 0, MAX_CENTS);
  const saleCurrency = body.saleCurrency === null || body.saleCurrency === undefined ? null : oneOf<Currency>(body, 'saleCurrency', CURRENCIES);
  const marginBp = nullableInteger(body, 'marginBp', -10_000, 10_000_000);
  if (salePriceCents !== null && saleCurrency === null) throw badRequest('«saleCurrency» es obligatorio con un precio de venta');
  return { salePriceCents, saleCurrency: salePriceCents === null ? null : saleCurrency, marginBp };
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
