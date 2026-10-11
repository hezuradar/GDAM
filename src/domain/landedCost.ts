import { convert, withUsdRate, type FxRates } from './money';
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
  /**
   * Reference unit value for lines that came at 0 (replacements of defective parts) or without price.
   * Only used for costing and sale pricing; the order keeps its own price.
   */
  readonly theoreticalCostCents: number | null;
  readonly theoreticalCurrency: Currency | null;
}

export interface ProductCost extends ProductSource {
  readonly rates: FxRates;
  /** Shipping + customs per unit, allocated by line value (order currency). */
  readonly allocatedPerUnitCents: number | null;
  /** Unit price (or theoretical value) + allocated shipping and customs (order currency). */
  readonly landedUnitCents: number | null;
  /** true when the cost comes from the theoretical value instead of the order price. */
  readonly usesTheoreticalCost: boolean;
}

interface CostBase {
  readonly rates: FxRates;
  /** Real unit price, or the theoretical value (order currency) for zero-price / unpriced lines. */
  readonly baseUnitCents: number | null;
  readonly usesTheoreticalCost: boolean;
}

function costBase(r: ProductSource, marketRates: FxRates): CostBase {
  const rates = withUsdRate(marketRates, r.fxRateMicros);
  const hasRealPrice = r.unitPriceCents !== null && r.unitPriceCents > 0;
  const theoretical =
    !hasRealPrice && r.theoreticalCostCents !== null
      ? convert(r.theoreticalCostCents, r.theoreticalCurrency ?? r.currency, r.currency, rates)
      : null;
  return { rates, baseUnitCents: hasRealPrice ? r.unitPriceCents : (theoretical ?? r.unitPriceCents), usesTheoreticalCost: theoretical !== null };
}

/**
 * Landed cost per unit: each order's shipping + customs (converted to the order currency) is split
 * among its lines in proportion to their value, then divided by quantity. A zero-price replacement
 * counts with its theoretical value, so it carries its share too (none until it has one). Computed
 * on every read, so shipping added later is spread at once.
 */
export function computeProductCosts(rows: readonly ProductSource[], marketRates: FxRates): ProductCost[] {
  const bases = rows.map((r) => costBase(r, marketRates));
  const valueByOrder = new Map<number, number>();
  rows.forEach((r, i) => {
    const base = bases[i].baseUnitCents;
    if (base !== null) valueByOrder.set(r.orderId, (valueByOrder.get(r.orderId) ?? 0) + r.quantity * base);
  });
  return rows.map((r, i) => {
    const { rates, baseUnitCents, usesTheoreticalCost } = bases[i];
    if (baseUnitCents === null || r.quantity <= 0) {
      return { ...r, rates, allocatedPerUnitCents: null, landedUnitCents: null, usesTheoreticalCost: false };
    }
    const extra =
      convert(r.shippingCents, r.shippingCurrency, r.currency, rates) +
      convert(r.customsCents, r.customsCurrency, r.currency, rates);
    const orderValue = valueByOrder.get(r.orderId) ?? 0;
    const allocatedPerUnitCents = orderValue > 0 ? Math.round((extra * r.quantity * baseUnitCents) / orderValue / r.quantity) : 0;
    return { ...r, rates, allocatedPerUnitCents, landedUnitCents: baseUnitCents + allocatedPerUnitCents, usesTheoreticalCost };
  });
}

/**
 * Landed unit cost (display currency) of one line while its theoretical value is being typed:
 * the whole order is recomputed, because that value also changes how shipping is shared.
 * Null when the line is not among the rows or its cost is still unknown.
 */
export function previewLandedCost(
  rows: readonly ProductSource[],
  marketRates: FxRates,
  lineId: number,
  theoreticalCents: number | null,
  theoreticalCurrency: Currency,
  display: Currency,
): number | null {
  const target = rows.find((r) => r.lineId === lineId);
  if (!target) return null;
  const orderRows = rows
    .filter((r) => r.orderId === target.orderId)
    .map((r) =>
      r.lineId === lineId
        ? { ...r, theoreticalCostCents: theoreticalCents, theoreticalCurrency: theoreticalCents === null ? null : theoreticalCurrency }
        : r,
    );
  const line = computeProductCosts(orderRows, marketRates).find((p) => p.lineId === lineId);
  if (!line || line.landedUnitCents === null) return null;
  return convert(line.landedUnitCents, line.currency, display, line.rates);
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
  const toDisplay = (cents: number, from: Currency) => convert(cents, from, display, product.rates);
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
