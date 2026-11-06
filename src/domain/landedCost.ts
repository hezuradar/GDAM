import { amountRates, convert, withUsdRate, type FxRates } from './money';
import type { Currency, FxSnapshot, OrderStatus } from './types';

/** One purchased product (order line) with what is needed to know its real unit cost. */
export interface ProductSource {
  readonly lineId: number;
  readonly orderId: number;
  readonly orderDate: string;
  /** Tells what is already in the warehouse (received) from what is still on its way. */
  readonly orderStatus: OrderStatus;
  readonly supplierName: string;
  readonly quantity: number;
  /** Pieces that actually arrived (reception check); null = not checked. */
  readonly receivedQuantity: number | null;
  readonly pieceType: string;
  readonly measurements: string;
  readonly unitPriceCents: number | null;
  /** Order currency: unit price, allocation and landed cost are in this currency. */
  readonly currency: Currency;
  readonly shippingCents: number;
  readonly shippingCurrency: Currency;
  /** Rates frozen when the shipping was entered. */
  readonly shippingSnapshot: FxSnapshot | null;
  readonly customsCents: number;
  readonly customsCurrency: Currency;
  /** Rates frozen when the customs were entered. */
  readonly customsSnapshot: FxSnapshot | null;
  readonly fxRateMicros: number | null;
  readonly salePriceCents: number | null;
  readonly saleCurrency: Currency | null;
  /** Rates frozen when the sale price was entered. */
  readonly saleSnapshot: FxSnapshot | null;
  /** Profit over cost in basis points (2500 = 25 %). */
  readonly marginBp: number | null;
  /**
   * Reference unit value for lines that came at 0 (replacements of defective parts) or without price.
   * Only used for costing / sale pricing in Productos; unit_price_cents (the order price) is not touched.
   */
  readonly theoreticalCostCents: number | null;
  readonly theoreticalCurrency: Currency | null;
  /** Rates frozen when the theoretical value was entered. */
  readonly theoreticalSnapshot: FxSnapshot | null;
  /** Handling cost per unit before selling (cleaning, cutting, packing…). Never part of the order. */
  readonly handlingCostCents: number | null;
  readonly handlingCurrency: Currency | null;
  /** Rates frozen when the handling cost was entered. */
  readonly handlingSnapshot: FxSnapshot | null;
}

export interface ProductCost extends ProductSource {
  /** The order's rates (its fixed rate over the market): used for display conversions. */
  readonly rates: FxRates;
  /** Rates of the sale price: the ones frozen when it was entered. */
  readonly saleRates: FxRates;
  /** Rates of the theoretical value: the ones frozen when it was entered. */
  readonly theoreticalRates: FxRates;
  /** Rates of the handling cost: the ones frozen when it was entered. */
  readonly handlingRates: FxRates;
  /** Shipping + customs per unit, allocated by line value (order currency). */
  readonly allocatedPerUnitCents: number | null;
  /** Handling cost per unit in the order currency (0 when none). */
  readonly handlingPerUnitCents: number;
  /** Unit price (or theoretical value) + allocated shipping and customs + handling (order currency). */
  readonly landedUnitCents: number | null;
  /** true when the cost comes from the theoretical value instead of the order price. */
  readonly usesTheoreticalCost: boolean;
  /**
   * true for a zero-price replacement without theoretical value that takes its share of shipping
   * and customs weighted by its sale price (its cost is that share alone, plus handling).
   */
  readonly sharesBySalePrice: boolean;
}

interface CostBase {
  readonly rates: FxRates;
  readonly saleRates: FxRates;
  readonly theoreticalRates: FxRates;
  readonly handlingRates: FxRates;
  /** Real unit price, or the theoretical value (order currency) for zero-price / unpriced lines. */
  readonly baseUnitCents: number | null;
  /** Unit value used to share shipping and customs (order currency); 0 = no share. */
  readonly weightUnitCents: number;
  readonly usesTheoreticalCost: boolean;
  readonly sharesBySalePrice: boolean;
}

/**
 * A zero-price replacement without theoretical value costs nothing, but it still travels: its sale
 * price (order currency) weighs its share of shipping and customs. A margin alone cannot weigh it,
 * because the sale price it gives depends on that very share.
 */
