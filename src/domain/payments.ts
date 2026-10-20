import { convert, withUsdRate, type FxRates } from './money';
import type { Currency, Payment, PaymentStatus } from './types';

/** Differences of up to 1 cent (rounding after conversions) count as fully paid. */
const PAID_TOLERANCE_CENTS = 1;

export type PaymentMoneyFields = Pick<Payment, 'amountCents' | 'currency' | 'fxRateMicros'>;

export interface PaymentSummary {
  readonly status: PaymentStatus;
  readonly paidCents: number;
  readonly pendingCents: number;
  readonly overpaidCents: number;
}

/** Sum of payments in the order currency, each converted at its own rate when it has one. */
export function paidCents(
  payments: readonly PaymentMoneyFields[],
  orderCurrency: Currency,
  orderRates: FxRates,
): number {
  return payments.reduce(
    (sum, p) => sum + convert(p.amountCents, p.currency, orderCurrency, withUsdRate(orderRates, p.fxRateMicros)),
    0,
  );
}

/**
 * What has been paid for an order, in its currency: the payments plus the customs, which are paid
 * (to the carrier or the customs office) when they are entered. Derived on every read, so it follows
 * any later change to the customs amount.
 */
export function orderPaidCents(
  payments: readonly PaymentMoneyFields[],
  orderCurrency: Currency,
  orderRates: FxRates,
  customsCents: number,
): number {
  return paidCents(payments, orderCurrency, orderRates) + customsCents;
}

export function paymentSummary(totalCents: number, paid: number): PaymentSummary {
  const diff = totalCents - paid;
  // A zero-total order with payments is overpaid, not "parcial" with 0 pending.
  const isPaid = diff <= PAID_TOLERANCE_CENTS;
  const status: PaymentStatus = paid <= 0 ? 'sin_pagar' : isPaid ? 'pagado' : 'parcial';
  return {
    status,
    paidCents: paid,
    pendingCents: isPaid ? 0 : Math.max(0, diff),
    overpaidCents: Math.max(0, -diff),
  };
}
