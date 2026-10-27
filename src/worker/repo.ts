import type { FxQuote } from '../domain/fxRate';
import { plural } from '../domain/exportText';
import { convert, marketRates, withUsdRate } from '../domain/money';
import {
  CURRENCIES,
  type Currency,
  type FxSnapshot,
  type Order,
  type OrderLine,
  type OrderStatus,
  type Payment,
  type Supplier,
} from '../domain/types';
import { HttpError, notFound } from './http';
import type { ImportInput, LineInput, LinePricesInput, LinePricingInput, ReceptionInput, OrderInput, PaymentInput, SettingsInput, SupplierInput } from './validate';

/** Data access on Cloudflare D1. Every query is parameterised; multi-statement writes use batch() (atomic). */

// ---------- Row mappers (snake_case → domain) ----------

interface SupplierRow { id: number; name: string; whatsapp: string; notes: string }
interface OrderRow {
  id: number; supplier_id: number; order_date: string; status: OrderStatus; currency: Currency;
  shipping_cents: number; shipping_currency: Currency; customs_cents: number; customs_currency: Currency;
  fx_rate_micros: number | null; carrier: string; tracking_number: string; notes: string;
  shipping_fx_rate_micros: number | null; shipping_inr_rate_micros: number | null;
  customs_fx_rate_micros: number | null; customs_inr_rate_micros: number | null; received_date: string | null;
}
interface LineRow {
  id: number; order_id: number; position: number; quantity: number; piece_type: string;
  measurements: string; unit_price_cents: number | null; raw_text: string; received_quantity: number | null;
}
interface PaymentRow {
  id: number; order_id: number; amount_cents: number; currency: Currency; paid_on: string;
  method: Payment['method']; fx_rate_micros: number | null; note: string; inr_rate_micros: number | null;
}

/** The rates frozen with an amount, or null when it was saved before they were frozen. */
const frozenRates = (usdMicros: number | null, inrMicros: number | null): FxSnapshot | null =>
  usdMicros === null && inrMicros === null ? null : { usdMicros, inrMicros };

const toSupplier = (r: SupplierRow): Supplier => ({ id: r.id, name: r.name, whatsapp: r.whatsapp, notes: r.notes });
const toOrder = (r: OrderRow): Order => ({
  id: r.id, supplierId: r.supplier_id, orderDate: r.order_date, status: r.status, currency: r.currency,
  shippingCents: r.shipping_cents, shippingCurrency: r.shipping_currency, customsCents: r.customs_cents,
  customsCurrency: r.customs_currency, fxRateMicros: r.fx_rate_micros, carrier: r.carrier,
  trackingNumber: r.tracking_number, notes: r.notes, receivedDate: r.received_date,
  shippingSnapshot: frozenRates(r.shipping_fx_rate_micros, r.shipping_inr_rate_micros),
  customsSnapshot: frozenRates(r.customs_fx_rate_micros, r.customs_inr_rate_micros),
});
const toLine = (r: LineRow): OrderLine => ({
  id: r.id, orderId: r.order_id, position: r.position, quantity: r.quantity, pieceType: r.piece_type,
  measurements: r.measurements, unitPriceCents: r.unit_price_cents, rawText: r.raw_text, receivedQuantity: r.received_quantity,
});
const toPayment = (r: PaymentRow): Payment => ({
  id: r.id, orderId: r.order_id, amountCents: r.amount_cents, currency: r.currency, paidOn: r.paid_on,
  method: r.method, snapshot: frozenRates(r.fx_rate_micros, r.inr_rate_micros), note: r.note,
});

const SUPPLIER_COLUMNS = 'id, name, whatsapp, notes';
const ORDER_COLUMNS = `id, supplier_id, order_date, status, currency, shipping_cents, shipping_currency,
  customs_cents, customs_currency, fx_rate_micros, carrier, tracking_number, notes,
  shipping_fx_rate_micros, shipping_inr_rate_micros, customs_fx_rate_micros, customs_inr_rate_micros, received_date`;
