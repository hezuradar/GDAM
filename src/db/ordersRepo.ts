import type { SQLiteDatabase } from 'expo-sqlite';
import { convert } from '@/domain/money';
import type { Currency, Order, OrderStatus } from '@/domain/types';
import { toOrder, type OrderRow } from './rows';

export type OrderInput = Omit<Order, 'id'>;

const ORDER_COLUMNS = `id, supplier_id, order_date, status, currency, shipping_cents, shipping_currency,
  customs_cents, customs_currency, fx_rate_micros, carrier, tracking_number, notes`;

export async function listOrders(db: SQLiteDatabase): Promise<Order[]> {
  const rows = await db.getAllAsync<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders`);
  return rows.map(toOrder);
}

export async function getOrder(db: SQLiteDatabase, id: number): Promise<Order | null> {
  const row = await db.getFirstAsync<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`, id);
  return row ? toOrder(row) : null;
}

function orderParams(input: OrderInput) {
  return [
    input.supplierId,
    input.orderDate,
    input.status,
    input.currency,
    input.shippingCents,
    input.shippingCurrency,
    input.customsCents,
    input.customsCurrency,
    input.fxRateMicros,
    input.carrier.trim(),
    input.trackingNumber.trim(),
    input.notes.trim(),
  ];
}

/**
 * Line prices are stored in the order currency, so changing the currency converts them
 * (at the order rate, or the fallback) in the same transaction as the order update.
 */
async function updateOrderConvertingLines(
  db: SQLiteDatabase,
  input: OrderInput,
  id: number,
  fallbackRateMicros: number,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const previous = await db.getFirstAsync<{ currency: Currency }>('SELECT currency FROM orders WHERE id = ?', id);
    if (!previous) throw new Error('El pedido ya no existe');
    if (previous.currency !== input.currency) {
      const rate = input.fxRateMicros ?? fallbackRateMicros;
      const lines = await db.getAllAsync<{ id: number; unit_price_cents: number }>(
        'SELECT id, unit_price_cents FROM order_lines WHERE order_id = ? AND unit_price_cents IS NOT NULL',
        id,
      );
      for (const line of lines) {
        const converted = convert(line.unit_price_cents, previous.currency, input.currency, rate);
        await db.runAsync('UPDATE order_lines SET unit_price_cents = ? WHERE id = ?', [converted, line.id]);
      }
    }
    await db.runAsync(
      `UPDATE orders SET supplier_id = ?, order_date = ?, status = ?, currency = ?, shipping_cents = ?,
        shipping_currency = ?, customs_cents = ?, customs_currency = ?, fx_rate_micros = ?, carrier = ?,
        tracking_number = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [...orderParams(input), id],
    );
  });
}

/** Inserts when id is null; returns the order id. */
export async function saveOrder(
  db: SQLiteDatabase,
  input: OrderInput,
  id: number | null,
  fallbackRateMicros: number,
): Promise<number> {
  if (id === null) {
    const result = await db.runAsync(
      `INSERT INTO orders (supplier_id, order_date, status, currency, shipping_cents, shipping_currency,
        customs_cents, customs_currency, fx_rate_micros, carrier, tracking_number, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderParams(input),
    );
    return result.lastInsertRowId;
  }
  await updateOrderConvertingLines(db, input, id, fallbackRateMicros);
  return id;
}

export async function updateOrderStatus(db: SQLiteDatabase, id: number, status: OrderStatus): Promise<void> {
  await db.runAsync("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?", [status, id]);
}

/** Lines and payments are removed by ON DELETE CASCADE. */
export async function deleteOrder(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM orders WHERE id = ?', id);
}
