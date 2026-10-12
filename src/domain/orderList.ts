import type { FxRates } from './money';
import type { OrderListItem } from './orderFilters';
import { orderPaidCents, paymentSummary, type PaymentMoneyFields } from './payments';
import { orderTotals } from './totals';
import type { Order, OrderLine, Payment } from './types';

export type ListLine = Pick<OrderLine, 'orderId' | 'quantity' | 'unitPriceCents' | 'pieceType' | 'measurements'>;
export type ListPayment = Pick<Payment, 'orderId'> & PaymentMoneyFields;

export interface OrderListSource {
  readonly orders: readonly Order[];
  readonly lines: readonly ListLine[];
  readonly payments: readonly ListPayment[];
  readonly supplierNames: ReadonlyMap<number, string>;
  readonly marketRates: FxRates;
}

const UNKNOWN_SUPPLIER = 'Proveedor desconocido';

function groupByOrder<T extends { orderId: number }>(rows: readonly T[]): Map<number, T[]> {
  return rows.reduce((groups, row) => {
    groups.set(row.orderId, [...(groups.get(row.orderId) ?? []), row]);
    return groups;
  }, new Map<number, T[]>());
}

/** Joins orders with their lines and payments and computes list-level figures. */
export function buildOrderListItems(source: OrderListSource): OrderListItem[] {
  const linesByOrder = groupByOrder(source.lines);
  const paymentsByOrder = groupByOrder(source.payments);

  return source.orders.map((order) => {
    const lines = linesByOrder.get(order.id) ?? [];
    const totals = orderTotals(order, lines, source.marketRates);
    const paid = orderPaidCents(paymentsByOrder.get(order.id) ?? [], order.currency, totals.rates, totals.customsCents);
    const summary = paymentSummary(totals.totalCents, paid);
    const productText = lines.map((l) => `${l.pieceType} ${l.measurements}`).join(' ');

    return {
      id: order.id,
      supplierId: order.supplierId,
      supplierName: source.supplierNames.get(order.supplierId) ?? UNKNOWN_SUPPLIER,
      orderDate: order.orderDate,
      status: order.status,
      currency: order.currency,
      paymentStatus: summary.status,
      totalCents: totals.totalCents,
      pendingCents: summary.pendingCents,
      pendingPriceCount: totals.pendingPriceCount,
      lineCount: lines.length,
      rates: totals.rates,
      trackingNumber: order.trackingNumber,
      searchText: `${productText} ${order.carrier} ${order.notes}`,
    };
  });
}
