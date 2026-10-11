import type { FxQuote } from '../domain/fxRate';
import { plural } from '../domain/exportText';
import { convert } from '../domain/money';
import { CURRENCIES, type Currency, type Order, type OrderLine, type OrderStatus, type Payment, type Supplier } from '../domain/types';
import { HttpError, notFound } from './http';
import type { ImportInput, LineInput, LinePricingInput, OrderInput, PaymentInput, SettingsInput, SupplierInput } from './validate';

/** Data access on Cloudflare D1. Every query is parameterised; multi-statement writes use batch() (atomic). */

// ---------- Row mappers (snake_case → domain) ----------

interface SupplierRow { id: number; name: string; whatsapp: string; notes: string }
interface OrderRow {
  id: number; supplier_id: number; order_date: string; status: OrderStatus; currency: Currency;
  shipping_cents: number; shipping_currency: Currency; customs_cents: number; customs_currency: Currency;
  fx_rate_micros: number | null; carrier: string; tracking_number: string; notes: string;
}
interface LineRow {
  id: number; order_id: number; position: number; quantity: number; piece_type: string;
  measurements: string; unit_price_cents: number | null; raw_text: string;
}
interface PaymentRow {
  id: number; order_id: number; amount_cents: number; currency: Currency; paid_on: string;
  method: Payment['method']; fx_rate_micros: number | null; note: string;
}

const toSupplier = (r: SupplierRow): Supplier => ({ id: r.id, name: r.name, whatsapp: r.whatsapp, notes: r.notes });
const toOrder = (r: OrderRow): Order => ({
  id: r.id, supplierId: r.supplier_id, orderDate: r.order_date, status: r.status, currency: r.currency,
  shippingCents: r.shipping_cents, shippingCurrency: r.shipping_currency, customsCents: r.customs_cents,
  customsCurrency: r.customs_currency, fxRateMicros: r.fx_rate_micros, carrier: r.carrier,
  trackingNumber: r.tracking_number, notes: r.notes,
});
const toLine = (r: LineRow): OrderLine => ({
  id: r.id, orderId: r.order_id, position: r.position, quantity: r.quantity, pieceType: r.piece_type,
  measurements: r.measurements, unitPriceCents: r.unit_price_cents, rawText: r.raw_text,
});
const toPayment = (r: PaymentRow): Payment => ({
  id: r.id, orderId: r.order_id, amountCents: r.amount_cents, currency: r.currency, paidOn: r.paid_on,
  method: r.method, fxRateMicros: r.fx_rate_micros, note: r.note,
});

const SUPPLIER_COLUMNS = 'id, name, whatsapp, notes';
const ORDER_COLUMNS = `id, supplier_id, order_date, status, currency, shipping_cents, shipping_currency,
  customs_cents, customs_currency, fx_rate_micros, carrier, tracking_number, notes`;
const LINE_COLUMNS = 'id, order_id, position, quantity, piece_type, measurements, unit_price_cents, raw_text';
const PAYMENT_COLUMNS = 'id, order_id, amount_cents, currency, paid_on, method, fx_rate_micros, note';

async function all<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...params).all<T>()).results;
}

async function first<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...params).first<T>();
}

async function requireChanged(result: D1Result, what: string): Promise<void> {
  if (result.meta.changes === 0) throw notFound(what);
}

// ---------- Suppliers ----------

export async function listSuppliers(db: D1Database): Promise<Supplier[]> {
  return (await all<SupplierRow>(db, `SELECT ${SUPPLIER_COLUMNS} FROM suppliers ORDER BY name COLLATE NOCASE`)).map(toSupplier);
}

export async function getSupplier(db: D1Database, id: number): Promise<Supplier | null> {
  const row = await first<SupplierRow>(db, `SELECT ${SUPPLIER_COLUMNS} FROM suppliers WHERE id = ?`, id);
  return row ? toSupplier(row) : null;
}

export async function createSupplier(db: D1Database, input: SupplierInput): Promise<number> {
  const result = await db
    .prepare('INSERT INTO suppliers (name, whatsapp, notes) VALUES (?, ?, ?)')
    .bind(input.name, input.whatsapp, input.notes)
    .run();
  return result.meta.last_row_id;
}

export async function updateSupplier(db: D1Database, id: number, input: SupplierInput): Promise<void> {
  const result = await db
    .prepare('UPDATE suppliers SET name = ?, whatsapp = ?, notes = ? WHERE id = ?')
    .bind(input.name, input.whatsapp, input.notes, id)
    .run();
  await requireChanged(result, 'Proveedor');
}

