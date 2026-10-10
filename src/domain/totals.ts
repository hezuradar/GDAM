import { convert } from './money';
import type { Order, OrderLine } from './types';

export type OrderMoneyFields = Pick<
  Order,
  'currency' | 'shippingCents' | 'shippingCurrency' | 'customsCents' | 'customsCurrency' | 'fxRateMicros'
>;
export type LineMoneyFields = Pick<OrderLine, 'quantity' | 'unitPriceCents'>;

export interface OrderTotals {
  readonly goodsCents: number;
  readonly shippingCents: number;
  readonly customsCents: number;
  readonly totalCents: number;
  readonly pendingPriceCount: number;
  /** Rate actually used: the order snapshot, or the global fallback. */
  readonly rateMicros: number;
}

export function lineTotalCents(line: LineMoneyFields): number | null {
  return line.unitPriceCents === null ? null : Math.round(line.quantity * line.unitPriceCents);
}

export function effectiveRate(order: Pick<Order, 'fxRateMicros'>, fallbackRateMicros: number): number {
  return order.fxRateMicros ?? fallbackRateMicros;
}

/** All amounts are returned in the order currency. Lines without price count as 0. */
export function orderTotals(
  order: OrderMoneyFields,
  lines: readonly LineMoneyFields[],
  fallbackRateMicros: number,
): OrderTotals {
  const rateMicros = effectiveRate(order, fallbackRateMicros);
  const lineTotals = lines.map(lineTotalCents);
  const goodsCents = lineTotals.reduce<number>((sum, total) => sum + (total ?? 0), 0);
  const pendingPriceCount = lineTotals.filter((total) => total === null).length;
  const shippingCents = convert(order.shippingCents, order.shippingCurrency, order.currency, rateMicros);
  const customsCents = convert(order.customsCents, order.customsCurrency, order.currency, rateMicros);

  return {
    goodsCents,
    shippingCents,
    customsCents,
    totalCents: goodsCents + shippingCents + customsCents,
    pendingPriceCount,
    rateMicros,
  };
}
