import { useCallback } from 'react';
import type { SQLiteDatabase } from 'expo-sqlite';
import { listLines } from '@/db/linesRepo';
import { getOrder } from '@/db/ordersRepo';
import { listPayments } from '@/db/paymentsRepo';
import { getSettings } from '@/db/settingsRepo';
import { getSupplier } from '@/db/suppliersRepo';
import { paidCents, paymentSummary, type PaymentSummary } from '@/domain/payments';
import { orderTotals, type OrderTotals } from '@/domain/totals';
import type { Order, OrderLine, Payment, Supplier } from '@/domain/types';
import { useLoader, type LoaderState } from './useLoader';

export interface OrderDetail {
  readonly order: Order;
  readonly supplier: Supplier | null;
  readonly lines: readonly OrderLine[];
  readonly payments: readonly Payment[];
  readonly totals: OrderTotals;
  readonly payment: PaymentSummary;
}

export async function loadOrderDetail(db: SQLiteDatabase, orderId: number): Promise<OrderDetail | null> {
  const order = await getOrder(db, orderId);
  if (!order) return null;
  const [supplier, lines, payments, settings] = await Promise.all([
    getSupplier(db, order.supplierId),
    listLines(db, orderId),
    listPayments(db, orderId),
    getSettings(db),
  ]);
  const totals = orderTotals(order, lines, settings.fxRateMicros);
  const paid = paidCents(payments, order.currency, totals.rateMicros);
  return { order, supplier, lines, payments, totals, payment: paymentSummary(totals.totalCents, paid) };
}

export function useOrderDetail(orderId: number): LoaderState<OrderDetail | null> {
  const load = useCallback((db: SQLiteDatabase) => loadOrderDetail(db, orderId), [orderId]);
  return useLoader(load);
}
