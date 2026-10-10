import type { SQLiteDatabase } from 'expo-sqlite';
import type { ListPayment } from '@/domain/orderList';
import type { Payment } from '@/domain/types';
import { toPayment, type PaymentRow } from './rows';

export type PaymentInput = Omit<Payment, 'id' | 'orderId'>;

const PAYMENT_COLUMNS = 'id, order_id, amount_cents, currency, paid_on, method, fx_rate_micros, note';

export async function listPayments(db: SQLiteDatabase, orderId: number): Promise<Payment[]> {
  const rows = await db.getAllAsync<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE order_id = ? ORDER BY paid_on, id`,
    orderId,
  );
  return rows.map(toPayment);
}

export async function listAllPaymentsForList(db: SQLiteDatabase): Promise<ListPayment[]> {
  const rows = await db.getAllAsync<Pick<PaymentRow, 'order_id' | 'amount_cents' | 'currency' | 'fx_rate_micros'>>(
    'SELECT order_id, amount_cents, currency, fx_rate_micros FROM payments',
  );
  return rows.map((r) => ({
    orderId: r.order_id,
    amountCents: r.amount_cents,
    currency: r.currency,
    fxRateMicros: r.fx_rate_micros,
  }));
}

export async function getPayment(db: SQLiteDatabase, id: number): Promise<Payment | null> {
  const row = await db.getFirstAsync<PaymentRow>(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = ?`, id);
  return row ? toPayment(row) : null;
}

export async function savePayment(
  db: SQLiteDatabase,
  orderId: number,
  input: PaymentInput,
  id: number | null,
): Promise<number> {
  const params = [input.amountCents, input.currency, input.paidOn, input.method, input.fxRateMicros, input.note.trim()];
  if (id === null) {
    const result = await db.runAsync(
      `INSERT INTO payments (amount_cents, currency, paid_on, method, fx_rate_micros, note, order_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [...params, orderId],
    );
    return result.lastInsertRowId;
  }
  await db.runAsync(
    'UPDATE payments SET amount_cents = ?, currency = ?, paid_on = ?, method = ?, fx_rate_micros = ?, note = ? WHERE id = ?',
    [...params, id],
  );
  return id;
}

export async function deletePayment(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM payments WHERE id = ?', id);
}