export async function countSupplierOrders(db: D1Database, id: number): Promise<number> {
  return (await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM orders WHERE supplier_id = ?', id))?.n ?? 0;
}

export async function deleteSupplier(db: D1Database, id: number): Promise<void> {
  const count = await countSupplierOrders(db, id);
  if (count > 0) throw new HttpError(409, `Este proveedor tiene ${plural(count, 'pedido', 'pedidos')}. Elimínalos primero.`);
  await requireChanged(await db.prepare('DELETE FROM suppliers WHERE id = ?').bind(id).run(), 'Proveedor');
}

// ---------- Orders ----------

export async function listOrders(db: D1Database): Promise<Order[]> {
  return (await all<OrderRow>(db, `SELECT ${ORDER_COLUMNS} FROM orders`)).map(toOrder);
}

export async function getOrder(db: D1Database, id: number): Promise<Order | null> {
  const row = await first<OrderRow>(db, `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`, id);
  return row ? toOrder(row) : null;
}

function orderParams(input: OrderInput): unknown[] {
  return [
    input.supplierId, input.orderDate, input.status, input.currency, input.shippingCents, input.shippingCurrency,
    input.customsCents, input.customsCurrency, input.fxRateMicros, input.carrier, input.trackingNumber, input.notes,
  ];
}

async function requireSupplier(db: D1Database, supplierId: number): Promise<void> {
  if (!(await getSupplier(db, supplierId))) throw new HttpError(400, 'El proveedor no existe');
}

export async function createOrder(db: D1Database, input: OrderInput): Promise<number> {
  await requireSupplier(db, input.supplierId);
  const result = await db
    .prepare(
      `INSERT INTO orders (supplier_id, order_date, status, currency, shipping_cents, shipping_currency,
        customs_cents, customs_currency, fx_rate_micros, carrier, tracking_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(...orderParams(input))
    .run();
  return result.meta.last_row_id;
}

/**
 * Line prices are stored in the order currency, so changing the currency converts them
 * (at the order rate, or the current setting) atomically with the order update.
 */
export async function updateOrder(db: D1Database, id: number, input: OrderInput): Promise<void> {
  const previous = await getOrder(db, id);
  if (!previous) throw notFound('Pedido');
  await requireSupplier(db, input.supplierId);

  const statements: D1PreparedStatement[] = [];
  if (previous.currency !== input.currency) {
    const rate = input.fxRateMicros ?? (await getSettings(db)).fxRateMicros;
    const lines = await all<{ id: number; unit_price_cents: number }>(
      db,
      'SELECT id, unit_price_cents FROM order_lines WHERE order_id = ? AND unit_price_cents IS NOT NULL',
      id,
    );
    for (const line of lines) {
      const converted = convert(line.unit_price_cents, previous.currency, input.currency, rate);
      statements.push(db.prepare('UPDATE order_lines SET unit_price_cents = ? WHERE id = ?').bind(converted, line.id));
    }
  }
  statements.push(
    db
      .prepare(
        `UPDATE orders SET supplier_id = ?, order_date = ?, status = ?, currency = ?, shipping_cents = ?,
          shipping_currency = ?, customs_cents = ?, customs_currency = ?, fx_rate_micros = ?, carrier = ?,
          tracking_number = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(...orderParams(input), id),
  );
  await db.batch(statements);
}

export async function updateOrderStatus(db: D1Database, id: number, status: OrderStatus): Promise<void> {
  const result = await db
    .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(status, id)
    .run();
  await requireChanged(result, 'Pedido');
}

/** Lines and payments are removed by ON DELETE CASCADE. */
export async function deleteOrder(db: D1Database, id: number): Promise<void> {
  await requireChanged(await db.prepare('DELETE FROM orders WHERE id = ?').bind(id).run(), 'Pedido');
}

// ---------- Lines ----------

export async function listLines(db: D1Database, orderId: number): Promise<OrderLine[]> {
  return (await all<LineRow>(db, `SELECT ${LINE_COLUMNS} FROM order_lines WHERE order_id = ? ORDER BY position, id`, orderId)).map(toLine);
}

export async function listAllLinesForList(db: D1Database) {
  const rows = await all<Pick<LineRow, 'order_id' | 'quantity' | 'unit_price_cents' | 'piece_type' | 'measurements'>>(
    db,
    'SELECT order_id, quantity, unit_price_cents, piece_type, measurements FROM order_lines',
  );
  return rows.map((r) => ({
    orderId: r.order_id,
    quantity: r.quantity,
    unitPriceCents: r.unit_price_cents,
    pieceType: r.piece_type,
    measurements: r.measurements,
  }));
}

export async function getLine(db: D1Database, id: number): Promise<OrderLine | null> {
  const row = await first<LineRow>(db, `SELECT ${LINE_COLUMNS} FROM order_lines WHERE id = ?`, id);
  return row ? toLine(row) : null;
}

async function requireOrder(db: D1Database, orderId: number): Promise<void> {
  if (!(await getOrder(db, orderId))) throw notFound('Pedido');
}

async function nextPosition(db: D1Database, orderId: number): Promise<number> {
  return ((await first<{ p: number | null }>(db, 'SELECT MAX(position) AS p FROM order_lines WHERE order_id = ?', orderId))?.p ?? 0) + 1;
}

function insertLineStatement(db: D1Database, orderId: number, position: number, line: LineInput): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO order_lines (order_id, position, quantity, piece_type, measurements, unit_price_cents, raw_text)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(orderId, position, line.quantity, line.pieceType, line.measurements, line.unitPriceCents, line.rawText);
}

