import { LATE_ORDER_DAYS, orderOverview } from '../dashboard';
import type { OrderListItem } from '../orderFilters';

const item = (overrides: Partial<OrderListItem>): OrderListItem => ({
  id: 1,
  supplierId: 1,
  supplierName: 'Aceros',
  orderDate: '2026-10-01',
  status: 'confirmado',
  currency: 'EUR',
  paymentStatus: 'sin_pagar',
  totalCents: 1000,
  pendingCents: 0,
  pendingPriceCount: 0,
  lineCount: 1,
  rates: { usdMicros: 1_100_000, inrMicros: 100_000_000 },
  trackingNumber: '',
  searchText: '',
  ...overrides,
});

describe('orderOverview', () => {
  const today = '2026-11-06';
  const items = [
    item({ id: 1, status: 'enviado', orderDate: '2026-09-01', pendingCents: 500 }), // 66 days
    item({ id: 2, status: 'confirmado', orderDate: '2026-10-07' }), // exactly 30 days
    item({ id: 3, status: 'confirmado', orderDate: '2026-10-20', pendingPriceCount: 2 }), // 17 days
    item({ id: 4, status: 'borrador', orderDate: '2026-01-01' }), // drafts are never late
    item({ id: 5, status: 'recibido', orderDate: '2026-01-01', pendingCents: 100 }),
    item({ id: 6, status: 'cancelado', pendingCents: 900, pendingPriceCount: 1 }),
  ];
  const overview = orderOverview(items, today);

  it('counts the orders in every status, in workflow order', () => {
    expect(overview.statusCounts).toEqual([
      { status: 'borrador', count: 1 },
      { status: 'confirmado', count: 2 },
      { status: 'enviado', count: 1 },
      { status: 'recibido', count: 1 },
      { status: 'cancelado', count: 1 },
    ]);
  });

  it(`flags confirmed and shipped orders waiting ${LATE_ORDER_DAYS} days or more, longest first`, () => {
    expect(overview.lateOrders.map((o) => [o.id, o.days])).toEqual([
      [1, 66],
      [2, 30],
    ]);
    expect(overview.lateCount).toBe(2);
  });

  it('limits the late list but keeps the full count', () => {
    const limited = orderOverview(items, today, 1);
    expect(limited.lateOrders).toHaveLength(1);
    expect(limited.lateCount).toBe(2);
  });

  it('counts unpaid orders and orders with lines without price, ignoring cancelled ones', () => {
    expect(overview).toMatchObject({ unpaidCount: 2, missingPriceCount: 1 });
  });
});