function replacementSaleWeight(r: ProductSource, saleRates: FxRates): number {
  if (r.unitPriceCents !== 0 || r.salePriceCents === null || r.salePriceCents <= 0) return 0;
  return convert(r.salePriceCents, r.saleCurrency ?? r.currency, r.currency, saleRates);
}

function costBase(r: ProductSource, marketRates: FxRates): CostBase {
  const rates = withUsdRate(marketRates, r.fxRateMicros);
  const theoreticalRates = amountRates(marketRates, r.theoreticalSnapshot, r.fxRateMicros);
  const hasRealPrice = r.unitPriceCents !== null && r.unitPriceCents > 0;
  const theoretical =
    !hasRealPrice && r.theoreticalCostCents !== null
      ? convert(r.theoreticalCostCents, r.theoreticalCurrency ?? r.currency, r.currency, theoreticalRates)
      : null;
  const saleRates = amountRates(marketRates, r.saleSnapshot, r.fxRateMicros);
  const baseUnitCents = hasRealPrice ? r.unitPriceCents : (theoretical ?? r.unitPriceCents);
  const saleWeight = theoretical === null ? replacementSaleWeight(r, saleRates) : 0;
  return {
    rates,
    saleRates,
    theoreticalRates,
    handlingRates: amountRates(marketRates, r.handlingSnapshot, r.fxRateMicros),
    baseUnitCents,
    weightUnitCents: saleWeight > 0 ? saleWeight : (baseUnitCents ?? 0),
    usesTheoreticalCost: theoretical !== null,
    sharesBySalePrice: saleWeight > 0,
  };
}

/**
 * Landed cost per unit: each order's shipping + customs (converted to the order currency) is split
 * among its lines in proportion to their value, then divided by quantity. A zero-price replacement
 * counts with its theoretical value or, without one, with its sale price (its cost stays 0 plus that
 * share); with neither it gets no share. Computed on every read, so shipping added later is spread at once.
 */
export function computeProductCosts(rows: readonly ProductSource[], marketRates: FxRates): ProductCost[] {
  const bases = rows.map((r) => costBase(r, marketRates));
  const valueByOrder = new Map<number, number>();
  rows.forEach((r, i) => {
    const { baseUnitCents, weightUnitCents } = bases[i];
    if (baseUnitCents !== null) valueByOrder.set(r.orderId, (valueByOrder.get(r.orderId) ?? 0) + r.quantity * weightUnitCents);
  });
  return rows.map((r, i) => {
    const { rates, saleRates, theoreticalRates, handlingRates, baseUnitCents, weightUnitCents, usesTheoreticalCost, sharesBySalePrice } = bases[i];
    // Handling never takes part in the shipping split: it is a cost of this product only.
    const handlingPerUnitCents =
      r.handlingCostCents === null ? 0 : convert(r.handlingCostCents, r.handlingCurrency ?? r.currency, r.currency, handlingRates);
    if (baseUnitCents === null || r.quantity <= 0) {
      return {
        ...r,
        rates,
        saleRates,
        theoreticalRates,
        handlingRates,
        allocatedPerUnitCents: null,
        handlingPerUnitCents,
        landedUnitCents: null,
        usesTheoreticalCost: false,
        sharesBySalePrice: false,
      };
    }
    const shippingRates = amountRates(marketRates, r.shippingSnapshot, r.fxRateMicros);
    const customsRates = amountRates(marketRates, r.customsSnapshot, r.fxRateMicros);
    const extra =
      convert(r.shippingCents, r.shippingCurrency, r.currency, shippingRates) +
      convert(r.customsCents, r.customsCurrency, r.currency, customsRates);
    const orderValue = valueByOrder.get(r.orderId) ?? 0;
    // Rounding each unit to the nearest cent keeps the total drift below half a cent per piece;
    // an exact split would need fractional cents, which cannot be stored.
    const allocatedPerUnitCents = orderValue > 0 ? Math.round((extra * weightUnitCents) / orderValue) : 0;
    return {
      ...r,
      rates,
      saleRates,
      theoreticalRates,
      handlingRates,
      allocatedPerUnitCents,
      handlingPerUnitCents,
      landedUnitCents: baseUnitCents + allocatedPerUnitCents + handlingPerUnitCents,
      usesTheoreticalCost,
      sharesBySalePrice,
    };
  });
}