export async function createLine(db: D1Database, orderId: number, input: LineInput): Promise<number> {
  await requireOrder(db, orderId);
  const result = await insertLineStatement(db, orderId, await nextPosition(db, orderId), input).run();
  return result.meta.last_row_id;
}

export async function updateLine(db: D1Database, id: number, input: LineInput): Promise<void> {
  const result = await db
    .prepare('UPDATE order_lines SET quantity = ?, piece_type = ?, measurements = ?, unit_price_cents = ? WHERE id = ?')
    .bind(input.quantity, input.pieceType, input.measurements, input.unitPriceCents, id)
    .run();
  await requireChanged(result, 'Línea');
}

export async function deleteLine(db: D1Database, id: number): Promise<void> {
  await requireChanged(await db.prepare('DELETE FROM order_lines WHERE id = ?').bind(id).run(), 'Línea');
}

/** Adds (or replaces) lines atomically: either every line is stored or none. */
export async function importLines(db: D1Database, orderId: number, input: ImportInput): Promise<number> {
  await requireOrder(db, orderId);
  const start = input.replaceExisting ? 1 : await nextPosition(db, orderId);
  const statements = [
    ...(input.replaceExisting ? [db.prepare('DELETE FROM order_lines WHERE order_id = ?').bind(orderId)] : []),
    ...input.lines.map((line, index) => insertLineStatement(db, orderId, start + index, line)),
  ];
  await db.batch(statements);
  return input.lines.length;
}

// ---------- Products (lines with their order context) ----------

interface ProductRow {
  line_id: number; order_id: number; order_date: string; supplier_name: string | null; quantity: number;
  piece_type: string; measurements: string; unit_price_cents: number | null; currency: Currency;
  shipping_cents: number; shipping_currency: Currency; customs_cents: number; customs_currency: Currency;
  fx_rate_micros: number | null; sale_price_cents: number | null; sale_currency: Currency | null; margin_bp: number | null;
}

/** Every line of every non-cancelled order, newest first, with what is needed for landed cost. */
export async function listProducts(db: D1Database) {
  const rows = await all<ProductRow>(
    db,
    `SELECT l.id AS line_id, o.id AS order_id, o.order_date, s.name AS supplier_name, l.quantity, l.piece_type,
            l.measurements, l.unit_price_cents, o.currency, o.shipping_cents, o.shipping_currency, o.customs_cents,
            o.customs_currency, o.fx_rate_micros, l.sale_price_cents, l.sale_currency, l.margin_bp
     FROM order_lines l
     JOIN orders o ON o.id = l.order_id
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE o.status != 'cancelado'
     ORDER BY o.order_date DESC, o.id DESC, l.position, l.id`,
  );
  return rows.map((r) => ({
    lineId: r.line_id, orderId: r.order_id, orderDate: r.order_date, supplierName: r.supplier_name ?? '',
    quantity: r.quantity, pieceType: r.piece_type, measurements: r.measurements, unitPriceCents: r.unit_price_cents,
    currency: r.currency, shippingCents: r.shipping_cents, shippingCurrency: r.shipping_currency,
    customsCents: r.customs_cents, customsCurrency: r.customs_currency, fxRateMicros: r.fx_rate_micros,
    salePriceCents: r.sale_price_cents, saleCurrency: r.sale_currency, marginBp: r.margin_bp,
  }));
}

export async function updateLinePricing(db: D1Database, id: number, input: LinePricingInput): Promise<void> {
  const result = await db
    .prepare('UPDATE order_lines SET sale_price_cents = ?, sale_currency = ?, margin_bp = ? WHERE id = ?')
    .bind(input.salePriceCents, input.saleCurrency, input.marginBp, id)
    .run();
  await requireChanged(result, 'Línea');
}

// ---------- Payments ----------