const LINE_COLUMNS = 'id, order_id, position, quantity, piece_type, measurements, unit_price_cents, raw_text, received_quantity';
const PAYMENT_COLUMNS = 'id, order_id, amount_cents, currency, paid_on, method, fx_rate_micros, note, inr_rate_micros';

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

async function requireSupplier(db: D1Database, supplierId: number): Promise<void> {
  if (!(await getSupplier(db, supplierId))) throw new HttpError(400, 'El proveedor no existe');
}

/** The rates frozen with an amount: both parts are present when it is written. */
type FrozenRates = { usdMicros: number; inrMicros: number };

/**
 * The rates to freeze with an amount that is written right now: the order's fixed rate when it has
 * one, else the market rate. The client never sends them: the server stamps them when it writes.
 */
async function currentSnapshot(db: D1Database, orderFxRateMicros: number | null): Promise<FrozenRates> {
  const settings = await getSettings(db);
  return { usdMicros: orderFxRateMicros ?? settings.fxRateMicros, inrMicros: settings.inrRateMicros };
}

/**
 * Re-values an amount when the order's fixed EUR→USD rate changes: only that part changes, the
 * rupee keeps the rate it was frozen with (the order's fixed rate says nothing about it).
 */
const revalued = (previous: FxSnapshot | null, usdMicros: number, inrMicros: number): FrozenRates => ({
  usdMicros,
  inrMicros: previous?.inrMicros ?? inrMicros,
});

/** Received orders keep the day they first arrived; any other status clears it. Binds the status once. */
const RECEIVED_DATE_SQL = "received_date = CASE WHEN ? = 'recibido' THEN COALESCE(received_date, date('now')) ELSE NULL END";

export async function createOrder(db: D1Database, input: OrderInput): Promise<number> {
  await requireSupplier(db, input.supplierId);
  const snapshot = await currentSnapshot(db, input.fxRateMicros);
  const result = await db
    .prepare(
      `INSERT INTO orders (supplier_id, order_date, status, currency, shipping_cents, shipping_currency,
        shipping_fx_rate_micros, shipping_inr_rate_micros, customs_cents, customs_currency,
        customs_fx_rate_micros, customs_inr_rate_micros, fx_rate_micros, carrier, tracking_number, notes, received_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'recibido' THEN date('now') END)`,
    )
    .bind(
      input.supplierId, input.orderDate, input.status, input.currency, input.shippingCents, input.shippingCurrency,
      snapshot.usdMicros, snapshot.inrMicros, input.customsCents, input.customsCurrency,
      snapshot.usdMicros, snapshot.inrMicros, input.fxRateMicros, input.carrier, input.trackingNumber, input.notes,
      input.status,
    )
    .run();
  return result.meta.last_row_id;
}

/**
 * Line prices are stored in the order currency, so changing the currency converts them
 * (at the order rate, or the current setting) atomically with the order update.
 * The frozen rates follow the same rule: an amount that changes is stamped with the rates in force
 * now, an amount that stays keeps the rates it was entered with. When the order's fixed rate
 * changes, the whole order is valued again with the new rate.
 */
