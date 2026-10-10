import type { SQLiteDatabase } from 'expo-sqlite';
import type { ListLine } from '@/domain/orderList';
import type { OrderLine } from '@/domain/types';
import { toLine, type LineRow } from './rows';

export type LineInput = Pick<OrderLine, 'quantity' | 'pieceType' | 'measurements' | 'unitPriceCents' | 'rawText'>;

const LINE_COLUMNS = 'id, order_id, position, quantity, piece_type, measurements, unit_price_cents, raw_text';

export async function listLines(db: SQLiteDatabase, orderId: number): Promise<OrderLine[]> {
  const rows = await db.getAllAsync<LineRow>(
    `SELECT ${LINE_COLUMNS} FROM order_lines WHERE order_id = ? ORDER BY position, id`,
    orderId,
  );
  return rows.map(toLine);
}

/** Lightweight projection used to build the order list. */
export async function listAllLinesForList(db: SQLiteDatabase): Promise<ListLine[]> {
  const rows = await db.getAllAsync<Pick<LineRow, 'order_id' | 'quantity' | 'unit_price_cents' | 'piece_type' | 'measurements'>>(
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

export async function getLine(db: SQLiteDatabase, id: number): Promise<OrderLine | null> {
  const row = await db.getFirstAsync<LineRow>(`SELECT ${LINE_COLUMNS} FROM order_lines WHERE id = ?`, id);
  return row ? toLine(row) : null;
}

async function nextPosition(db: SQLiteDatabase, orderId: number): Promise<number> {
  const row = await db.getFirstAsync<{ p: number | null }>(
    'SELECT MAX(position) AS p FROM order_lines WHERE order_id = ?',
    orderId,
  );
  return (row?.p ?? 0) + 1;
}

async function insertLine(db: SQLiteDatabase, orderId: number, position: number, line: LineInput): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO order_lines (order_id, position, quantity, piece_type, measurements, unit_price_cents, raw_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orderId, position, line.quantity, line.pieceType.trim(), line.measurements.trim(), line.unitPriceCents, line.rawText],
  );
  return result.lastInsertRowId;
}

export async function saveLine(db: SQLiteDatabase, orderId: number, input: LineInput, id: number | null): Promise<number> {
  if (id === null) return insertLine(db, orderId, await nextPosition(db, orderId), input);
  await db.runAsync(
    'UPDATE order_lines SET quantity = ?, piece_type = ?, measurements = ?, unit_price_cents = ? WHERE id = ?',
    [input.quantity, input.pieceType.trim(), input.measurements.trim(), input.unitPriceCents, id],
  );
  return id;
}

export async function deleteLine(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM order_lines WHERE id = ?', id);
}

/** Adds (or replaces) lines atomically: either all lines are stored or none. */
export async function importLines(
  db: SQLiteDatabase,
  orderId: number,
  lines: readonly LineInput[],
  replaceExisting: boolean,
): Promise<void> {
  // Main connection (not an exclusive one) so the foreign_keys pragma set in onInit applies.
  await db.withTransactionAsync(async () => {
    if (replaceExisting) await db.runAsync('DELETE FROM order_lines WHERE order_id = ?', orderId);
    const start = await nextPosition(db, orderId);
    for (const [index, line] of lines.entries()) {
      await insertLine(db, orderId, start + index, line);
    }
  });
}
