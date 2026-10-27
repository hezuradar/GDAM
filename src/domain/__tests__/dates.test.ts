import { daysBetween, orderDuration } from '../dates';

describe('daysBetween', () => {
  it('counts calendar days between two dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-27')).toBe(26);
  });

  it('is zero for the same day', () => {
    expect(daysBetween('2026-10-27', '2026-10-27')).toBe(0);
  });

  it('ignores daylight-saving changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-10-27', '2026-10-25')).toBe(-2);
  });
});

describe('orderDuration', () => {
  const today = '2026-10-27';

  it('returns the days a received order took to arrive', () => {
    const order = { orderDate: '2026-09-01', status: 'recibido', receivedDate: '2026-10-05' };
    expect(orderDuration(order, today)).toEqual({ kind: 'completed', days: 34 });
  });

  it('returns the days an open order has been waiting', () => {
    const order = { orderDate: '2026-10-20', status: 'enviado', receivedDate: null };
    expect(orderDuration(order, today)).toEqual({ kind: 'open', days: 7 });
  });

  it('never returns negative days for future order dates', () => {
    const order = { orderDate: '2026-11-02', status: 'borrador', receivedDate: null };
    expect(orderDuration(order, today)).toEqual({ kind: 'open', days: 0 });
  });

  it('has no duration for cancelled orders', () => {
    expect(orderDuration({ orderDate: '2026-10-01', status: 'cancelado', receivedDate: null }, today)).toBeNull();
  });

  it('has no duration for received orders without a reception date', () => {
    expect(orderDuration({ orderDate: '2026-10-01', status: 'recibido', receivedDate: null }, today)).toBeNull();
  });

  it('has no duration when the order date is invalid', () => {
    expect(orderDuration({ orderDate: 'ayer', status: 'enviado', receivedDate: null }, today)).toBeNull();
  });
});