export async function updateOrder(db: D1Database, id: number, input: OrderInput): Promise<void> {
  const previous = await getOrder(db, id);
  if (!previous) throw notFound('Pedido');
  await requireSupplier(db, input.supplierId);

  const statements: D1PreparedStatement[] = [];
  const market = marketRates(await getSettings(db));
  const rateChanged = previous.fxRateMicros !== input.fxRateMicros;
  const snapshot: FrozenRates = { usdMicros: input.fxRateMicros ?? market.usdMicros, inrMicros: market.inrMicros };
  const shippingChanged =
    previous.shippingCents !== input.shippingCents || previous.shippingCurrency !== input.shippingCurrency;
  const customsChanged =
    previous.customsCents !== input.customsCents || previous.customsCurrency !== input.customsCurrency;
  const shippingSnapshot = shippingChanged
    ? snapshot
    : rateChanged
      ? revalued(previous.shippingSnapshot, snapshot.usdMicros, snapshot.inrMicros)
      : previous.shippingSnapshot;
  const customsSnapshot = customsChanged
    ? snapshot
    : rateChanged
      ? revalued(previous.customsSnapshot, snapshot.usdMicros, snapshot.inrMicros)
      : previous.customsSnapshot;

  if (previous.currency !== input.currency) {
    const rates = withUsdRate(market, input.fxRateMicros);
    const lines = await all<{ id: number; unit_price_cents: number }>(
      db,
      'SELECT id, unit_price_cents FROM order_lines WHERE order_id = ? AND unit_price_cents IS NOT NULL',
      id,
    );
    for (const line of lines) {
      const converted = convert(line.unit_price_cents, previous.currency, input.currency, rates);
      statements.push(db.prepare('UPDATE order_lines SET unit_price_cents = ? WHERE id = ?').bind(converted, line.id));
    }
  }
  if (rateChanged) {
    // The order's fixed rate changed: the amounts it holds are valued again with the new rate.
    // Only the EUR→USD part changes; the rupee keeps the rate each amount was frozen with.
    for (const [column, amount] of [
      ['theoretical_fx_rate_micros', 'theoretical_cost_cents'],
      ['sale_fx_rate_micros', 'sale_price_cents'],
      ['handling_fx_rate_micros', 'handling_cost_cents'],
    ] as const) {
      statements.push(
        db
          .prepare(`UPDATE order_lines SET ${column} = ? WHERE order_id = ? AND ${amount} IS NOT NULL`)
          .bind(snapshot.usdMicros, id),
      );
    }
  }
  statements.push(
    db
      .prepare(
        `UPDATE orders SET supplier_id = ?, order_date = ?, status = ?, currency = ?, shipping_cents = ?,
          shipping_currency = ?, shipping_fx_rate_micros = ?, shipping_inr_rate_micros = ?, customs_cents = ?,
          customs_currency = ?, customs_fx_rate_micros = ?, customs_inr_rate_micros = ?, fx_rate_micros = ?,
          carrier = ?, tracking_number = ?, notes = ?, ${RECEIVED_DATE_SQL}, updated_at = datetime('now')
         WHERE id = ?`,
      )
      .bind(
        input.supplierId, input.orderDate, input.status, input.currency, input.shippingCents, input.shippingCurrency,
        shippingSnapshot?.usdMicros ?? null, shippingSnapshot?.inrMicros ?? null, input.customsCents, input.customsCurrency,
        customsSnapshot?.usdMicros ?? null, customsSnapshot?.inrMicros ?? null, input.fxRateMicros,
        input.carrier, input.trackingNumber, input.notes, input.status, id,
      ),
  );
  await db.batch(statements);
}

