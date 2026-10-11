import { convert } from './money';
import type { Currency } from './types';

/** One purchased product (order line) with what is needed to know its real unit cost. */
export interface ProductSource {
  readonly lineId: number;
  readonly orderId: number;
  readonly orderDate: string;
  readonly supplierName: string;
  readonly quantity: number;
  readonly pieceType: string;
  readonly measurements: string;
  readonly unitPriceCents: number | null;
  /** Order currency: unit price, allocation and landed cost are in this currency. */
  readonly currency: Currency;
  readonly shippingCents: number;
  readonly shippingCurrency: Currency;
  readonly customsCents: number;
  readonly customsCurrency: Currency;
  readonly fxRateMicros: number | null;
  readonly salePriceCents: number | null;
  readonly saleCurrency: Currency | null;
  /** Profit over cost in basis points (2500 = 25 %). */
  readonly marginBp: number | null;
}

export interface ProductCost extends ProductSource {
  readonly rateMicros: number;
  /** Shipping + customs per unit, allocated by line value (order currency). */
  readonly allocatedPerUnitCents: number | null;
  /** Unit price + allocated shipping and customs (order currency). */
  readonly landedUnitCents: number | null;
}

/**
 * Landed cost per unit: each order's shipping + customs (converted to the order currency)
 * is split among its priced lines in proportion to their value, then divided by quantity.
 */
export function computeProductCosts(rows: readonly ProductSource[], fallbackRateMicros: number): ProductCost[] {
  const goodsByOrder = new Map<number, number>();
  for (const r of rows) {
    if (r.unitPriceCents !== null) goodsByOrder.set(r.orderId, (goodsByOrder.get(r.orderId) ?? 0) + r.quantity * r.unitPriceCents);
  }
  return rows.map((r) => {
    const rateMicros = r.fxRateMicros ?? fallbackRateMicros;
    const goods = goodsByOrder.get(r.orderId) ?? 0;
    if (r.unitPriceCents === null || goods <= 0 || r.quantity <= 0) {
      return { ...r, rateMicros, allocatedPerUnitCents: null, landedUnitCents: null };
    }
    const extra =
      convert(r.shippingCents, r.shippingCurrency, r.currency, rateMicros) +
      convert(r.customsCents, r.customsCurrency, r.currency, rateMicros);
    const allocatedPerUnitCents = Math.round((extra * (r.quantity * r.unitPriceCents)) / goods / r.quantity);
    return { ...r, rateMicros, allocatedPerUnitCents, landedUnitCents: r.unitPriceCents + allocatedPerUnitCents };
  });
}

/** 2500 → "25 %", 1250 → "12,5 %". */
export function formatMargin(bp: number): string {
  return `${(bp / 100).toFixed(1).replace('.', ',').replace(/,0$/, '')} %`;
}

export function salePriceFromMargin(costCents: number, marginBp: number): number {
  return Math.round((costCents * (10_000 + marginBp)) / 10_000);
}

export function marginFromSalePrice(costCents: number, salePriceCents: number): number | null {
  return costCents > 0 ? Math.round(((salePriceCents - costCents) * 10_000) / costCents) : null;
}

export interface SaleInfo {
  readonly currency: Currency;
  readonly landedUnitCents: number | null;
  readonly salePriceCents: number | null;
  readonly marginBp: number | null;
}

/**
 * Cost, sale price and margin in the display currency. A stored sale price wins (the margin is
 * derived from it); otherwise a stored margin produces the sale price.
 */
export function productSaleInfo(product: ProductCost, display: Currency): SaleInfo {
  const toDisplay = (cents: number, from: Currency) => convert(cents, from, display, product.rateMicros);
  const landed = product.landedUnitCents === null ? null : toDisplay(product.landedUnitCents, product.currency);
  if (product.salePriceCents !== null) {
    const sale = toDisplay(product.salePriceCents, product.saleCurrency ?? product.currency);
    return { currency: display, landedUnitCents: landed, salePriceCents: sale, marginBp: landed === null ? null : marginFromSalePrice(landed, sale) };
  }
  if (product.marginBp !== null) {
    return {
      currency: display,
      landedUnitCents: landed,
      salePriceCents: landed === null ? null : salePriceFromMargin(landed, product.marginBp),
      marginBp: product.marginBp,
    };
  }
  return { currency: display, landedUnitCents: landed, salePriceCents: null, marginBp: null };
}
