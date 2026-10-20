import { productSaleInfo, type ProductCost } from './landedCost';
import { convert, type FxRates } from './money';
import type { ListLine, ListPayment } from './orderList';
import { orderPaidCents } from './payments';
import { orderTotals } from './totals';
import type { Currency, Order, Supplier } from './types';

/** Spending and profit figures for the statistics screen, always in one display currency. */

export interface SpendSource {
  readonly orders: readonly Order[];
  readonly lines: readonly ListLine[];
  readonly payments: readonly ListPayment[];
  readonly suppliers: readonly Supplier[];
  readonly marketRates: FxRates;
}

export interface AmountShare {
  readonly key: string;
  readonly label: string;
  readonly cents: number;
}

export interface SpendStats {
  readonly orderCount: number;
  readonly totalCents: number;
  readonly goodsCents: number;
  readonly shippingCents: number;
  readonly customsCents: number;
  readonly paidCents: number;
  readonly pendingCents: number;
  readonly pieces: number;
  /** Products spend divided by the pieces that have a price; null when none has. */
  readonly avgPieceCostCents: number | null;
  readonly pendingPriceLines: number;
  /** Largest first. */
  readonly bySupplier: readonly AmountShare[];
  /** Last months, oldest first, including empty months. */
  readonly byMonth: readonly AmountShare[];
}

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const UNKNOWN_SUPPLIER = 'Proveedor desconocido';

function lastMonths(now: Date, count: number): AmountShare[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    const month = date.getMonth();
    const key = `${date.getFullYear()}-${String(month + 1).padStart(2, '0')}`;
    return { key, label: `${MONTH_NAMES[month]} ${String(date.getFullYear()).slice(-2)}`, cents: 0 };
  });
}

function groupByOrder<T extends { orderId: number }>(rows: readonly T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const row of rows) groups.set(row.orderId, [...(groups.get(row.orderId) ?? []), row]);
  return groups;
}

/** Cancelled orders are left out. */
export function spendStats(source: SpendSource, display: Currency, now: Date = new Date(), months = 12): SpendStats {
  const linesByOrder = groupByOrder(source.lines);
  const paymentsByOrder = groupByOrder(source.payments);
  const supplierNames = new Map(source.suppliers.map((s) => [s.id, s.name]));
  const bySupplier = new Map<number, number>();
  const byMonth = lastMonths(now, months);
  const monthIndex = new Map(byMonth.map((m, i) => [m.key, i]));
  const monthCents = byMonth.map(() => 0);
  const sums = { total: 0, goods: 0, shipping: 0, customs: 0, paid: 0, pending: 0, pieces: 0, pricedPieces: 0, pendingLines: 0 };
  const active = source.orders.filter((o) => o.status !== 'cancelado');

  for (const order of active) {
    const lines = linesByOrder.get(order.id) ?? [];
    const totals = orderTotals(order, lines, source.marketRates);
    const toDisplay = (cents: number) => convert(cents, order.currency, display, totals.rates);
    const paid = orderPaidCents(paymentsByOrder.get(order.id) ?? [], order.currency, totals.rates, totals.customsCents);
    const total = toDisplay(totals.totalCents);

    sums.total += total;
    sums.goods += toDisplay(totals.goodsCents);
    sums.shipping += toDisplay(totals.shippingCents);
    sums.customs += toDisplay(totals.customsCents);
    sums.paid += toDisplay(paid);
    sums.pending += toDisplay(Math.max(0, totals.totalCents - paid));
    sums.pendingLines += totals.pendingPriceCount;
    for (const line of lines) {
      sums.pieces += line.quantity;
      if (line.unitPriceCents !== null) sums.pricedPieces += line.quantity;
    }
    bySupplier.set(order.supplierId, (bySupplier.get(order.supplierId) ?? 0) + total);
    const index = monthIndex.get(order.orderDate.slice(0, 7));
    if (index !== undefined) monthCents[index] += total;
  }

  return {
    orderCount: active.length,
    totalCents: sums.total,
    goodsCents: sums.goods,
    shippingCents: sums.shipping,
    customsCents: sums.customs,
    paidCents: sums.paid,
    pendingCents: sums.pending,
    pieces: sums.pieces,
    avgPieceCostCents: sums.pricedPieces > 0 ? Math.round(sums.goods / sums.pricedPieces) : null,
    pendingPriceLines: sums.pendingLines,
    bySupplier: [...bySupplier.entries()]
      .map(([id, cents]) => ({ key: String(id), label: supplierNames.get(id) ?? UNKNOWN_SUPPLIER, cents }))
      .sort((a, b) => b.cents - a.cents),
    byMonth: byMonth.map((m, i) => ({ ...m, cents: monthCents[i] })),
  };
}