export async function updateOrderStatus(db: D1Database, id: number, status: OrderStatus): Promise<void> {
  const result = await db
    .prepare(`UPDATE orders SET status = ?, ${RECEIVED_DATE_SQL}, updated_at = datetime('now') WHERE id = ?`)
    .bind(status, status, id)
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

/**
 * Adds (or replaces) lines atomically, optionally applying the order's shipping in the same batch.
 * The shipping keeps the rates it was frozen with unless the amount or its currency changes.
 */
export async function importLines(db: D1Database, orderId: number, input: ImportInput): Promise<number> {
  const order = await getOrder(db, orderId);
  if (!order) throw notFound('Pedido');
  const start = input.replaceExisting ? 1 : await nextPosition(db, orderId);
  const shippingChanged =
    input.shipping !== null &&
    (input.shipping.cents !== order.shippingCents || input.shipping.currency !== order.shippingCurrency);
  const snapshot = input.shipping
    ? shippingChanged
      ? await currentSnapshot(db, order.fxRateMicros)
      : order.shippingSnapshot
    : null;
  const statements = [
    ...(input.replaceExisting ? [db.prepare('DELETE FROM order_lines WHERE order_id = ?').bind(orderId)] : []),
    ...input.lines.map((line, index) => insertLineStatement(db, orderId, start + index, line)),
    ...(input.shipping
      ? [
          db
            .prepare(
              "UPDATE orders SET shipping_cents = ?, shipping_currency = ?, shipping_fx_rate_micros = ?, shipping_inr_rate_micros = ?, updated_at = datetime('now') WHERE id = ?",
            )
            .bind(
              input.shipping.cents,
              input.shipping.currency,
              snapshot?.usdMicros ?? null,
              snapshot?.inrMicros ?? null,
              orderId,
            ),
        ]
      : []),
  ];
  if (statements.length === 0) throw new HttpError(400, 'Nada que guardar');
  await db.batch(statements);
  return input.lines.length;
}

async function requireOrderLines(db: D1Database, orderId: number, lineIds: readonly number[]): Promise<void> {
  await requireOrder(db, orderId);
  const rows = await all<{ id: number }>(db, 'SELECT id FROM order_lines WHERE order_id = ?', orderId);
  const ids = new Set(rows.map((r) => r.id));
  if (lineIds.some((id) => !ids.has(id))) throw new HttpError(400, 'Alguna línea no pertenece a este pedido');
}

/** Saves what arrived of each line and, when asked, marks the order as received — atomically. */
export async function saveReception(db: D1Database, orderId: number, input: ReceptionInput): Promise<void> {
  await requireOrderLines(db, orderId, input.lines.map((l) => l.lineId));
  const statements = input.lines.map((l) =>
    db.prepare('UPDATE order_lines SET received_quantity = ? WHERE id = ? AND order_id = ?').bind(l.receivedQuantity, l.lineId, orderId),
  );
  if (input.markReceived) {
    statements.push(db.prepare(`UPDATE orders SET status = 'recibido', ${RECEIVED_DATE_SQL}, updated_at = datetime('now') WHERE id = ?`).bind('recibido', orderId));
  }
  await db.batch(statements);
}

/** Sets the unit price of several lines of one order atomically; every line must belong to the order. */
export async function setLinePrices(db: D1Database, orderId: number, input: LinePricesInput): Promise<number> {
  await requireOrder(db, orderId);
  const rows = await all<{ id: number }>(db, 'SELECT id FROM order_lines WHERE order_id = ?', orderId);
  const ids = new Set(rows.map((r) => r.id));
  if (input.prices.some((p) => !ids.has(p.lineId))) throw new HttpError(400, 'Alguna línea no pertenece a este pedido');
  await db.batch(
    input.prices.map((p) =>
      db.prepare('UPDATE order_lines SET unit_price_cents = ? WHERE id = ? AND order_id = ?').bind(p.unitPriceCents, p.lineId, orderId),
    ),
  );
  return input.prices.length;
}

// ---------- Products (lines with their order context) ----------

interface ProductRow {
  line_id: number; order_id: number; order_date: string; supplier_name: string | null; quantity: number;
  piece_type: string; measurements: string; unit_price_cents: number | null; currency: Currency;
  shipping_cents: number; shipping_currency: Currency; customs_cents: number; customs_currency: Currency;
  fx_rate_micros: number | null; sale_price_cents: number | null; sale_currency: Currency | null; margin_bp: number | null;
  theoretical_cost_cents: number | null; theoretical_currency: Currency | null;
  handling_cost_cents: number | null; handling_currency: Currency | null;
  shipping_fx_rate_micros: number | null; shipping_inr_rate_micros: number | null;
  customs_fx_rate_micros: number | null; customs_inr_rate_micros: number | null;
  theoretical_fx_rate_micros: number | null; theoretical_inr_rate_micros: number | null;
  sale_fx_rate_micros: number | null; sale_inr_rate_micros: number | null;
  handling_fx_rate_micros: number | null; handling_inr_rate_micros: number | null;
}

/** Every line of every non-cancelled order, newest first, with what is needed for landed cost. */
export async function listProducts(db: D1Database) {
  const rows = await all<ProductRow>(
    db,
    `SELECT l.id AS line_id, o.id AS order_id, o.order_date, s.name AS supplier_name, l.quantity, l.piece_type,
            l.measurements, l.unit_price_cents, o.currency, o.shipping_cents, o.shipping_currency, o.customs_cents,
            o.customs_currency, o.fx_rate_micros, l.sale_price_cents, l.sale_currency, l.margin_bp,
            l.theoretical_cost_cents, l.theoretical_currency, l.handling_cost_cents, l.handling_currency,
            o.shipping_fx_rate_micros, o.shipping_inr_rate_micros, o.customs_fx_rate_micros, o.customs_inr_rate_micros,
            l.theoretical_fx_rate_micros, l.theoretical_inr_rate_micros, l.sale_fx_rate_micros, l.sale_inr_rate_micros,
            l.handling_fx_rate_micros, l.handling_inr_rate_micros
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
    theoreticalCostCents: r.theoretical_cost_cents, theoreticalCurrency: r.theoretical_currency,
    handlingCostCents: r.handling_cost_cents, handlingCurrency: r.handling_currency,
    shippingSnapshot: frozenRates(r.shipping_fx_rate_micros, r.shipping_inr_rate_micros),
    customsSnapshot: frozenRates(r.customs_fx_rate_micros, r.customs_inr_rate_micros),
    theoreticalSnapshot: frozenRates(r.theoretical_fx_rate_micros, r.theoretical_inr_rate_micros),
    saleSnapshot: frozenRates(r.sale_fx_rate_micros, r.sale_inr_rate_micros),
    handlingSnapshot: frozenRates(r.handling_fx_rate_micros, r.handling_inr_rate_micros),
  }));
}

interface PricingRow {
  order_id: number; sale_price_cents: number | null; sale_currency: Currency | null; margin_bp: number | null;
  theoretical_cost_cents: number | null; theoretical_currency: Currency | null;
  handling_cost_cents: number | null; handling_currency: Currency | null;
  sale_fx_rate_micros: number | null; sale_inr_rate_micros: number | null;
  theoretical_fx_rate_micros: number | null; theoretical_inr_rate_micros: number | null;
  handling_fx_rate_micros: number | null; handling_inr_rate_micros: number | null;
}

/**
 * Saves the sale price, the theoretical value and the handling cost of a line. Each amount that
 * changes is stamped with the rates in force now; the ones that stay keep the rates they were
 * entered with, so editing the sale price never moves the value of the handling cost.
 */
export async function updateLinePricing(db: D1Database, id: number, input: LinePricingInput): Promise<void> {
  const current = await first<PricingRow>(
    db,
    `SELECT order_id, sale_price_cents, sale_currency, margin_bp, theoretical_cost_cents, theoretical_currency,
            handling_cost_cents, handling_currency, sale_fx_rate_micros, sale_inr_rate_micros,
            theoretical_fx_rate_micros, theoretical_inr_rate_micros, handling_fx_rate_micros, handling_inr_rate_micros
     FROM order_lines WHERE id = ?`,
    id,
  );
  if (!current) throw notFound('Línea');
  const order = await getOrder(db, current.order_id);
  if (!order) throw notFound('Pedido');
  const snapshot = await currentSnapshot(db, order.fxRateMicros);

  const saleSnapshot =
    current.sale_price_cents !== input.salePriceCents || current.sale_currency !== input.saleCurrency
      ? snapshot
      : frozenRates(current.sale_fx_rate_micros, current.sale_inr_rate_micros);
  const theoreticalSnapshot =
    current.theoretical_cost_cents !== input.theoreticalCostCents || current.theoretical_currency !== input.theoreticalCurrency
      ? snapshot
      : frozenRates(current.theoretical_fx_rate_micros, current.theoretical_inr_rate_micros);
  const handlingSnapshot =
    current.handling_cost_cents !== input.handlingCostCents || current.handling_currency !== input.handlingCurrency
      ? snapshot
      : frozenRates(current.handling_fx_rate_micros, current.handling_inr_rate_micros);

  const result = await db
    .prepare(
      `UPDATE order_lines SET sale_price_cents = ?, sale_currency = ?, margin_bp = ?,
         sale_fx_rate_micros = ?, sale_inr_rate_micros = ?,
         theoretical_cost_cents = ?, theoretical_currency = ?, theoretical_fx_rate_micros = ?, theoretical_inr_rate_micros = ?,
         handling_cost_cents = ?, handling_currency = ?, handling_fx_rate_micros = ?, handling_inr_rate_micros = ?
       WHERE id = ?`,
    )
    .bind(
      input.salePriceCents, input.saleCurrency, input.marginBp,
      saleSnapshot?.usdMicros ?? null, saleSnapshot?.inrMicros ?? null,
      input.theoreticalCostCents, input.theoreticalCurrency,
      theoreticalSnapshot?.usdMicros ?? null, theoreticalSnapshot?.inrMicros ?? null,
      input.handlingCostCents, input.handlingCurrency,
      handlingSnapshot?.usdMicros ?? null, handlingSnapshot?.inrMicros ?? null,
      id,
    )
    .run();
  await requireChanged(result, 'Línea');
}

// ---------- Payments ----------

export async function listPayments(db: D1Database, orderId: number): Promise<Payment[]> {
  return (await all<PaymentRow>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = ? ORDER BY paid_on, id`, orderId)).map(toPayment);
}

