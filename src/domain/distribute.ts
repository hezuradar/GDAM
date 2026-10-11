/**
 * Splits an order amount among its lines when the supplier only gives a total.
 * Zero-price lines are replacements of defective parts and keep their 0.
 */

export const DISTRIBUTION_MODES = ['pieza', 'linea'] as const;
/** "pieza": every piece gets the same unit price. "linea": every line gets the same share. */
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number];

export interface DistributableLine {
  readonly id: number;
  readonly quantity: number;
  readonly unitPriceCents: number | null;
}

export interface LinePrice {
  readonly lineId: number;
  readonly unitPriceCents: number;
}

export interface Distribution {
  readonly prices: readonly LinePrice[];
  /** Amount that was split (products only, order currency). */
  readonly goodsCents: number;
  /** What the lines add up to after rounding unit prices to cents. */
  readonly resultingCents: number;
  readonly differenceCents: number;
  /** Lines left out: zero-price replacements and the ones the user excluded. */
  readonly excludedCount: number;
}

export function isReplacementLine(line: Pick<DistributableLine, 'unitPriceCents'>): boolean {
  return line.unitPriceCents === 0;
}

/** Products amount from a typed total: shipping and customs are taken off when the total includes them. */
export function goodsFromTotal(
  totalCents: number,
  extras: { readonly shippingCents: number; readonly customsCents: number },
  includesExtras: boolean,
): number {
  return includesExtras ? totalCents - extras.shippingCents - extras.customsCents : totalCents;
}

/** What the excluded lines that already have a price add up to (taken off a total that covers them). */
export function excludedPricedCents(lines: readonly DistributableLine[], excludedLineIds: ReadonlySet<number>): number {
  return lines.reduce(
    (sum, line) =>
      excludedLineIds.has(line.id) && line.unitPriceCents !== null ? sum + Math.round(line.quantity * line.unitPriceCents) : sum,
    0,
  );
}

/**
 * Unit prices for the eligible lines, or null when there is nothing to split or the amount is negative.
 * Excluded lines keep whatever price they have.
 */
export function distributeTotal(
  lines: readonly DistributableLine[],
  goodsCents: number,
  mode: DistributionMode,
  excludedLineIds: ReadonlySet<number> = new Set(),
): Distribution | null {
  const eligible = lines.filter((line) => !isReplacementLine(line) && line.quantity > 0 && !excludedLineIds.has(line.id));
  if (eligible.length === 0 || goodsCents < 0) return null;

  const totalPieces = eligible.reduce((sum, line) => sum + line.quantity, 0);
  const sharePerLine = goodsCents / eligible.length;
  const prices = eligible.map((line) => ({
    lineId: line.id,
    unitPriceCents: Math.round(mode === 'pieza' ? goodsCents / totalPieces : sharePerLine / line.quantity),
  }));
  const resultingCents = eligible.reduce((sum, line, i) => sum + Math.round(line.quantity * prices[i].unitPriceCents), 0);

  return {
    prices,
    goodsCents,
    resultingCents,
    differenceCents: resultingCents - goodsCents,
    excludedCount: lines.length - eligible.length,
  };
}
