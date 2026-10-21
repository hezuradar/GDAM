import {
  computeProductCosts,
  formatMargin,
  marginFromSalePrice,
  previewLandedCost,
  productSaleInfo,
  salePriceFromMargin,
  type ProductSource,
} from '../landedCost';

const RATE = { usdMicros: 1_100_000, inrMicros: 100_000_000 }; // 1 EUR = 1.10 USD = 100 INR

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
  shippingSnapshot: null,
  customsCents: 0,
  customsCurrency: 'USD',
  customsSnapshot: null,
  fxRateMicros: null,
  salePriceCents: null,
  saleCurrency: null,
  saleSnapshot: null,
  marginBp: null,
  theoreticalCostCents: null,
  theoreticalCurrency: null,
  theoreticalSnapshot: null,
  handlingCostCents: null,
  handlingCurrency: null,
  handlingSnapshot: null,
  ...overrides,
});

describe('theoretical cost for zero-price replacements', () => {
  it('uses the theoretical value (converted) and gives the replacement its share of shipping by that value', () => {
    // valores: pagada 10 × 1,00 = 10,00 US$; reposición 10 × 2,20 (200 €) = 22,00 US$ → envío 5,00 repartido 10/32 y 22/32
    const [paid, replacement] = computeProductCosts(
      [
        row({ lineId: 1, unitPriceCents: 100, shippingCents: 500 }),
        row({ lineId: 2, unitPriceCents: 0, shippingCents: 500, theoreticalCostCents: 200, theoreticalCurrency: 'EUR' }),
      ],
      RATE,
    );
    expect(paid).toMatchObject({ allocatedPerUnitCents: 16, landedUnitCents: 116, usesTheoreticalCost: false });
    expect(replacement).toMatchObject({ unitPriceCents: 0, allocatedPerUnitCents: 34, landedUnitCents: 254, usesTheoreticalCost: true });
  });

  it('gives no shipping to a replacement until it has a theoretical value', () => {
    const [paid, replacement] = computeProductCosts(
      [row({ lineId: 1, unitPriceCents: 100, shippingCents: 500 }), row({ lineId: 2, unitPriceCents: 0, shippingCents: 500 })],
      RATE,
    );
    expect(paid).toMatchObject({ allocatedPerUnitCents: 50, landedUnitCents: 150 });
    expect(replacement).toMatchObject({ allocatedPerUnitCents: 0, landedUnitCents: 0 });
  });

  it('previews the landed cost of a line with a theoretical value being typed', () => {
    const rows = [
      row({ lineId: 1, unitPriceCents: 100, shippingCents: 500 }),
      row({ lineId: 2, unitPriceCents: 0, shippingCents: 500 }),
    ];
    expect(previewLandedCost(rows, RATE, 2, { theoreticalCents: 220, currency: 'USD' }, 'USD')).toBe(254);
    expect(previewLandedCost(rows, RATE, 2, { theoreticalCents: 200, currency: 'EUR' }, 'EUR')).toBe(231); // 254 US$ → 2,31 €
    expect(previewLandedCost(rows, RATE, 2, { theoreticalCents: null, currency: 'USD' }, 'USD')).toBe(0);
    expect(previewLandedCost(rows, RATE, 99, { theoreticalCents: 100, currency: 'USD' }, 'USD')).toBeNull();
  });

  it('also covers lines with a pending price', () => {
    const [line] = computeProductCosts([row({ unitPriceCents: null, theoreticalCostCents: 300, theoreticalCurrency: 'USD' })], RATE);
    expect(line).toMatchObject({ landedUnitCents: 300, usesTheoreticalCost: true });
  });

  it('ignores the theoretical value when the line has a real price', () => {
    const [line] = computeProductCosts([row({ unitPriceCents: 100, theoreticalCostCents: 999, theoreticalCurrency: 'USD' })], RATE);
    expect(line).toMatchObject({ landedUnitCents: 100, usesTheoreticalCost: false });
  });

  it('treats a zero-price line without theoretical value as zero cost', () => {
    const [line] = computeProductCosts([row({ unitPriceCents: 0 })], RATE);
    expect(line).toMatchObject({ landedUnitCents: 0, usesTheoreticalCost: false });
  });
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

describe('rates frozen with each amount', () => {
  const frozen = { usdMicros: 1_000_000, inrMicros: 100_000_000 }; // 1 € = 1 US$ (el mercado da 1,10)

  it('converts the theoretical value with the rates it was frozen with', () => {
    const [line] = computeProductCosts(
      [row({ unitPriceCents: 0, theoreticalCostCents: 200, theoreticalCurrency: 'EUR', theoreticalSnapshot: frozen })],
      RATE,
    );
    expect(line.landedUnitCents).toBe(200); // 2,00 € a 1,00 US$/€ (el mercado daría 2,20)
  });

  it('converts the handling cost with the rates it was frozen with', () => {
    const [line] = computeProductCosts([row({ handlingCostCents: 100, handlingCurrency: 'EUR', handlingSnapshot: frozen })], RATE);
    expect(line).toMatchObject({ handlingPerUnitCents: 100, landedUnitCents: 200 });
  });

  it('converts the sale price with the rates it was frozen with', () => {
    const [p] = computeProductCosts([row({ salePriceCents: 330, saleCurrency: 'EUR', saleSnapshot: frozen })], RATE);
    expect(productSaleInfo(p, 'USD').salePriceCents).toBe(330); // 3,30 € a 1,00 US$/€
  });

  it('does not drift when the market moves', () => {
    const rows = [row({ handlingCostCents: 100, handlingCurrency: 'EUR', handlingSnapshot: frozen })];
    expect(computeProductCosts(rows, RATE)[0].handlingPerUnitCents).toBe(100);
    expect(computeProductCosts(rows, { usdMicros: 900_000, inrMicros: 110_000_000 })[0].handlingPerUnitCents).toBe(100);
  });
});

describe('handling cost before selling', () => {
  it('adds the handling cost per unit (converted) to the landed cost without changing the shipping share', () => {
    const [line] = computeProductCosts([row({ shippingCents: 500, handlingCostCents: 100, handlingCurrency: 'EUR' })], RATE);
    // 1,00 US$ + 0,50 US$ de envío por unidad + 1,10 US$ (1,00 €) de manipulación
    expect(line).toMatchObject({ allocatedPerUnitCents: 50, handlingPerUnitCents: 110, landedUnitCents: 260 });
  });

  it('counts no handling when none is set', () => {
    const [line] = computeProductCosts([row({})], RATE);
    expect(line).toMatchObject({ handlingPerUnitCents: 0, landedUnitCents: 100 });
  });

  it('adds handling to a replacement with a theoretical value', () => {
    const [line] = computeProductCosts(
      [row({ unitPriceCents: 0, theoreticalCostCents: 300, theoreticalCurrency: 'USD', handlingCostCents: 50, handlingCurrency: 'USD' })],
      RATE,
    );
    expect(line.landedUnitCents).toBe(350);
  });

  it('previews the landed cost with the handling being typed', () => {
    const rows = [row({ lineId: 1, shippingCents: 500 })];
    expect(previewLandedCost(rows, RATE, 1, { handlingCents: 40, currency: 'USD' }, 'USD')).toBe(190);
    expect(previewLandedCost(rows, RATE, 1, { handlingCents: null, currency: 'USD' }, 'USD')).toBe(150);
  });
});