export async function listAllPaymentsForList(db: D1Database) {
  const rows = await all<Pick<PaymentRow, 'order_id' | 'amount_cents' | 'currency' | 'fx_rate_micros' | 'inr_rate_micros'>>(
    db,
    'SELECT order_id, amount_cents, currency, fx_rate_micros, inr_rate_micros FROM payments',
  );
  return rows.map((r) => ({
    orderId: r.order_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    snapshot: frozenRates(r.fx_rate_micros, r.inr_rate_micros),
  }));
}

export async function getPayment(db: D1Database, id: number): Promise<Payment | null> {
  const row = await first<PaymentRow>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = ?`, id);
  return row ? toPayment(row) : null;
}

/**
 * A payment keeps the rates it was entered with: the rate the user fixed for it, the order's fixed
 * rate, or the market rate of that moment. The rupee rate is always the market one of that moment.
 */
export async function createPayment(db: D1Database, orderId: number, input: PaymentInput): Promise<number> {
  const order = await getOrder(db, orderId);
  if (!order) throw notFound('Pedido');
  const settings = await getSettings(db);
  const usdMicros = input.fxRateMicros ?? order.fxRateMicros ?? settings.fxRateMicros;
  const result = await db
    .prepare(
      `INSERT INTO payments (order_id, amount_cents, currency, paid_on, method, fx_rate_micros, inr_rate_micros, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(orderId, input.amountCents, input.currency, input.paidOn, input.method, usdMicros, settings.inrRateMicros, input.note)
    .run();
  return result.meta.last_row_id;
}

/**
 * Updates a payment. A rate typed by the user is the one that gets frozen; without one, the rates
 * the payment already had are kept, unless the amount changed (then they are stamped again).
 */
export async function updatePayment(db: D1Database, id: number, input: PaymentInput): Promise<void> {
  const current = await first<PaymentRow>(db, `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = ?`, id);
  if (!current) throw notFound('Pago');
  const previous = toPayment(current);
  const order = await getOrder(db, current.order_id);
  if (!order) throw notFound('Pedido');
  const settings = await getSettings(db);

  let usdMicros: number;
  let inrMicros: number;
  if (input.fxRateMicros !== null) {
    usdMicros = input.fxRateMicros;
    inrMicros = previous.snapshot?.inrMicros ?? settings.inrRateMicros;
  } else if (previous.amountCents !== input.amountCents || previous.currency !== input.currency) {
    usdMicros = order.fxRateMicros ?? settings.fxRateMicros;
    inrMicros = settings.inrRateMicros;
  } else {
    usdMicros = previous.snapshot?.usdMicros ?? order.fxRateMicros ?? settings.fxRateMicros;
    inrMicros = previous.snapshot?.inrMicros ?? settings.inrRateMicros;
  }

  const result = await db
    .prepare(
      'UPDATE payments SET amount_cents = ?, currency = ?, paid_on = ?, method = ?, fx_rate_micros = ?, inr_rate_micros = ?, note = ? WHERE id = ?',
    )
    .bind(input.amountCents, input.currency, input.paidOn, input.method, usdMicros, inrMicros, input.note, id)
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
  /** "1 EUR = X INR" * 1e6, always from the market (refreshed hourly). */
  readonly inrRateMicros: number;
  /** null until the first market quote for the rupee is stored. */
  readonly inrUpdatedAt: string | null;
  /** Last attempt to fetch the rupee rate (successful or not): limits retries to once per hour. */
  readonly inrCheckedAt: string | null;
}

const DEFAULT_FX_RATE_MICROS = 1_120_000;
const DEFAULT_INR_RATE_MICROS = 100_000_000;
const KEY = {
  fx: 'fx_eur_usd_micros',
  inr: 'fx_eur_inr_micros',
  inrUpdatedAt: 'fx_inr_updated_at',
  inrCheckedAt: 'fx_inr_checked_at',
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
  const inrRate = Number(map.get(KEY.inr));
  return {
    fxRateMicros: Number.isInteger(rate) && rate > 0 ? rate : DEFAULT_FX_RATE_MICROS,
    inrRateMicros: Number.isInteger(inrRate) && inrRate > 0 ? inrRate : DEFAULT_INR_RATE_MICROS,
    inrUpdatedAt: map.get(KEY.inrUpdatedAt) ?? null,
    inrCheckedAt: map.get(KEY.inrCheckedAt) ?? null,
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

export async function markInrChecked(db: D1Database, at: string): Promise<void> {
  await upsert(db, KEY.inrCheckedAt, at).run();
}

/** Stores the EUR/USD quote (when given) and the EUR/INR rate (when given). */
export async function saveFxQuote(
  db: D1Database,
  update: { readonly usd: FxQuote | null; readonly inrMicros: number | null },
  fetchedAt: string,
): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  if (update.usd) {
    statements.push(
      upsert(db, KEY.fx, String(update.usd.rateMicros)),
      upsert(db, KEY.fxSource, update.usd.source),
      upsert(db, KEY.fxAsOf, update.usd.asOf),
      upsert(db, KEY.fxUpdatedAt, fetchedAt),
    );
  }
  if (update.inrMicros !== null) {
    statements.push(upsert(db, KEY.inr, String(update.inrMicros)), upsert(db, KEY.inrUpdatedAt, fetchedAt));
  }
  if (statements.length > 0) await db.batch(statements);
}

// ---------- Backup ----------

const BACKUP_TABLES = ['suppliers', 'orders', 'order_lines', 'payments', 'settings'] as const;

export async function exportBackup(db: D1Database): Promise<Record<string, unknown>> {
  const entries = await Promise.all(BACKUP_TABLES.map(async (table) => [table, await all(db, `SELECT * FROM ${table}`)] as const));
  return { app: 'compras-proveedores', schema: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(entries) };
}
