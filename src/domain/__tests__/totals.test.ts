import { lineTotalCents, orderTotals } from '../totals';
import { paidCents, paymentSummary } from '../payments';
import type { Order, Payment } from '../types';

const RATE = 1_100_000; // 1 EUR = 1.10 USD

const baseOrder: Pick<
  Order,
  'currency' | 'shippingCents' | 'shippingCurrency' | 'customsCents' | 'customsCurrency' | 'fxRateMicros'
> = {
  currency: 'EUR',
  shippingCents: 0,
  shippingCurrency: 'EUR',
  customsCents: 0,
  customsCurrency: 'EUR',
  fxRateMicros: null,
};

describe('lineTotalCents', () => {
  it('multiplies quantity by unit price and rounds', () => {
    expect(lineTotalCents({ quantity: 2.5, unitPriceCents: 333 })).toBe(833);
  });

  it('returns null when price is pending', () => {
    expect(lineTotalCents({ quantity: 3, unitPriceCents: null })).toBeNull();
  });
});

describe('orderTotals', () => {
  it('sums goods, shipping and customs in order currency', () => {
    const totals = orderTotals(
      { ...baseOrder, shippingCents: 1100, shippingCurrency: 'USD', customsCents: 500 },
      [
        { quantity: 10, unitPriceCents: 100 },
        { quantity: 2, unitPriceCents: 250 },
      ],
      RATE,
    );
    expect(totals).toEqual({
      goodsCents: 1500,
      shippingCents: 1000,
      customsCents: 500,
      totalCents: 3000,
      pendingPriceCount: 0,
      rateMicros: RATE,
    });
  });

  it('counts lines with pending price', () => {
    const totals = orderTotals(baseOrder, [
      { quantity: 1, unitPriceCents: null },
      { quantity: 1, unitPriceCents: 200 },
    ], RATE);
    expect(totals.pendingPriceCount).toBe(1);
    expect(totals.goodsCents).toBe(200);
  });

  it('prefers the order rate snapshot over the fallback rate', () => {
    const totals = orderTotals(
      { ...baseOrder, fxRateMicros: 1_000_000, customsCents: 700, customsCurrency: 'USD' },
      [],
      RATE,
    );
    expect(totals.customsCents).toBe(700);
    expect(totals.rateMicros).toBe(1_000_000);
  });
});

describe('payments', () => {
  const payment = (amountCents: number, currency: Payment['currency'], fxRateMicros: number | null = null) => ({
    amountCents,
    currency,
    fxRateMicros,
  });

  it('converts each payment with its own rate when present', () => {
    expect(paidCents([payment(1000, 'EUR'), payment(2200, 'USD', 1_100_000)], 'EUR', 2_000_000)).toBe(3000);
  });

  it('uses the fallback rate when the payment has none', () => {
    expect(paidCents([payment(1100, 'USD')], 'EUR', RATE)).toBe(1000);
  });

  it.each([
    [1000, 0, 'sin_pagar', 1000],
    [1000, 400, 'parcial', 600],
    [1000, 999, 'pagado', 0],
    [1000, 1200, 'pagado', 0],
    [0, 0, 'sin_pagar', 0],
  ] as const)('total %p paid %p is %p with %p pending', (total, paid, status, pending) => {
    expect(paymentSummary(total, paid)).toMatchObject({ status, pendingCents: pending });
  });

  it('reports overpayment', () => {
    expect(paymentSummary(1000, 1200).overpaidCents).toBe(200);
  });
});
