export const CURRENCIES = ['EUR', 'USD', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ORDER_STATUSES = ['borrador', 'confirmado', 'enviado', 'recibido', 'cancelado'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['sin_pagar', 'parcial', 'pagado'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['transferencia', 'tarjeta', 'efectivo', 'paypal', 'otro'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Exchange rates frozen when an amount was entered: "1 EUR = X USD" and "1 EUR = Y INR", both * 1e6.
 * Every amount that keeps its own currency stores the rates that were in force when it was written,
 * so its cost does not drift when the market moves. A null part means the amount was saved before
 * the rates were frozen.
 */
export interface FxSnapshot {
  readonly usdMicros: number | null;
  readonly inrMicros: number | null;
}

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
  /** Rates frozen when the shipping was entered. */
  readonly shippingSnapshot: FxSnapshot | null;
  readonly customsCents: number;
  readonly customsCurrency: Currency;
  /** Rates frozen when the customs were entered. */
  readonly customsSnapshot: FxSnapshot | null;
  /** Rate the user fixed for this order (1 EUR = X USD); null = the market rate. */
  readonly fxRateMicros: number | null;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly notes: string;
  /** Day the order was marked as received (YYYY-MM-DD); null while it has not arrived. */
  readonly receivedDate: string | null;
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
  /** Pieces that actually arrived (reception check); null = not checked yet. */
  readonly receivedQuantity: number | null;
}

export interface Payment {
  readonly id: number;
  readonly orderId: number;
  readonly amountCents: number;
  readonly currency: Currency;
  /** Rates frozen when the payment was entered (the bank rate, the order's rate or the market). */
  readonly snapshot: FxSnapshot | null;
  readonly paidOn: string;
  readonly method: PaymentMethod;
  readonly note: string;
}

/**
 * What the client sends to create or update an order. The frozen rates are the server's business:
 * they are stamped when the amount is written, never sent by the client.
 */
export interface OrderInput {
  readonly supplierId: number;
  readonly orderDate: string;
  readonly status: OrderStatus;
  readonly currency: Currency;
  readonly shippingCents: number;
  readonly shippingCurrency: Currency;
  readonly customsCents: number;
  readonly customsCurrency: Currency;
  /** Rate fixed for this order (1 EUR = X USD); null = the market rate. */
  readonly fxRateMicros: number | null;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly notes: string;
}

/** What the client sends to create or update a payment. */
export interface PaymentInput {
  readonly amountCents: number;
  readonly currency: Currency;
  readonly paidOn: string;
  readonly method: PaymentMethod;
  /** EUR→USD rate to freeze with the payment; null = the server freezes the effective one. */
  readonly fxRateMicros: number | null;
  readonly note: string;
}
