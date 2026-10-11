import { marketRates } from '@/domain/money';
import { loadOrderListRaw, type AppSettings } from '@/api/data';
import type { OrderListItem } from '@/domain/orderFilters';
import { buildOrderListItems } from '@/domain/orderList';
import type { Supplier } from '@/domain/types';

export interface OrderListData {
  readonly items: readonly OrderListItem[];
  readonly suppliers: readonly Supplier[];
  readonly settings: AppSettings;
}

/** Loads everything the order list needs in one request and joins it in memory. */
export async function loadOrderList(): Promise<OrderListData> {
  const { orders, lines, payments, suppliers, settings } = await loadOrderListRaw();
  const items = buildOrderListItems({
    orders,
    lines,
    payments,
    supplierNames: new Map(suppliers.map((s) => [s.id, s.name])),
    marketRates: marketRates(settings),
  });
  return { items, suppliers, settings };
}
