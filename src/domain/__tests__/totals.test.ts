import { lineTotalCents, orderTotals } from '../totals';
import { orderPaidCents, paidCents, paymentSummary } from '../payments';
import type { Order, Payment } from '../types';

const RATE = { usdMicros: 1_100_000, inrMicros: 100_000_000 }; // 1 EUR = 1.10 USD = 100 INR

const baseOrder: Pick<
  Order,
  | 'currency'
  | 'shippingCents'
  | 'shippingCurrency'
  | 'shippingSnapshot'
  | 'customsCents'
  | 'customsCurrency'
  | 'customsSnapshot'
  | 'fxRateMicros'
> = {
  currency: 'EUR',
  shippingCents: 0,
  shippingCurrency: 'EUR',
  shippingSnapshot: null,
  customsCents: 0,
  customsCurrency: 'EUR',
  customsSnapshot: null,
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
      rates: RATE,
      shippingRates: RATE,
      customsRates: RATE,
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
    expect(totals.rates.usdMicros).toBe(1_000_000);
  });
});

describe('rates frozen with each amount', () => {
  it('converts the shipping with the rates it was frozen with', () => {
    const totals = orderTotals(
      {
        ...baseOrder,
        currency: 'USD',
        shippingCents: 1000,
        shippingCurrency: 'EUR',
        shippingSnapshot: { usdMicros: 1_000_000, inrMicros: 100_000_000 },
      },
      [],
      RATE,
    );
    expect(totals.shippingCents).toBe(1000); // 10,00 € a 1,00 US$/€ (el mercado daría 11,00)
    expect(totals.shippingRates.usdMicros).toBe(1_000_000);
  });

  it('converts the customs with their own rates', () => {
    const totals = orderTotals(
      {
        ...baseOrder,
        currency: 'USD',
        customsCents: 500,
        customsCurrency: 'EUR',
        customsSnapshot: { usdMicros: 1_000_000, inrMicros: 100_000_000 },
      },
      [],
      RATE,
    );
    expect(totals.customsCents).toBe(500);
    expect(totals.customsRates.usdMicros).toBe(1_000_000);
  });

  it('does not drift when the market moves', () => {
    const order = {
      ...baseOrder,
      currency: 'USD' as const,
      shippingCents: 1000,
      shippingCurrency: 'EUR' as const,
      shippingSnapshot: { usdMicros: 1_000_000, inrMicros: 100_000_000 },
    };
    expect(orderTotals(order, [], RATE).shippingCents).toBe(1000);
    expect(orderTotals(order, [], { usdMicros: 900_000, inrMicros: 110_000_000 }).shippingCents).toBe(1000);
  });

  it('falls back to the market for amounts saved before the rates were frozen', () => {
    const totals = orderTotals({ ...baseOrder, currency: 'USD', shippingCents: 1000, shippingCurrency: 'EUR' }, [], RATE);
    expect(totals.shippingCents).toBe(1100);
  });

  it('gives the rate fixed for the order priority over the frozen one', () => {
    const totals = orderTotals(
      {
        ...baseOrder,
        currency: 'USD',
        fxRateMicros: 1_000_000,
        shippingCents: 1000,
        shippingCurrency: 'EUR',
        shippingSnapshot: { usdMicros: 1_050_000, inrMicros: 100_000_000 },
      },
      [],
      RATE,
    );
    expect(totals.shippingCents).toBe(1000);
  });
});

describe('payments', () => {
  const payment = (amountCents: number, currency: Payment['currency'], usdMicros: number | null = null) => ({
    amountCents,
    currency,
    snapshot: usdMicros === null ? null : { usdMicros, inrMicros: RATE.inrMicros },
  });

  it('converts each payment with the rate frozen with it when present', () => {
    expect(paidCents([payment(1000, 'EUR'), payment(2200, 'USD', 1_100_000)], 'EUR', { ...RATE, usdMicros: 2_000_000 })).toBe(3000);
  });

  it('uses the fallback rate when the payment has none', () => {
    expect(paidCents([payment(1100, 'USD')], 'EUR', RATE)).toBe(1000);
  });

  it('converts a rupee payment with the rate frozen with it', () => {
    const rupee = { amountCents: 10_000, currency: 'INR' as const, snapshot: { usdMicros: null, inrMicros: 95_000_000 } };
    expect(paidCents([rupee], 'EUR', RATE)).toBe(105); // 100,00 ₹ a 95 ₹/€
  });

  it.each([
    [1000, 0, 'sin_pagar', 1000],
    [1000, 400, 'parcial', 600],
    [1000, 999, 'pagado', 0],
    [1000, 1200, 'pagado', 0],
    [0, 0, 'sin_pagar', 0],
    [0, 500, 'pagado', 0],
  ] as const)('total %p paid %p is %p with %p pending', (total, paid, status, pending) => {
    expect(paymentSummary(total, paid)).toMatchObject({ status, pendingCents: pending });
  });

  it('reports overpayment', () => {
    expect(paymentSummary(1000, 1200).overpaidCents).toBe(200);
  });
});

describe('customs count as paid', () => {
  it('adds the customs of the order (already paid when entered) to the payments', () => {
    const payments = [{ amountCents: 1000, currency: 'EUR' as const, snapshot: null }];
    expect(orderPaidCents(payments, 'EUR', RATE, 700)).toBe(1700);
    expect(orderPaidCents([], 'EUR', RATE, 0)).toBe(0);
  });
});
