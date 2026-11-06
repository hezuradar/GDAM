import { overheadStats, priceChanges, priceHistory, productKey, warehouseStats } from '../inventory';
import { computeProductCosts, type ProductSource } from '../landedCost';

const RATES = { usdMicros: 1_100_000, inrMicros: 100_000_000 }; // 1 EUR = 1.10 USD = 100 INR

const product = (overrides: Partial<ProductSource>): ProductSource => ({
  lineId: 1,
  orderId: 1,
  orderDate: '2026-10-01',
  orderStatus: 'recibido',
  supplierName: 'Aceros',
  quantity: 10,
  receivedQuantity: null,
  pieceType: 'pieza',
  measurements: '',
  unitPriceCents: 100,
  currency: 'EUR',
  shippingCents: 0,
  shippingCurrency: 'EUR',
  shippingSnapshot: null,
  customsCents: 0,
  customsCurrency: 'EUR',
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

describe('productKey', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(productKey({ pieceType: '  Nácar ', measurements: 'M8   x 40' })).toBe(productKey({ pieceType: 'nacar', measurements: 'm8 x 40' }));
  });
});

describe('warehouseStats', () => {
  const costs = computeProductCosts(
    [
      // 10 ordered, 8 arrived; 1,00 + 0,10 of shipping = 1,10 each
      product({ lineId: 1, orderId: 1, pieceType: 'nácar', receivedQuantity: 8, shippingCents: 100, salePriceCents: 200, saleCurrency: 'EUR' }),
      product({ lineId: 2, orderId: 2, orderStatus: 'enviado', quantity: 5, unitPriceCents: 300 }),
      product({ lineId: 3, orderId: 3, orderStatus: 'borrador', unitPriceCents: 999 }),
      product({ lineId: 4, orderId: 4, quantity: 4, unitPriceCents: null }),
      product({ lineId: 5, orderId: 5, orderStatus: 'confirmado', quantity: 2, unitPriceCents: 50 }),
      product({ lineId: 6, orderId: 6, receivedQuantity: 0 }),
    ],
    RATES,
  );
  const stats = warehouseStats(costs, 'EUR');

  it('values the received pieces at landed cost and what they would sell for', () => {
    expect(stats).toMatchObject({ stockCents: 880, stockPieces: 8, stockSaleCents: 1600, stockSaleCostCents: 880 });
  });

  it('keeps confirmed and shipped orders apart as in transit, and skips drafts', () => {
    expect(stats).toMatchObject({ transitCents: 1600, transitPieces: 7 });
  });

  it('counts the pieces whose cost is unknown and ranks the stock by value', () => {
    expect(stats.unknownCostPieces).toBe(4);
    expect(stats.topByValue.map((i) => [i.label, i.pieces, i.valueCents])).toEqual([['nácar', 8, 880]]);
  });

  it('converts to the display currency', () => {
    expect(warehouseStats(costs, 'USD').stockCents).toBe(968);
  });
});

