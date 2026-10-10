import type { SQLiteDatabase } from 'expo-sqlite';

const TABLES = ['suppliers', 'orders', 'order_lines', 'payments', 'settings'] as const;

/** Full JSON dump of all tables, for sharing as a manual backup. */
export async function exportBackupJson(db: SQLiteDatabase): Promise<string> {
  const entries = await Promise.all(
    TABLES.map(async (table) => [table, await db.getAllAsync(`SELECT * FROM ${table}`)] as const),
  );
  return JSON.stringify(
    { app: 'compras-proveedores', schema: 1, exportedAt: new Date().toISOString(), ...Object.fromEntries(entries) },
    null,
    1,
  );
}
