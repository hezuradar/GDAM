import type { SQLiteDatabase } from 'expo-sqlite';
import { listAllLinesForList } from '@/db/linesRepo';
import { listOrders } from '@/db/ordersRepo';
import { listAllPaymentsForList } from '@/db/paymentsRepo';
import { getSettings, type AppSettings } from '@/db/settingsRepo';
import { listSuppliers } from '@/db/suppliersRepo';
import type { OrderListItem } from '@/domain/orderFilters';
import { buildOrderListItems } from '@/domain/orderList';
import type { Supplier } from '@/domain/types';

export interface OrderListData {
  readonly items: readonly OrderListItem[];
  readonly suppliers: readonly Supplier[];
  readonly settings: AppSettings;
}

/** Loads everything the order list needs in parallel and joins it in memory. */
export async function loadOrderList(db: SQLiteDatabase): Promise<OrderListData> {
  const [orders, lines, payments, suppliers, settings] = await Promise.all([
    listOrders(db),
    listAllLinesForList(db),
    listAllPaymentsForList(db),
    listSuppliers(db),
    getSettings(db),
  ]);
  const items = buildOrderListItems({
    orders,
    lines,
    payments,
    supplierNames: new Map(suppliers.map((s) => [s.id, s.name])),
    fallbackRateMicros: settings.fxRateMicros,
  });
  return { items, suppliers, settings };
}
