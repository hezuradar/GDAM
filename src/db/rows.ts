import type {
  Currency,
  Order,
  OrderLine,
  OrderStatus,
  Payment,
  PaymentMethod,
  Supplier,
} from '@/domain/types';

/** Raw SQLite row shapes (snake_case) and their mappers to domain objects. */
export interface SupplierRow {
  id: number;
  name: string;
  whatsapp: string;
  notes: string;
}

export interface OrderRow {
  id: number;
  supplier_id: number;
  order_date: string;
  status: OrderStatus;
  currency: Currency;
  shipping_cents: number;
  shipping_currency: Currency;
  customs_cents: number;
  customs_currency: Currency;
  fx_rate_micros: number | null;
  carrier: string;
  tracking_number: string;
  notes: string;
}

export interface LineRow {
  id: number;
  order_id: number;
  position: number;
  quantity: number;
  piece_type: string;
  measurements: string;
  unit_price_cents: number | null;
  raw_text: string;
}

export interface PaymentRow {
  id: number;
  order_id: number;
  amount_cents: number;
  currency: Currency;
  paid_on: string;
  method: PaymentMethod;
  fx_rate_micros: number | null;
  note: string;
}

export const toSupplier = (r: SupplierRow): Supplier => ({
  id: r.id,
  name: r.name,
  whatsapp: r.whatsapp,
  notes: r.notes,
});

export const toOrder = (r: OrderRow): Order => ({
  id: r.id,
  supplierId: r.supplier_id,
  orderDate: r.order_date,
  status: r.status,
  currency: r.currency,
  shippingCents: r.shipping_cents,
  shippingCurrency: r.shipping_currency,
  customsCents: r.customs_cents,
  customsCurrency: r.customs_currency,
  fxRateMicros: r.fx_rate_micros,
  carrier: r.carrier,
  trackingNumber: r.tracking_number,
  notes: r.notes,
});

export const toLine = (r: LineRow): OrderLine => ({
  id: r.id,
  orderId: r.order_id,
  position: r.position,
  quantity: r.quantity,
  pieceType: r.piece_type,
  measurements: r.measurements,
  unitPriceCents: r.unit_price_cents,
  rawText: r.raw_text,
});

export const toPayment = (r: PaymentRow): Payment => ({
  id: r.id,
  orderId: r.order_id,
  amountCents: r.amount_cents,
  currency: r.currency,
  paidOn: r.paid_on,
  method: r.method,
  fxRateMicros: r.fx_rate_micros,
  note: r.note,
});
