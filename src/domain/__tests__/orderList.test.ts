import { buildOrderListItems } from '../orderList';
import { isValidIsoDate, todayIso } from '../dates';
import type { Order } from '../types';

const order = (overrides: Partial<Order>): Order => ({
  id: 1,
  supplierId: 1,
  orderDate: '2026-10-01',
  status: 'confirmado',
  currency: 'EUR',
  shippingCents: 0,
  shippingCurrency: 'EUR',
  customsCents: 0,
  customsCurrency: 'EUR',
  fxRateMicros: null,
  carrier: 'DHL',
  trackingNumber: 'JD1',
  notes: 'urgente',
  ...overrides,
});

describe('buildOrderListItems', () => {
  it('computes totals, payment status and search text per order', () => {
    const items = buildOrderListItems({
      orders: [order({ id: 1, shippingCents: 500 }), order({ id: 2, supplierId: 2 })],
      lines: [
        { orderId: 1, quantity: 2, unitPriceCents: 1000, pieceType: 'tubo', measurements: '25x2' },
        { orderId: 1, quantity: 1, unitPriceCents: null, pieceType: 'brida', measurements: 'DN50' },
      ],
      payments: [{ orderId: 1, amountCents: 1000, currency: 'EUR', fxRateMicros: null }],
      supplierNames: new Map([[1, 'Aceros'], [2, 'Tubos']]),
      marketRates: { usdMicros: 1_080_000, inrMicros: 100_000_000 },
    });

    expect(items[0]).toMatchObject({
      id: 1,
      supplierName: 'Aceros',
      totalCents: 2500,
      pendingCents: 1500,
      paymentStatus: 'parcial',
      pendingPriceCount: 1,
      lineCount: 2,
      rates: { usdMicros: 1_080_000, inrMicros: 100_000_000 },
    });
    expect(items[0].searchText).toContain('brida DN50');
    expect(items[0].searchText).toContain('urgente');
    expect(items[1]).toMatchObject({ id: 2, supplierName: 'Tubos', totalCents: 0, paymentStatus: 'sin_pagar', lineCount: 0 });
  });

  it('uses a placeholder for unknown suppliers', () => {
    const [item] = buildOrderListItems({
      orders: [order({ supplierId: 99 })],
      lines: [],
      payments: [],
      supplierNames: new Map(),
      marketRates: { usdMicros: 1_000_000, inrMicros: 100_000_000 },
    });
    expect(item.supplierName).toBe('Proveedor desconocido');
  });
});

describe('dates', () => {
  it('formats today as ISO date in local time', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('validates ISO dates', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('28/02/2026')).toBe(false);
  });
});
