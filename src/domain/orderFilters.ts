import type { Currency, OrderStatus, PaymentStatus } from './types';

export interface OrderListItem {
  readonly id: number;
  readonly supplierId: number;
  readonly supplierName: string;
  readonly orderDate: string;
  readonly status: OrderStatus;
  readonly currency: Currency;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  readonly pendingCents: number;
  readonly pendingPriceCount: number;
  readonly lineCount: number;
  /** EUR→USD rate this order uses (its own snapshot or the market rate), for display conversion. */
  readonly rateMicros: number;
  readonly trackingNumber: string;
  /** Concatenated product text (piece types, measurements, notes, carrier). */
  readonly searchText: string;
}

export const ORDER_SORTS = ['fecha_desc', 'fecha_asc', 'pendiente_desc'] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

export interface OrderFilterCriteria {
  readonly supplierId?: number | null;
  readonly statuses?: readonly OrderStatus[];
  readonly paymentStatuses?: readonly PaymentStatus[];
  readonly currency?: Currency | null;
  readonly query?: string;
  readonly sort?: OrderSort;
}

export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const COMPARATORS: Record<OrderSort, (a: OrderListItem, b: OrderListItem) => number> = {
  fecha_desc: (a, b) => b.orderDate.localeCompare(a.orderDate) || b.id - a.id,
  fecha_asc: (a, b) => a.orderDate.localeCompare(b.orderDate) || a.id - b.id,
  pendiente_desc: (a, b) => b.pendingCents - a.pendingCents || b.orderDate.localeCompare(a.orderDate),
};

function matchesQuery(item: OrderListItem, foldedQuery: string): boolean {
  if (foldedQuery.length === 0) return true;
  const haystack = foldText(`${item.id} ${item.supplierName} ${item.trackingNumber} ${item.searchText}`);
  return foldedQuery.split(/\s+/).every((term) => haystack.includes(term));
}

/** Returns a new filtered and sorted array; the input is not modified. */
export function filterOrders(
  items: readonly OrderListItem[],
  criteria: OrderFilterCriteria,
): OrderListItem[] {
  const foldedQuery = foldText(criteria.query?.trim() ?? '');
  const statuses = criteria.statuses ?? [];
  const paymentStatuses = criteria.paymentStatuses ?? [];

  return items
    .filter((item) => criteria.supplierId == null || item.supplierId === criteria.supplierId)
    .filter((item) => statuses.length === 0 || statuses.includes(item.status))
    .filter((item) => paymentStatuses.length === 0 || paymentStatuses.includes(item.paymentStatus))
    .filter((item) => criteria.currency == null || item.currency === criteria.currency)
    .filter((item) => matchesQuery(item, foldedQuery))
    .sort(COMPARATORS[criteria.sort ?? 'fecha_desc']);
}

export function countActiveFilters(criteria: OrderFilterCriteria): number {
  return (
    (criteria.supplierId != null ? 1 : 0) +
    (criteria.statuses?.length ? 1 : 0) +
    (criteria.paymentStatuses?.length ? 1 : 0) +
    (criteria.currency != null ? 1 : 0)
  );
}
