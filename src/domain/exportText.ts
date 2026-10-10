import { formatMoney } from './money';
import { lineTotalCents, type OrderTotals } from './totals';
import type { Currency, OrderLine } from './types';

export interface OrderSummaryInput {
  readonly orderId: number;
  readonly supplierName: string;
  readonly orderDate: string;
  readonly currency: Currency;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly lines: readonly Pick<OrderLine, 'quantity' | 'pieceType' | 'measurements' | 'unitPriceCents'>[];
  readonly totals: OrderTotals;
  readonly paidCents: number;
  readonly pendingCents: number;
}

/** "2026-10-01" → "01/10/2026" */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return day && month && year ? `${day}/${month}/${year}` : isoDate;
}

export function formatQuantity(quantity: number): string {
  return String(quantity).replace('.', ',');
}

/** Plain-text summary formatted for WhatsApp (*bold*). */
export function orderSummaryText(input: OrderSummaryInput): string {
  const money = (cents: number) => formatMoney(cents, input.currency);
  const lines = input.lines.map((line) => {
    const description = [formatQuantity(line.quantity), line.pieceType, line.measurements].filter(Boolean).join(' ');
    const total = lineTotalCents(line);
    if (total === null || line.unitPriceCents === null) return `• ${description} — precio pendiente`;
    return `• ${description} — ${money(line.unitPriceCents)}/ud = ${money(total)}`;
  });

  const { totals } = input;
  const pendingNote =
    totals.pendingPriceCount > 0
      ? ` (provisional, ${totals.pendingPriceCount} ${totals.pendingPriceCount === 1 ? 'precio pendiente' : 'precios pendientes'})`
      : '';
  const tracking = [input.carrier, input.trackingNumber].filter(Boolean).join(' ');

  return [
    `*Pedido #${input.orderId}* · ${input.supplierName} · ${formatDate(input.orderDate)}`,
    '',
    ...lines,
    '',
    `Mercancía: ${money(totals.goodsCents)}`,
    totals.shippingCents ? `Envío: ${money(totals.shippingCents)}` : null,
    totals.customsCents ? `Aduanas: ${money(totals.customsCents)}` : null,
    `*Total: ${money(totals.totalCents)}*${pendingNote}`,
    input.paidCents ? `Pagado: ${money(input.paidCents)}` : null,
    `Pendiente de pago: ${money(input.pendingCents)}`,
    tracking ? `Seguimiento: ${tracking}` : null,
  ]
    .filter((row): row is string => row !== null)
    .join('\n');
}
