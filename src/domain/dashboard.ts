import { daysBetween, todayIso } from './dates';
import type { OrderListItem } from './orderFilters';
import { ORDER_STATUSES, type OrderStatus } from './types';

/** Days an open (confirmed or shipped) order can wait before it is flagged as late. */
export const LATE_ORDER_DAYS = 30;

const OPEN_STATUSES: readonly OrderStatus[] = ['confirmado', 'enviado'];

export interface StatusCount {
  readonly status: OrderStatus;
  readonly count: number;
}

export interface LateOrder {
  readonly id: number;
  readonly supplierName: string;
  readonly status: OrderStatus;
  readonly orderDate: string;
  readonly days: number;
}

export interface OrderOverview {
  /** Every status, in workflow order, with how many orders are in it. */
  readonly statusCounts: readonly StatusCount[];
  /** Open orders waiting at least LATE_ORDER_DAYS, longest first (limited). */
  readonly lateOrders: readonly LateOrder[];
  readonly lateCount: number;
  /** Orders (not cancelled) with something still to pay. */
  readonly unpaidCount: number;
  /** Orders (not cancelled) with lines that have no price yet. */
  readonly missingPriceCount: number;
}

export function orderOverview(items: readonly OrderListItem[], today: string = todayIso(), limit = 5): OrderOverview {
  const live = items.filter((i) => i.status !== 'cancelado');
  const late = items
    .filter((i) => OPEN_STATUSES.includes(i.status))
    .map((i) => ({ id: i.id, supplierName: i.supplierName, status: i.status, orderDate: i.orderDate, days: Math.max(0, daysBetween(i.orderDate, today)) }))
    .filter((o) => o.days >= LATE_ORDER_DAYS)
    .sort((a, b) => b.days - a.days || a.id - b.id);

  return {
    statusCounts: ORDER_STATUSES.map((status) => ({ status, count: items.filter((i) => i.status === status).length })),
    lateOrders: late.slice(0, limit),
    lateCount: late.length,
    unpaidCount: live.filter((i) => i.pendingCents > 0).length,
    missingPriceCount: live.filter((i) => i.pendingPriceCount > 0).length,
  };
}
