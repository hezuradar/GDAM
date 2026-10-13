/** Reception check of an order: which pieces actually arrived. */

export interface ReceptionLine {
  readonly id: number;
  readonly quantity: number;
  /** null = not checked yet. */
  readonly receivedQuantity: number | null;
}

export interface ReceptionSummary {
  /** At least one line has been checked. */
  readonly isChecked: boolean;
  /** Every line arrived complete. */
  readonly isComplete: boolean;
  readonly completeLines: number;
  readonly lineCount: number;
  /** Lines with missing pieces (unchecked lines count once the order has been checked). */
  readonly missingLines: number;
  readonly missingPieces: number;
}

/** Pieces still missing on a checked line (never negative); null when the line was not checked. */
export function missingPieces(line: ReceptionLine): number | null {
  return line.receivedQuantity === null ? null : Math.max(0, line.quantity - line.receivedQuantity);
}

export function receptionSummary(lines: readonly ReceptionLine[]): ReceptionSummary {
  const isChecked = lines.some((l) => l.receivedQuantity !== null);
  const missing = lines.map((l) => missingPieces(l) ?? (isChecked ? l.quantity : 0));
  const completeLines = lines.filter((l, i) => l.receivedQuantity !== null && missing[i] === 0).length;
  const missingLines = missing.filter((m) => m > 0).length;
  return {
    isChecked,
    isComplete: lines.length > 0 && completeLines === lines.length,
    completeLines,
    lineCount: lines.length,
    missingLines,
    missingPieces: missing.reduce((sum, m) => sum + m, 0),
  };
}
