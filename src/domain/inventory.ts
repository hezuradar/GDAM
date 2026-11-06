import { productSaleInfo, type ProductCost } from './landedCost';
import { convert } from './money';
import { foldText } from './orderFilters';
import type { Currency, OrderStatus } from './types';

/**
 * Warehouse value, landed cost against the supplier price and unit price history, always in one
 * display currency. Every amount is converted with its order's own rates, so it keeps its value.
 */

export const productLabel = (p: Pick<ProductCost, 'pieceType' | 'measurements'>): string =>
  [p.pieceType, p.measurements].filter(Boolean).join(' ');

/** Same product across orders: case, accents and spacing do not make it a different one. */
export function productKey(p: Pick<ProductCost, 'pieceType' | 'measurements'>): string {
  return foldText(productLabel(p)).replace(/\s+/g, ' ').trim();
}

const bpOf = (part: number, base: number): number | null => (base > 0 ? Math.round((part * 10_000) / base) : null);
const toDisplay = (p: ProductCost, cents: number, display: Currency) => convert(cents, p.currency, display, p.rates);

// ---------- Warehouse value ----------

const IN_TRANSIT: readonly OrderStatus[] = ['confirmado', 'enviado'];

export interface StockItem {
  readonly lineId: number;
  readonly label: string;
  readonly supplierName: string;
  readonly pieces: number;
  readonly valueCents: number;
}

export interface WarehouseStats {
  /** Received pieces valued at landed cost (price + shipping and customs + handling). */
  readonly stockCents: number;
  readonly stockPieces: number;
  /** Of the stock with a sale price: what it would bring in and what it cost. */
  readonly stockSaleCents: number;
  readonly stockSaleCostCents: number;
  /** Confirmed or shipped orders: paid for (or owed) but not here yet. */
  readonly transitCents: number;
  readonly transitPieces: number;
  /** Pieces in stock or on their way whose cost is still unknown (no price). */
  readonly unknownCostPieces: number;
  /** Largest value first. */
  readonly topByValue: readonly StockItem[];
}

/** Pieces a line puts in the warehouse: what arrived when checked, else all of them. */
const receivedPieces = (p: ProductCost) => p.receivedQuantity ?? p.quantity;

/**
 * Drafts are not counted (nothing is committed yet). Received orders are stock; confirmed and shipped
 * ones are in transit. Sales are not recorded, so the stock is everything that has arrived.
 */
export function warehouseStats(products: readonly ProductCost[], display: Currency, limit = 5): WarehouseStats {
  const sums = { stock: 0, stockPieces: 0, sale: 0, saleCost: 0, transit: 0, transitPieces: 0, unknown: 0 };
  const items: StockItem[] = [];

  for (const p of products) {
    const isStock = p.orderStatus === 'recibido';
    if (!isStock && !IN_TRANSIT.includes(p.orderStatus)) continue;
    const pieces = isStock ? receivedPieces(p) : p.quantity;
    if (pieces <= 0) continue;
    const info = productSaleInfo(p, display);
    if (info.landedUnitCents === null) {
      sums.unknown += pieces;
      continue;
    }
    const value = Math.round(info.landedUnitCents * pieces);
    if (!isStock) {
      sums.transit += value;
      sums.transitPieces += pieces;
      continue;
    }
    sums.stock += value;
    sums.stockPieces += pieces;
    items.push({ lineId: p.lineId, label: productLabel(p), supplierName: p.supplierName, pieces, valueCents: value });
    if (info.salePriceCents !== null) {
      sums.sale += Math.round(info.salePriceCents * pieces);
      sums.saleCost += value;
    }
  }

  return {
    stockCents: sums.stock,
    stockPieces: sums.stockPieces,
    stockSaleCents: sums.sale,
    stockSaleCostCents: sums.saleCost,
    transitCents: sums.transit,
    transitPieces: sums.transitPieces,
    unknownCostPieces: sums.unknown,
    topByValue: [...items].sort((a, b) => b.valueCents - a.valueCents).slice(0, limit),
  };
}

