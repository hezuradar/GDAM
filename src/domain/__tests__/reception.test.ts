import { missingPieces, receptionSummary } from '../reception';

const line = (id: number, quantity: number, receivedQuantity: number | null) => ({ id, quantity, receivedQuantity });

describe('missingPieces', () => {
  it('is null for a line not checked yet', () => {
    expect(missingPieces(line(1, 20, null))).toBeNull();
  });

  it('counts the pieces still missing, never below zero', () => {
    expect(missingPieces(line(1, 20, 18))).toBe(2);
    expect(missingPieces(line(1, 20, 20))).toBe(0);
    expect(missingPieces(line(1, 20, 25))).toBe(0);
  });
});

describe('receptionSummary', () => {
  it('reports an order not checked yet', () => {
    expect(receptionSummary([line(1, 10, null), line(2, 5, null)])).toEqual({
      isChecked: false,
      isComplete: false,
      completeLines: 0,
      lineCount: 2,
      missingLines: 0,
      missingPieces: 0,
    });
  });

  it('reports a complete reception', () => {
    expect(receptionSummary([line(1, 10, 10), line(2, 5, 5)])).toMatchObject({ isChecked: true, isComplete: true, completeLines: 2 });
  });

  it('reports missing pieces and lines', () => {
    expect(receptionSummary([line(1, 10, 10), line(2, 5, 3), line(3, 4, 0)])).toMatchObject({
      isChecked: true,
      isComplete: false,
      completeLines: 1,
      missingLines: 2,
      missingPieces: 6,
    });
  });

  it('treats unchecked lines as missing once the order has been checked', () => {
    expect(receptionSummary([line(1, 10, 10), line(2, 5, null)])).toMatchObject({ isComplete: false, missingLines: 1, missingPieces: 5 });
  });

  it('is not complete without lines', () => {
    expect(receptionSummary([]).isComplete).toBe(false);
  });
});