/** Values being typed on the product screen, in `currency`; a missing key keeps the stored value. */
export interface CostOverrides {
  readonly theoreticalCents?: number | null;
  readonly handlingCents?: number | null;
  /** Sale price being typed: it weighs the shipping share of a replacement without theoretical value. */
  readonly saleCents?: number | null;
  readonly currency: Currency;
}

function applyOverrides(row: ProductSource, overrides: CostOverrides): ProductSource {
  const { theoreticalCents, handlingCents, saleCents, currency } = overrides;
  return {
    ...row,
    ...(saleCents !== undefined
      ? { salePriceCents: saleCents, saleCurrency: saleCents === null ? null : currency, saleSnapshot: null, marginBp: null }
      : {}),
    // A value being typed now is worth what the market says today: it has no frozen rates yet.
    ...(theoreticalCents !== undefined
      ? { theoreticalCostCents: theoreticalCents, theoreticalCurrency: theoreticalCents === null ? null : currency, theoreticalSnapshot: null }
      : {}),
    ...(handlingCents !== undefined
      ? { handlingCostCents: handlingCents, handlingCurrency: handlingCents === null ? null : currency, handlingSnapshot: null }
      : {}),
  };
}

/**
 * Landed unit cost (display currency) of one line while its theoretical value or handling cost is
 * being typed: the whole order is recomputed, because a theoretical value also changes how shipping
 * is shared. Null when the line is not among the rows or its cost is still unknown.
 */
export function previewLandedCost(
  rows: readonly ProductSource[],
  marketRates: FxRates,
  lineId: number,
  overrides: CostOverrides,
  display: Currency,
): number | null {
  const target = rows.find((r) => r.lineId === lineId);
  if (!target) return null;
  const orderRows = rows
    .filter((r) => r.orderId === target.orderId)
    .map((r) => (r.lineId === lineId ? applyOverrides(r, overrides) : r));
  const line = computeProductCosts(orderRows, marketRates).find((p) => p.lineId === lineId);
  if (!line || line.landedUnitCents === null) return null;
  return convert(line.landedUnitCents, line.currency, display, line.rates);
}

const MAX_SALE_ITERATIONS = 60;
/** A sale price so high that the line takes practically all of its order's shipping. */
const CEILING_SALE_CENTS = 1_000_000_000;

/**
 * Sale price (display currency) that gives `marginBp` over the landed cost when that cost itself
 * depends on the sale price (a replacement sharing shipping by its sale price). Iterates down from
 * the highest possible price, so it lands on the meaningful fixed point and never on the trivial 0.
 */
export function saleForMarginPreview(
  rows: readonly ProductSource[],
  marketRates: FxRates,
  lineId: number,
  overrides: CostOverrides,
  display: Currency,
  marginBp: number,
): number | null {
  if (marginBp <= -10_000) return null;
  const costWith = (sale: number | null) => previewLandedCost(rows, marketRates, lineId, { ...overrides, saleCents: sale, currency: display }, display);
  // With the line weighing everything, it takes the whole shipping: the highest cost it can have.
  const ceiling = costWith(CEILING_SALE_CENTS);
  if (ceiling === null) return null;
  let sale = salePriceFromMargin(ceiling, marginBp);
  for (let i = 0; i < MAX_SALE_ITERATIONS; i++) {
    const landed = costWith(sale);
    if (landed === null) return null;
    const next = salePriceFromMargin(landed, marginBp);
    if (next === sale) break;
    sale = next;
  }
  return sale;
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
 * Cost, sale price and margin in the display currency. The sale price is converted with the rates
 * frozen when it was entered, so it keeps the value it had that day.
 * A stored sale price wins (the margin is derived from it); otherwise a stored margin produces the sale price.
 */
export function productSaleInfo(product: ProductCost, display: Currency): SaleInfo {
  const toDisplay = (cents: number, from: Currency, rates: FxRates) => convert(cents, from, display, rates);
  const landed = product.landedUnitCents === null ? null : toDisplay(product.landedUnitCents, product.currency, product.rates);
  if (product.salePriceCents !== null) {
    const sale = toDisplay(product.salePriceCents, product.saleCurrency ?? product.currency, product.saleRates);
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
