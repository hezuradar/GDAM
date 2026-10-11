import { convert, withUsdRate, type FxRates } from './money';
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
  /** Rates actually used: the order's frozen EUR→USD rate (if any) over the market rates. */
  readonly rates: FxRates;
}

export function lineTotalCents(line: LineMoneyFields): number | null {
  return line.unitPriceCents === null ? null : Math.round(line.quantity * line.unitPriceCents);
}

export function effectiveRates(order: Pick<Order, 'fxRateMicros'>, marketRates: FxRates): FxRates {
  return withUsdRate(marketRates, order.fxRateMicros);
}

/** All amounts are returned in the order currency. Lines without price count as 0. */
export function orderTotals(
  order: OrderMoneyFields,
  lines: readonly LineMoneyFields[],
  marketRates: FxRates,
): OrderTotals {
  const rates = effectiveRates(order, marketRates);
  const lineTotals = lines.map(lineTotalCents);
  const goodsCents = lineTotals.reduce<number>((sum, total) => sum + (total ?? 0), 0);
  const pendingPriceCount = lineTotals.filter((total) => total === null).length;
  const shippingCents = convert(order.shippingCents, order.shippingCurrency, order.currency, rates);
  const customsCents = convert(order.customsCents, order.customsCurrency, order.currency, rates);

  return {
    goodsCents,
    shippingCents,
    customsCents,
    totalCents: goodsCents + shippingCents + customsCents,
    pendingPriceCount,
    rates,
  };
}