// ---------- Landed cost against the supplier price ----------

export interface SupplierOverhead {
  readonly key: string;
  readonly label: string;
  readonly goodsCents: number;
  readonly shippingCustomsCents: number;
  /** Shipping + customs over what the goods cost; null when the goods cost 0. */
  readonly overheadBp: number | null;
}

export interface ProductOverhead {
  readonly lineId: number;
  readonly orderId: number;
  readonly label: string;
  readonly supplierName: string;
  readonly supplierUnitCents: number;
  readonly landedUnitCents: number;
  /** (landed − supplier price) over the supplier price. */
  readonly overheadBp: number;
}

export interface OverheadStats {
  /** What the suppliers charged for the goods (real prices; replacements at 0 count 0). */
  readonly goodsCents: number;
  readonly shippingCustomsCents: number;
  readonly handlingCents: number;
  readonly landedCents: number;
  /** Shipping + customs over the goods. */
  readonly shippingCustomsBp: number | null;
  /** Everything added to the supplier price (shipping, customs and handling) over the goods. */
  readonly totalOverheadBp: number | null;
  /** Highest overhead first. */
  readonly bySupplier: readonly SupplierOverhead[];
  /** Products whose final cost exceeds the supplier price the most, in %. */
  readonly topProducts: readonly ProductOverhead[];
}

const byOverheadDesc = (a: { overheadBp: number | null }, b: { overheadBp: number | null }) =>
  (b.overheadBp ?? -Infinity) - (a.overheadBp ?? -Infinity);

/** Lines without a price are left out: what the supplier charged for them is not known yet. */
export function overheadStats(products: readonly ProductCost[], display: Currency, limit = 5): OverheadStats {
  const sums = { goods: 0, extra: 0, handling: 0 };
  const suppliers = new Map<string, { goods: number; extra: number }>();
  const perProduct: ProductOverhead[] = [];

  for (const p of products) {
    if (p.unitPriceCents === null || p.allocatedPerUnitCents === null || p.quantity <= 0) continue;
    const goods = toDisplay(p, Math.round(p.unitPriceCents * p.quantity), display);
    const extra = toDisplay(p, Math.round(p.allocatedPerUnitCents * p.quantity), display);
    const handling = toDisplay(p, Math.round(p.handlingPerUnitCents * p.quantity), display);
    sums.goods += goods;
    sums.extra += extra;
    sums.handling += handling;
    const name = p.supplierName || 'Sin proveedor';
    const current = suppliers.get(name) ?? { goods: 0, extra: 0 };
    suppliers.set(name, { goods: current.goods + goods, extra: current.extra + extra });
    if (p.unitPriceCents > 0) {
      const supplierUnitCents = toDisplay(p, p.unitPriceCents, display);
      const landedUnitCents = toDisplay(p, p.unitPriceCents + p.allocatedPerUnitCents + p.handlingPerUnitCents, display);
      perProduct.push({
        lineId: p.lineId,
        orderId: p.orderId,
        label: productLabel(p),
        supplierName: p.supplierName,
        supplierUnitCents,
        landedUnitCents,
        overheadBp: bpOf(landedUnitCents - supplierUnitCents, supplierUnitCents) ?? 0,
      });
    }
  }

  return {
    goodsCents: sums.goods,
    shippingCustomsCents: sums.extra,
    handlingCents: sums.handling,
    landedCents: sums.goods + sums.extra + sums.handling,
    shippingCustomsBp: bpOf(sums.extra, sums.goods),
    totalOverheadBp: bpOf(sums.extra + sums.handling, sums.goods),
    bySupplier: [...suppliers.entries()]
      .map(([label, s]) => ({ key: label, label, goodsCents: s.goods, shippingCustomsCents: s.extra, overheadBp: bpOf(s.extra, s.goods) }))
      .sort(byOverheadDesc),
    topProducts: perProduct.filter((p) => p.overheadBp > 0).sort(byOverheadDesc).slice(0, limit),
  };
}

