import { distributeTotal, excludedPricedCents, goodsFromTotal } from '../distribute';

const line = (id: number, quantity: number, unitPriceCents: number | null = null) => ({ id, quantity, unitPriceCents });

describe('goodsFromTotal', () => {
  it('subtracts shipping and customs when the total includes them', () => {
    expect(goodsFromTotal(10_000, { shippingCents: 1500, customsCents: 500 }, true)).toBe(8000);
  });

  it('keeps the amount when it is only the products', () => {
    expect(goodsFromTotal(10_000, { shippingCents: 1500, customsCents: 500 }, false)).toBe(10_000);
  });
});

describe('distributeTotal per piece', () => {
  it('gives every piece the same unit price', () => {
    const result = distributeTotal([line(1, 20), line(2, 10, 300)], 6000, 'pieza');
    expect(result?.prices).toEqual([
      { lineId: 1, unitPriceCents: 200 },
      { lineId: 2, unitPriceCents: 200 },
    ]);
    expect(result).toMatchObject({ resultingCents: 6000, differenceCents: 0, excludedCount: 0 });
  });

  it('reports the rounding difference', () => {
    const result = distributeTotal([line(1, 3)], 1000, 'pieza');
    expect(result?.prices).toEqual([{ lineId: 1, unitPriceCents: 333 }]);
    expect(result).toMatchObject({ resultingCents: 999, differenceCents: -1 });
  });

  it('leaves zero-price replacements out of the split', () => {
    const result = distributeTotal([line(1, 10), line(2, 5, 0)], 1000, 'pieza');
    expect(result?.prices).toEqual([{ lineId: 1, unitPriceCents: 100 }]);
    expect(result?.excludedCount).toBe(1);
  });
});

describe('distributeTotal per line', () => {
  it('gives each line the same share, divided by its pieces', () => {
    const result = distributeTotal([line(1, 20), line(2, 10)], 6000, 'linea');
    expect(result?.prices).toEqual([
      { lineId: 1, unitPriceCents: 150 },
      { lineId: 2, unitPriceCents: 300 },
    ]);
    expect(result).toMatchObject({ resultingCents: 6000, differenceCents: 0 });
  });

  it('handles decimal quantities', () => {
    const result = distributeTotal([line(1, 2.5)], 1000, 'linea');
    expect(result?.prices).toEqual([{ lineId: 1, unitPriceCents: 400 }]);
  });
});

describe('distributeTotal edge cases', () => {
  it('returns null when every line is a replacement', () => {
    expect(distributeTotal([line(1, 3, 0)], 1000, 'pieza')).toBeNull();
  });

  it('returns null without lines', () => {
    expect(distributeTotal([], 1000, 'linea')).toBeNull();
  });

  it('returns null for a negative amount', () => {
    expect(distributeTotal([line(1, 1)], -1, 'pieza')).toBeNull();
  });

  it('allows a zero amount', () => {
    expect(distributeTotal([line(1, 4)], 0, 'pieza')?.prices).toEqual([{ lineId: 1, unitPriceCents: 0 }]);
  });
});

describe('distributeTotal with excluded lines', () => {
  it('splits only among the lines that are not excluded', () => {
    const result = distributeTotal([line(1, 10), line(2, 10, 500), line(3, 5)], 1500, 'pieza', new Set([2]));
    expect(result?.prices).toEqual([
      { lineId: 1, unitPriceCents: 100 },
      { lineId: 3, unitPriceCents: 100 },
    ]);
    expect(result?.excludedCount).toBe(1);
  });

  it('returns null when every line is excluded', () => {
    expect(distributeTotal([line(1, 10)], 1000, 'linea', new Set([1]))).toBeNull();
  });
});

describe('excludedPricedCents', () => {
  it('adds up only the excluded lines that have a price', () => {
    const lines = [line(1, 10, 200), line(2, 3, null), line(3, 4, 150)];
    expect(excludedPricedCents(lines, new Set([1, 2]))).toBe(2000);
    expect(excludedPricedCents(lines, new Set())).toBe(0);
  });
});
