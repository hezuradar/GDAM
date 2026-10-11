import { filterOrders, foldText, type OrderListItem } from '../orderFilters';

const item = (overrides: Partial<OrderListItem>): OrderListItem => ({
  id: 1,
  supplierId: 1,
  supplierName: 'Aceros Shenzhen',
  orderDate: '2026-10-01',
  status: 'confirmado',
  currency: 'USD',
  paymentStatus: 'sin_pagar',
  totalCents: 1000,
  pendingCents: 1000,
  pendingPriceCount: 0,
  lineCount: 1,
  rates: { usdMicros: 1_100_000, inrMicros: 100_000_000 },
  trackingNumber: '',
  searchText: '',
  ...overrides,
});

const items: readonly OrderListItem[] = [
  item({ id: 1, orderDate: '2026-09-01', searchText: 'tornillo m8x40' }),
  item({ id: 2, supplierId: 2, supplierName: 'Tubos Ningbo', orderDate: '2026-10-05', status: 'enviado', currency: 'EUR', paymentStatus: 'parcial', pendingCents: 300, trackingNumber: 'SF123456', searchText: 'tubo inoxidable' }),
  item({ id: 3, orderDate: '2026-08-15', status: 'recibido', paymentStatus: 'pagado', pendingCents: 0, searchText: 'brida DN50' }),
];

describe('foldText', () => {
  it('removes accents and lowercases', () => {
    expect(foldText('Inoxidáble ÑU')).toBe('inoxidable nu');
  });
});

describe('filterOrders', () => {
  it('sorts by date descending by default', () => {
    expect(filterOrders(items, {}).map((o) => o.id)).toEqual([2, 1, 3]);
  });

  it('sorts by date ascending', () => {
    expect(filterOrders(items, { sort: 'fecha_asc' }).map((o) => o.id)).toEqual([3, 1, 2]);
  });

  it('sorts by pending amount', () => {
    expect(filterOrders(items, { sort: 'pendiente_desc' }).map((o) => o.id)).toEqual([1, 2, 3]);
  });

  it('filters by supplier, status, payment status and currency', () => {
    expect(filterOrders(items, { supplierId: 1 }).map((o) => o.id)).toEqual([1, 3]);
    expect(filterOrders(items, { statuses: ['enviado', 'recibido'] }).map((o) => o.id)).toEqual([2, 3]);
    expect(filterOrders(items, { paymentStatuses: ['pagado'] }).map((o) => o.id)).toEqual([3]);
    expect(filterOrders(items, { currency: 'EUR' }).map((o) => o.id)).toEqual([2]);
  });

  it('searches accent-insensitively across tracking, supplier and products', () => {
    expect(filterOrders(items, { query: 'INOXIDÁBLE' }).map((o) => o.id)).toEqual([2]);
    expect(filterOrders(items, { query: 'sf123' }).map((o) => o.id)).toEqual([2]);
    expect(filterOrders(items, { query: 'ningbo' }).map((o) => o.id)).toEqual([2]);
    expect(filterOrders(items, { query: 'dn50' }).map((o) => o.id)).toEqual([3]);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    filterOrders(items, { sort: 'fecha_asc' });
    expect(items).toEqual(copy);
  });
});
