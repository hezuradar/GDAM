import type { SQLiteDatabase } from 'expo-sqlite';
import type { Supplier } from '@/domain/types';
import { toSupplier, type SupplierRow } from './rows';

export type SupplierInput = Omit<Supplier, 'id'>;

export async function listSuppliers(db: SQLiteDatabase): Promise<Supplier[]> {
  const rows = await db.getAllAsync<SupplierRow>(
    'SELECT id, name, whatsapp, notes FROM suppliers ORDER BY name COLLATE NOCASE',
  );
  return rows.map(toSupplier);
}

export async function getSupplier(db: SQLiteDatabase, id: number): Promise<Supplier | null> {
  const row = await db.getFirstAsync<SupplierRow>(
    'SELECT id, name, whatsapp, notes FROM suppliers WHERE id = ?',
    id,
  );
  return row ? toSupplier(row) : null;
}

/** Inserts when id is null; returns the supplier id. */
export async function saveSupplier(db: SQLiteDatabase, input: SupplierInput, id: number | null): Promise<number> {
  const params = [input.name.trim(), input.whatsapp.trim(), input.notes.trim()];
  if (id === null) {
    const result = await db.runAsync('INSERT INTO suppliers (name, whatsapp, notes) VALUES (?, ?, ?)', params);
    return result.lastInsertRowId;
  }
  await db.runAsync('UPDATE suppliers SET name = ?, whatsapp = ?, notes = ? WHERE id = ?', [...params, id]);
  return id;
}

export async function countSupplierOrders(db: SQLiteDatabase, id: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE supplier_id = ?', id);
  return row?.n ?? 0;
}

/** Suppliers with orders cannot be deleted (FK RESTRICT); callers should check first. */
export async function deleteSupplier(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM suppliers WHERE id = ?', id);
}
