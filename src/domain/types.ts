export const CURRENCIES = ['EUR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ORDER_STATUSES = ['borrador', 'confirmado', 'enviado', 'recibido', 'cancelado'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['sin_pagar', 'parcial', 'pagado'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['transferencia', 'tarjeta', 'efectivo', 'paypal', 'otro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Amounts are integer cents. Exchange rates are "1 EUR = X USD" stored as X * 1e6. */
export interface Supplier {
  readonly id: number;
  readonly name: string;
  readonly whatsapp: string;
  readonly notes: string;
}

export interface Order {
  readonly id: number;
  readonly supplierId: number;
  readonly orderDate: string;
  readonly status: OrderStatus;
  readonly currency: Currency;
  readonly shippingCents: number;
  readonly shippingCurrency: Currency;
  readonly customsCents: number;
  readonly customsCurrency: Currency;
  readonly fxRateMicros: number | null;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly notes: string;
}

export interface OrderLine {
  readonly id: number;
  readonly orderId: number;
  readonly position: number;
  readonly quantity: number;
  readonly pieceType: string;
  readonly measurements: string;
  readonly unitPriceCents: number | null;
  readonly rawText: string;
}

export interface Payment {
  readonly id: number;
  readonly orderId: number;
  readonly amountCents: number;
  readonly currency: Currency;
  readonly paidOn: string;
  readonly method: PaymentMethod;
  readonly fxRateMicros: number | null;
  readonly note: string;
}