describe('overheadStats', () => {
  const costs = computeProductCosts(
    [
      // Order 1: 4 € of shipping shared by value → 0,10 and 0,30 per unit.
      product({ lineId: 1, orderId: 1, pieceType: 'A', unitPriceCents: 100, shippingCents: 400 }),
      product({ lineId: 2, orderId: 1, pieceType: 'B', unitPriceCents: 300, shippingCents: 400 }),
      // Order 2: 4 € of customs for 2 pieces, plus 0,50 of handling each.
      product({
        lineId: 3,
        orderId: 2,
        supplierName: 'Bronces',
        pieceType: 'C',
        quantity: 2,
        unitPriceCents: 1000,
        customsCents: 400,
        handlingCostCents: 50,
        handlingCurrency: 'EUR',
      }),
      product({ lineId: 4, orderId: 3, supplierName: 'Bronces', unitPriceCents: null }),
    ],
    RATES,
  );
  const stats = overheadStats(costs, 'EUR');

  it('splits the final cost into supplier price, shipping and customs, and handling', () => {
    expect(stats).toMatchObject({
      goodsCents: 6000,
      shippingCustomsCents: 800,
      handlingCents: 100,
      landedCents: 6900,
      shippingCustomsBp: 1333,
      totalOverheadBp: 1500,
    });
  });

  it('compares suppliers by what shipping and customs add over the goods', () => {
    expect(stats.bySupplier.map((s) => [s.label, s.overheadBp])).toEqual([
      ['Bronces', 2000],
      ['Aceros', 1000],
    ]);
  });

  it('ranks products by how much the final cost exceeds the supplier price', () => {
    expect(stats.topProducts.map((p) => [p.label, p.supplierUnitCents, p.landedUnitCents, p.overheadBp])).toEqual([
      ['C', 1000, 1250, 2500],
      ['A', 100, 110, 1000],
      ['B', 300, 330, 1000],
    ]);
  });

  it('has no percentages without priced goods', () => {
    expect(overheadStats([], 'EUR')).toMatchObject({ goodsCents: 0, shippingCustomsBp: null, totalOverheadBp: null, bySupplier: [] });
  });
});

describe('price history', () => {
  const costs = computeProductCosts(
    [
      product({ lineId: 1, orderId: 1, orderDate: '2026-01-10', pieceType: 'Tornillo', measurements: 'M8', unitPriceCents: 100 }),
      product({ lineId: 2, orderId: 2, orderDate: '2026-03-01', pieceType: 'tornillo ', measurements: 'm8', unitPriceCents: 120 }),
      // A replacement at 0 is not a price.
      product({ lineId: 3, orderId: 3, orderDate: '2026-02-01', pieceType: 'Tornillo', measurements: 'M8', unitPriceCents: 0 }),
      // 1,10 US$ = 1,00 €
      product({ lineId: 4, orderId: 4, orderDate: '2026-05-01', pieceType: 'Tornillo', measurements: 'M8', unitPriceCents: 110, currency: 'USD' }),
      product({ lineId: 5, orderId: 5, orderDate: '2026-01-01', pieceType: 'arandela', unitPriceCents: 100 }),
      product({ lineId: 6, orderId: 6, orderDate: '2026-02-01', pieceType: 'arandela', unitPriceCents: 150 }),
      product({ lineId: 7, orderId: 7, pieceType: 'tuerca' }),
      product({ lineId: 8, orderId: 8, orderDate: '2026-01-01', pieceType: 'clavo' }),
      product({ lineId: 9, orderId: 9, orderDate: '2026-02-01', pieceType: 'clavo' }),
    ],
    RATES,
  );

  it('lists every priced purchase of the same product, oldest first, with the change from the one before', () => {
    const history = priceHistory(costs, 2, 'EUR');
    expect(history.map((p) => [p.orderId, p.unitPriceCents, p.changeBp])).toEqual([
      [1, 100, null],
      [2, 120, 2000],
      [4, 100, -1667],
    ]);
    expect(history[0].landedUnitCents).toBe(100);
  });

  it('is empty for an unknown line', () => {
    expect(priceHistory(costs, 999, 'EUR')).toEqual([]);
  });

  it('collects the products whose last price went up or down', () => {
    const changes = priceChanges(costs, 'EUR');
    expect(changes.rises.map((c) => [c.label, c.previousCents, c.latestCents, c.changeBp, c.purchases])).toEqual([['arandela', 100, 150, 5000, 2]]);
    expect(changes.drops.map((c) => [c.label, c.previousCents, c.latestCents, c.changeBp, c.lineId])).toEqual([['Tornillo M8', 120, 100, -1667, 4]]);
  });

  it('counts every change even when the lists are limited', () => {
    expect(priceChanges(costs, 'EUR', 0)).toMatchObject({ rises: [], drops: [], riseCount: 1, dropCount: 1 });
  });
});
