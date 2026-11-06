import { amountRates, convert, withUsdRate, type FxRates } from './money';
import type { Order, OrderLine } from './types';

export type OrderMoneyFields = Pick<
  Order,
  | 'currency'
  | 'shippingCents'
  | 'shippingCurrency'
  | 'shippingSnapshot'
  | 'customsCents'
  | 'customsCurrency'
  | 'customsSnapshot'
  | 'fxRateMicros'
>;
export type LineMoneyFields = Pick<OrderLine, 'quantity' | 'unitPriceCents'> & { readonly isExcluded?: boolean };

export interface OrderTotals {
  readonly goodsCents: number;
  readonly shippingCents: number;
  readonly customsCents: number;
  readonly totalCents: number;
  readonly pendingPriceCount: number;
  /** Lines left out of the order: they are not charged, so they are not in the total. */
  readonly excludedCount: number;
  /** What the excluded lines were worth (order currency, priced ones only). */
  readonly excludedCents: number;
  /** Rates actually used: the order's frozen EUR→USD rate (if any) over the market rates. */
  readonly rates: FxRates;
  /** Rates used for the shipping and for the customs: each keeps the rates frozen when it was entered. */
  readonly shippingRates: FxRates;
  readonly customsRates: FxRates;
}

export function lineTotalCents(line: LineMoneyFields): number | null {
  return line.unitPriceCents === null ? null : Math.round(line.quantity * line.unitPriceCents);
}

export function effectiveRates(order: Pick<Order, 'fxRateMicros'>, marketRates: FxRates): FxRates {
  return withUsdRate(marketRates, order.fxRateMicros);
}

export function activeLines<T extends { readonly isExcluded?: boolean }>(lines: readonly T[]): T[] {
  return lines.filter((line) => !line.isExcluded);
}

/**
 * All amounts are returned in the order currency. Lines without price count as 0; excluded lines
 * (not sent or swapped) count nowhere, so what is pending to pay follows any change to the order.
 */
export function orderTotals(
  order: OrderMoneyFields,
  lines: readonly LineMoneyFields[],
  marketRates: FxRates,
): OrderTotals {
  const rates = effectiveRates(order, marketRates);
  const shippingRates = amountRates(marketRates, order.shippingSnapshot, order.fxRateMicros);
  const customsRates = amountRates(marketRates, order.customsSnapshot, order.fxRateMicros);
  const lineTotals = activeLines(lines).map(lineTotalCents);
  const excluded = lines.filter((line) => line.isExcluded);
  const goodsCents = lineTotals.reduce<number>((sum, total) => sum + (total ?? 0), 0);
  const pendingPriceCount = lineTotals.filter((total) => total === null).length;
  const shippingCents = convert(order.shippingCents, order.shippingCurrency, order.currency, shippingRates);
  const customsCents = convert(order.customsCents, order.customsCurrency, order.currency, customsRates);

  return {
    goodsCents,
    shippingCents,
    customsCents,
    totalCents: goodsCents + shippingCents + customsCents,
    pendingPriceCount,
    excludedCount: excluded.length,
    excludedCents: excluded.reduce((sum, line) => sum + (lineTotalCents(line) ?? 0), 0),
    rates,
    shippingRates,
    customsRates,
  };
}