export interface ProductProfit {
  readonly lineId: number;
  readonly orderId: number;
  readonly label: string;
  readonly supplierName: string;
  readonly quantity: number;
  readonly unitCostCents: number;
  readonly unitSaleCents: number;
  readonly unitProfitCents: number;
  /** Profit over cost in basis points; null when the cost is 0. */
  readonly marginBp: number | null;
  readonly totalProfitCents: number;
}

export interface ProductUnitCost {
  readonly lineId: number;
  readonly label: string;
  readonly supplierName: string;
  readonly quantity: number;
  readonly unitCostCents: number;
}

export interface ProfitStats {
  readonly productCount: number;
  readonly withSaleCount: number;
  /** Known cost but no sale price or margin yet. */
  readonly withoutSaleCount: number;
  /** No price (and no theoretical value): cost unknown. */
  readonly withoutCostCount: number;
  /** Totals of the products with a sale price: cost, expected sales and profit. */
  readonly costCents: number;
  readonly saleCents: number;
  readonly profitCents: number;
  /** Weighted margin over cost; null without products for sale. */
  readonly marginBp: number | null;
  readonly topByMargin: readonly ProductProfit[];
  readonly topByProfit: readonly ProductProfit[];
  readonly topByUnitCost: readonly ProductUnitCost[];
  readonly negativeMargin: readonly ProductProfit[];
}

const productLabel = (p: ProductCost) => [p.pieceType, p.measurements].filter(Boolean).join(' ');

export function profitStats(products: readonly ProductCost[], display: Currency, limit = 5): ProfitStats {
  const withCost: ProductUnitCost[] = [];
  const profits: ProductProfit[] = [];
  let withoutSaleCount = 0;

  for (const p of products) {
    const info = productSaleInfo(p, display);
    if (info.landedUnitCents === null) continue;
    const base = { lineId: p.lineId, label: productLabel(p), supplierName: p.supplierName, quantity: p.quantity };
    withCost.push({ ...base, unitCostCents: info.landedUnitCents });
    if (info.salePriceCents === null) {
      withoutSaleCount += 1;
      continue;
    }
    const unitProfitCents = info.salePriceCents - info.landedUnitCents;
    profits.push({
      ...base,
      orderId: p.orderId,
      unitCostCents: info.landedUnitCents,
      unitSaleCents: info.salePriceCents,
      unitProfitCents,
      marginBp: info.marginBp,
      totalProfitCents: Math.round(unitProfitCents * p.quantity),
    });
  }

  const costCents = profits.reduce((sum, p) => sum + Math.round(p.unitCostCents * p.quantity), 0);
  const saleCents = profits.reduce((sum, p) => sum + Math.round(p.unitSaleCents * p.quantity), 0);
  const profitCents = saleCents - costCents;
  // Nulls sort last; subtracting them directly would yield NaN and scramble the order.
  const byMarginDesc = (a: ProductProfit, b: ProductProfit): number => {
    if (a.marginBp === null || b.marginBp === null) return a.marginBp === b.marginBp ? 0 : a.marginBp === null ? 1 : -1;
    return b.marginBp - a.marginBp;
  };

  return {
    productCount: products.length,
    withSaleCount: profits.length,
    withoutSaleCount,
    withoutCostCount: products.length - withCost.length,
    costCents,
    saleCents,
    profitCents,
    marginBp: costCents > 0 ? Math.round((profitCents * 10_000) / costCents) : null,
    topByMargin: [...profits].sort(byMarginDesc).slice(0, limit),
    topByProfit: [...profits].sort((a, b) => b.totalProfitCents - a.totalProfitCents).slice(0, limit),
    topByUnitCost: [...withCost].sort((a, b) => b.unitCostCents - a.unitCostCents).slice(0, limit),
    negativeMargin: profits.filter((p) => p.unitProfitCents < 0).sort((a, b) => a.totalProfitCents - b.totalProfitCents),
  };
}
