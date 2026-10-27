const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidIsoDate(text: string): boolean {
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isoToDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return isValidIsoDate(iso) ? new Date(year, month - 1, day) : new Date();
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from one YYYY-MM-DD date to another (negative if `to` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  // UTC avoids the 23/25-hour days around daylight-saving changes.
  const utc = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(toIso) - utc(fromIso)) / DAY_MS);
}

export type OrderDuration =
  | { readonly kind: 'completed'; readonly days: number }
  | { readonly kind: 'open'; readonly days: number };

/**
 * How long a received order took to arrive, or how long an open one has been waiting.
 * Cancelled orders, and received ones without a reception date, have no duration.
 */
export function orderDuration(
  order: { readonly orderDate: string; readonly status: string; readonly receivedDate: string | null },
  today: string = todayIso(),
): OrderDuration | null {
  if (!isValidIsoDate(order.orderDate) || order.status === 'cancelado') return null;
  if (order.status === 'recibido') {
    if (!order.receivedDate || !isValidIsoDate(order.receivedDate)) return null;
    return { kind: 'completed', days: Math.max(0, daysBetween(order.orderDate, order.receivedDate)) };
  }
  return { kind: 'open', days: Math.max(0, daysBetween(order.orderDate, today)) };
}
