import { useCallback } from 'react';
import { getOrderDetailRaw } from '@/api/data';
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

export async function loadOrderDetail(orderId: number): Promise<OrderDetail | null> {
  const raw = await getOrderDetailRaw(orderId);
  if (!raw) return null;
  const totals = orderTotals(raw.order, raw.lines, raw.settings.fxRateMicros);
  const paid = paidCents(raw.payments, raw.order.currency, totals.rateMicros);
  return { ...raw, totals, payment: paymentSummary(totals.totalCents, paid) };
}

export function useOrderDetail(orderId: number): LoaderState<OrderDetail | null> {
  const load = useCallback(() => loadOrderDetail(orderId), [orderId]);
  return useLoader(load);
}
