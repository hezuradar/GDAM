import { marketRates } from '@/domain/money';
import { useCallback } from 'react';
import { getOrderDetailRaw } from '@/api/data';
import { orderPaidCents, paymentSummary, type PaymentSummary } from '@/domain/payments';
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
  const totals = orderTotals(raw.order, raw.lines, marketRates(raw.settings));
  const paid = orderPaidCents(raw.payments, raw.order.currency, totals.rates, totals.customsCents);
  return { ...raw, totals, payment: paymentSummary(totals.totalCents, paid) };
}

export function useOrderDetail(orderId: number): LoaderState<OrderDetail | null> {
  const load = useCallback(() => loadOrderDetail(orderId), [orderId]);
  return useLoader(load);
}
