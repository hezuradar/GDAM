import { computeProductCosts, type ProductSource } from '../landedCost';
import { profitStats, spendStats, type SpendSource } from '../stats';
import type { Order } from '../types';

const RATES = { usdMicros: 1_100_000, inrMicros: 100_000_000 }; // 1 € = 1,10 US$ = 100 ₹

const order = (overrides: Partial<Order>): Order => ({
  id: 1,
  supplierId: 1,
  orderDate: '2026-10-05',
  status: 'confirmado',
  currency: 'EUR',
  shippingCents: 0,
  shippingCurrency: 'EUR',
  customsCents: 0,
  customsCurrency: 'EUR',
  fxRateMicros: null,
  carrier: '',
  trackingNumber: '',
  notes: '',
  ...overrides,
});

const source = (overrides: Partial<SpendSource> = {}): SpendSource => ({
  orders: [
    order({ id: 1, shippingCents: 1000, customsCents: 500 }),
    order({ id: 2, supplierId: 2, orderDate: '2026-09-20', currency: 'USD', shippingCurrency: 'USD', customsCurrency: 'USD' }),
    order({ id: 3, status: 'cancelado' }),
  ],
  lines: [
    { orderId: 1, quantity: 10, unitPriceCents: 100, pieceType: 'nácar', measurements: '' },
    { orderId: 1, quantity: 5, unitPriceCents: null, pieceType: 'asta', measurements: '' },
    { orderId: 2, quantity: 20, unitPriceCents: 110, pieceType: 'búfalo', measurements: '' },
    { orderId: 3, quantity: 99, unitPriceCents: 999, pieceType: 'cancelado', measurements: '' },
  ],
  payments: [
    { orderId: 1, amountCents: 1000, currency: 'EUR', fxRateMicros: null },
    { orderId: 2, amountCents: 2200, currency: 'USD', fxRateMicros: null },
  ],
  suppliers: [
    { id: 1, name: 'Aceros', whatsapp: '', notes: '' },
    { id: 2, name: 'Tubos', whatsapp: '', notes: '' },
  ],
  marketRates: RATES,
  ...overrides,
});

describe('spendStats', () => {
  const now = new Date('2026-10-11T12:00:00Z');

  it('adds up spending in the display currency, leaving cancelled orders out', () => {
    const stats = spendStats(source(), 'EUR', now);
    expect(stats).toMatchObject({
      orderCount: 2,
      goodsCents: 3000, // 10,00 € + 22,00 US$ (= 20,00 €)
      shippingCents: 1000,
      customsCents: 500,
      totalCents: 4500,
      paidCents: 3500, // pagos 30,00 € + aduanas 5,00 € (pagadas al introducirlas)
      pendingCents: 1000,
      pieces: 35,
      pendingPriceLines: 1,
    });
  });

  it('computes the average cost per priced piece', () => {
    expect(spendStats(source(), 'EUR', now).avgPieceCostCents).toBe(100); // 30,00 € / 30 piezas con precio
  });

  it('groups spending by supplier, largest first', () => {
    expect(spendStats(source(), 'EUR', now).bySupplier).toEqual([
      { key: '1', label: 'Aceros', cents: 2500 },
      { key: '2', label: 'Tubos', cents: 2000 },
    ]);
  });

  it('groups spending by month for the last months, oldest first', () => {
    const byMonth = spendStats(source(), 'EUR', now, 3).byMonth;
    expect(byMonth).toEqual([
      { key: '2026-08', label: 'ago 26', cents: 0 },
      { key: '2026-09', label: 'sep 26', cents: 2000 },
      { key: '2026-10', label: 'oct 26', cents: 2500 },
    ]);
  });

  it('converts to another display currency', () => {
    expect(spendStats(source(), 'USD', now).totalCents).toBe(4950);
  });

  it('returns zeros without orders', () => {
    const stats = spendStats(source({ orders: [] }), 'EUR', now);
    expect(stats).toMatchObject({ orderCount: 0, totalCents: 0, avgPieceCostCents: null, bySupplier: [] });
  });
});

const product = (overrides: Partial<ProductSource>): ProductSource => ({
  lineId: 1,
  orderId: 1,
  orderDate: '2026-10-01',
  supplierName: 'Aceros',
  quantity: 10,
  pieceType: 'pieza',
  measurements: '',
  unitPriceCents: 100,
  currency: 'EUR',
  shippingCents: 0,
  shippingCurrency: 'EUR',
  customsCents: 0,
  customsCurrency: 'EUR',
  fxRateMicros: null,
  salePriceCents: null,
  saleCurrency: null,
  marginBp: null,
  theoreticalCostCents: null,
  theoreticalCurrency: null,
  handlingCostCents: null,
  handlingCurrency: null,
  ...overrides,
});

describe('profitStats', () => {
  const products = computeProductCosts(
    [
      product({ lineId: 1, orderId: 1, pieceType: 'nácar', marginBp: 5000 }), // 10 × (1,00 → 1,50)
      product({ lineId: 2, orderId: 2, pieceType: 'búfalo', quantity: 2, unitPriceCents: 1000, salePriceCents: 1200, saleCurrency: 'EUR' }),
      product({ lineId: 3, orderId: 3, pieceType: 'asta', unitPriceCents: 400, salePriceCents: 300, saleCurrency: 'EUR' }),
      product({ lineId: 4, orderId: 4, pieceType: 'sin venta', unitPriceCents: 250 }),
      product({ lineId: 5, orderId: 5, pieceType: 'sin coste', unitPriceCents: null }),
    ],
    RATES,
  );
  const stats = profitStats(products, 'EUR');

  it('counts products by pricing state', () => {
    expect(stats).toMatchObject({ productCount: 5, withSaleCount: 3, withoutSaleCount: 1, withoutCostCount: 1 });
  });

  it('adds up cost, sale and profit of the products with a sale price', () => {
    // coste 10 + 20 + 40 = 70 €; venta 15 + 24 + 30 = 69 €
    expect(stats).toMatchObject({ costCents: 7000, saleCents: 6900, profitCents: -100, marginBp: -143 });
  });

  it('ranks products by margin and by total profit', () => {
    expect(stats.topByMargin.map((p) => p.label)).toEqual(['nácar', 'búfalo', 'asta']);
    expect(stats.topByProfit.map((p) => [p.label, p.totalProfitCents])).toEqual([
      ['nácar', 500],
      ['búfalo', 400],
      ['asta', -1000],
    ]);
  });

  it('lists the most expensive unit costs and the products sold at a loss', () => {
    expect(stats.topByUnitCost.map((p) => [p.label, p.unitCostCents])).toEqual([
      ['búfalo', 1000],
      ['asta', 400],
      ['sin venta', 250],
      ['nácar', 100],
    ]);
    expect(stats.negativeMargin.map((p) => p.label)).toEqual(['asta']);
  });

  it('limits the rankings', () => {
    expect(profitStats(products, 'EUR', 1).topByMargin).toHaveLength(1);
  });

  it('has no average margin without products for sale', () => {
    expect(profitStats([], 'EUR').marginBp).toBeNull();
  });
});

describe('profitStats with handling cost', () => {
  it('includes the handling cost in the cost and profit', () => {
    const products = computeProductCosts(
      [product({ quantity: 10, unitPriceCents: 100, handlingCostCents: 50, handlingCurrency: 'EUR', salePriceCents: 200, saleCurrency: 'EUR' })],
      RATES,
    );
    expect(profitStats(products, 'EUR')).toMatchObject({ costCents: 1500, saleCents: 2000, profitCents: 500 });
  });
});