// ---------- Unit price history ----------

export interface PricePoint {
  readonly lineId: number;
  readonly orderId: number;
  readonly orderDate: string;
  readonly supplierName: string;
  readonly quantity: number;
  /** Supplier price per unit. */
  readonly unitPriceCents: number;
  /** Final cost per unit (shipping, customs and handling included). */
  readonly landedUnitCents: number | null;
  /** Supplier price against the previous purchase; null for the first one. */
  readonly changeBp: number | null;
}

const byDate = (a: ProductCost, b: ProductCost) => a.orderDate.localeCompare(b.orderDate) || a.orderId - b.orderId || a.lineId - b.lineId;

function historyOf(rows: readonly ProductCost[], display: Currency): PricePoint[] {
  const priced = rows.filter((p) => p.unitPriceCents !== null && p.unitPriceCents > 0).sort(byDate);
  let previous: number | null = null;
  return priced.map((p) => {
    const unitPriceCents = toDisplay(p, p.unitPriceCents ?? 0, display);
    const changeBp = previous === null ? null : bpOf(unitPriceCents - previous, previous);
    previous = unitPriceCents;
    return {
      lineId: p.lineId,
      orderId: p.orderId,
      orderDate: p.orderDate,
      supplierName: p.supplierName,
      quantity: p.quantity,
      unitPriceCents,
      landedUnitCents: p.landedUnitCents === null ? null : toDisplay(p, p.landedUnitCents, display),
      changeBp,
    };
  });
}

/** Every priced purchase of the same product as `lineId`, oldest first. Empty when the line is unknown. */
export function priceHistory(products: readonly ProductCost[], lineId: number, display: Currency): PricePoint[] {
  const target = products.find((p) => p.lineId === lineId);
  if (!target) return [];
  const key = productKey(target);
  return historyOf(products.filter((p) => productKey(p) === key), display);
}

export interface PriceChange {
  /** Latest purchase: opens the product. */
  readonly lineId: number;
  readonly label: string;
  readonly supplierName: string;
  readonly purchases: number;
  readonly previousCents: number;
  readonly latestCents: number;
  readonly previousDate: string;
  readonly latestDate: string;
  readonly changeBp: number;
}

export interface PriceChanges {
  /** Biggest rise first. */
  readonly rises: readonly PriceChange[];
  /** Biggest drop first. */
  readonly drops: readonly PriceChange[];
  /** All the rises and drops, before limiting the lists. */
  readonly riseCount: number;
  readonly dropCount: number;
}

function groupByProduct(products: readonly ProductCost[]): Map<string, ProductCost[]> {
  const groups = new Map<string, ProductCost[]>();
  for (const p of products) {
    const key = productKey(p);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return groups;
}

/** Products bought at least twice whose last supplier price differs from the one before. */
export function priceChanges(products: readonly ProductCost[], display: Currency, limit = 5): PriceChanges {
  const changes: PriceChange[] = [];
  for (const rows of groupByProduct(products).values()) {
    const history = historyOf(rows, display);
    if (history.length < 2) continue;
    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    if (latest.changeBp === null || latest.changeBp === 0) continue;
    changes.push({
      lineId: latest.lineId,
      label: productLabel(rows[0]),
      supplierName: latest.supplierName,
      purchases: history.length,
      previousCents: previous.unitPriceCents,
      latestCents: latest.unitPriceCents,
      previousDate: previous.orderDate,
      latestDate: latest.orderDate,
      changeBp: latest.changeBp,
    });
  }
  const rises = changes.filter((c) => c.changeBp > 0).sort((a, b) => b.changeBp - a.changeBp);
  const drops = changes.filter((c) => c.changeBp < 0).sort((a, b) => a.changeBp - b.changeBp);
  return { rises: rises.slice(0, limit), drops: drops.slice(0, limit), riseCount: rises.length, dropCount: drops.length };
}