export async function listPayments(db: D1Database, orderId: number): Promise<Payment[]> {
  return (await all<PaymentRow>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = ? ORDER BY paid_on, id`, orderId)).map(toPayment);
}

export async function listAllPaymentsForList(db: D1Database) {
  const rows = await all<Pick<PaymentRow, 'order_id' | 'amount_cents' | 'currency' | 'fx_rate_micros'>>(
    db,
    'SELECT order_id, amount_cents, currency, fx_rate_micros FROM payments',
  );
  return rows.map((r) => ({ orderId: r.order_id, amountCents: r.amount_cents, currency: r.currency, fxRateMicros: r.fx_rate_micros }));
}

export async function getPayment(db: D1Database, id: number): Promise<Payment | null> {
  const row = await first<PaymentRow>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = ?`, id);
  return row ? toPayment(row) : null;
}

export async function createPayment(db: D1Database, orderId: number, input: PaymentInput): Promise<number> {
  await requireOrder(db, orderId);
  const result = await db
    .prepare(
      `INSERT INTO payments (order_id, amount_cents, currency, paid_on, method, fx_rate_micros, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(orderId, input.amountCents, input.currency, input.paidOn, input.method, input.fxRateMicros, input.note)
    .run();
  return result.meta.last_row_id;
}

export async function updatePayment(db: D1Database, id: number, input: PaymentInput): Promise<void> {
  const result = await db
    .prepare('UPDATE payments SET amount_cents = ?, currency = ?, paid_on = ?, method = ?, fx_rate_micros = ?, note = ? WHERE id = ?')
    .bind(input.amountCents, input.currency, input.paidOn, input.method, input.fxRateMicros, input.note, id)
    .run();
  await requireChanged(result, 'Pago');
}

export async function deletePayment(db: D1Database, id: number): Promise<void> {
  await requireChanged(await db.prepare('DELETE FROM payments WHERE id = ?').bind(id).run(), 'Pago');
}

// ---------- Settings ----------

export interface AppSettings {
  readonly fxRateMicros: number;
  readonly defaultCurrency: Currency;
  readonly fxAuto: boolean;
  readonly fxSource: string | null;
  readonly fxAsOf: string | null;
  readonly fxUpdatedAt: string | null;
}

const DEFAULT_FX_RATE_MICROS = 1_120_000;
const KEY = {
  fx: 'fx_eur_usd_micros',
  currency: 'default_currency',
  fxAuto: 'fx_auto',
  fxSource: 'fx_source',
  fxAsOf: 'fx_as_of',
  fxUpdatedAt: 'fx_updated_at',
} as const;
const UPSERT = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';

export async function getSettings(db: D1Database): Promise<AppSettings> {
  const rows = await all<{ key: string; value: string }>(db, 'SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const rate = Number(map.get(KEY.fx));
  return {
    fxRateMicros: Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_FX_RATE_MICROS,
    defaultCurrency: CURRENCIES.find((c) => c === map.get(KEY.currency)) ?? 'USD',
    fxAuto: map.get(KEY.fxAuto) !== '0',
    fxSource: map.get(KEY.fxSource) ?? null,
    fxAsOf: map.get(KEY.fxAsOf) ?? null,
    fxUpdatedAt: map.get(KEY.fxUpdatedAt) ?? null,
  };
}

const upsert = (db: D1Database, key: string, value: string) => db.prepare(UPSERT).bind(key, value);

export async function saveSettings(db: D1Database, input: SettingsInput): Promise<void> {
  const statements = [upsert(db, KEY.currency, input.defaultCurrency), upsert(db, KEY.fxAuto, input.fxAuto ? '1' : '0')];
  if (!input.fxAuto && input.manualFxRateMicros !== null) {
    const now = new Date().toISOString();
    statements.push(
      upsert(db, KEY.fx, String(input.manualFxRateMicros)),
      upsert(db, KEY.fxSource, 'manual'),
      upsert(db, KEY.fxAsOf, now),
      upsert(db, KEY.fxUpdatedAt, now),
    );
  }
  await db.batch(statements);
}

export async function saveFxQuote(db: D1Database, quote: FxQuote, fetchedAt: string): Promise<void> {
  await db.batch([
    upsert(db, KEY.fx, String(quote.rateMicros)),
    upsert(db, KEY.fxSource, quote.source),
    upsert(db, KEY.fxAsOf, quote.asOf),
    upsert(db, KEY.fxUpdatedAt, fetchedAt),
  ]);
}

// ---------- Backup ----------

const BACKUP_TABLES = ['suppliers', 'orders', 'order_lines', 'payments', 'settings'] as const;

export async function exportBackup(db: D1Database): Promise<Record<string, unknown>> {
  const entries = await Promise.all(BACKUP_TABLES.map(async (table) => [table, await all(db, `SELECT * FROM ${table}`)] as const));
  return { app: 'compras-proveedores', schema: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(entries) };
}
