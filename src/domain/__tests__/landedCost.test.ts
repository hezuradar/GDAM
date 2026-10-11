import {
  computeProductCosts,
  formatMargin,
  marginFromSalePrice,
  productSaleInfo,
  salePriceFromMargin,
  type ProductSource,
} from '../landedCost';

const RATE = 1_100_000; // 1 EUR = 1.10 USD

const row = (overrides: Partial<ProductSource>): ProductSource => ({
  lineId: 1,
  orderId: 1,
  orderDate: '2026-10-01',
  supplierName: 'Aceros',
  quantity: 10,
  pieceType: 'tornillo',
  measurements: 'M8',
  unitPriceCents: 100,
  currency: 'USD',
  shippingCents: 0,
  shippingCurrency: 'USD',
  customsCents: 0,
  customsCurrency: 'USD',
  fxRateMicros: null,
  salePriceCents: null,
  saleCurrency: null,
  marginBp: null,
  ...overrides,
});

describe('computeProductCosts', () => {
  it('allocates shipping and customs in proportion to each line value', () => {
    const order = { shippingCents: 1000, customsCents: 500 }; // 15,00 US$ extra
    const [a, b] = computeProductCosts(
      [
        row({ lineId: 1, quantity: 10, unitPriceCents: 100, ...order }), // 10,00 → 1/3
        row({ lineId: 2, quantity: 4, unitPriceCents: 500, ...order }), // 20,00 → 2/3
      ],
      RATE,
    );
    expect(a).toMatchObject({ allocatedPerUnitCents: 50, landedUnitCents: 150 }); // 5,00 / 10 uds
    expect(b).toMatchObject({ allocatedPerUnitCents: 250, landedUnitCents: 750 }); // 10,00 / 4 uds
  });

  it('converts shipping and customs to the order currency first', () => {
    const [line] = computeProductCosts([row({ shippingCents: 1000, shippingCurrency: 'EUR' })], RATE);
    expect(line).toMatchObject({ allocatedPerUnitCents: 110, landedUnitCents: 210 }); // 10 € = 11 US$ / 10 uds
  });

  it('leaves lines without price out of the allocation', () => {
    const [priced, pending] = computeProductCosts(
      [row({ lineId: 1, shippingCents: 300 }), row({ lineId: 2, unitPriceCents: null, shippingCents: 300 })],
      RATE,
    );
    expect(priced.landedUnitCents).toBe(130);
    expect(pending).toMatchObject({ allocatedPerUnitCents: null, landedUnitCents: null });
  });

  it('keeps orders separate', () => {
    const rows = computeProductCosts([row({ orderId: 1, shippingCents: 1000 }), row({ lineId: 2, orderId: 2 })], RATE);
    expect(rows.map((r) => r.landedUnitCents)).toEqual([200, 100]);
  });
});

describe('formatMargin', () => {
  it('formats basis points as a Spanish percentage', () => {
    expect(formatMargin(2500)).toBe('25 %');
    expect(formatMargin(1250)).toBe('12,5 %');
  });
});

describe('sale price and margin (markup over cost)', () => {
  it('computes the sale price from a margin', () => {
    expect(salePriceFromMargin(1000, 2500)).toBe(1250); // +25 %
  });
  it('computes the margin from a sale price', () => {
    expect(marginFromSalePrice(1000, 1250)).toBe(2500);
    expect(marginFromSalePrice(0, 1250)).toBeNull();
  });

  it('shows sale info in the display currency from a stored sale price', () => {
    const [p] = computeProductCosts([row({ salePriceCents: 330, saleCurrency: 'USD' })], RATE);
    expect(productSaleInfo(p, 'EUR')).toEqual({ currency: 'EUR', landedUnitCents: 91, salePriceCents: 300, marginBp: 22967 });
  });

  it('derives the sale price from a stored margin', () => {
    const [p] = computeProductCosts([row({ marginBp: 5000 })], RATE);
    expect(productSaleInfo(p, 'USD')).toEqual({ currency: 'USD', landedUnitCents: 100, salePriceCents: 150, marginBp: 5000 });
  });

  it('returns nulls when nothing is set or the cost is unknown', () => {
    const [p] = computeProductCosts([row({ unitPriceCents: null, marginBp: 5000 })], RATE);
    expect(productSaleInfo(p, 'EUR')).toEqual({ currency: 'EUR', landedUnitCents: null, salePriceCents: null, marginBp: 5000 });
  });
});
