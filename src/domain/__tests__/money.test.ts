import { convert, currencySymbol, displayAmount, formatMoney, formatRate, marketRates, parseAmount, parseRate, withUsdRate } from '../money';

describe('parseAmount', () => {
  it.each([
    ['4,20', 420],
    ['4.20', 420],
    ['4.2', 420],
    ['1.234,50', 123450],
    ['1,234.50', 123450],
    ['1.000', 100000],
    ['1234', 123400],
    ['  12 € ', 1200],
    ['$3.5', 350],
    ['0,005', 1],
  ])('parses %p as %p cents', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1,2,3,4x'])('returns null for invalid input %p', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('formatMoney', () => {
  it('formats euros in Spanish style', () => {
    expect(formatMoney(123450, 'EUR')).toBe('1.234,50 €');
  });

  it('formats dollars with an explicit US$ suffix', () => {
    expect(formatMoney(5, 'USD')).toBe('0,05 US$');
  });

  it('formats negative amounts', () => {
    expect(formatMoney(-1999, 'EUR')).toBe('-19,99 €');
  });
});

describe('convert', () => {
  const rate = { usdMicros: 1_080_000, inrMicros: 90_000_000 }; // 1 EUR = 1.08 USD = 90 INR

  it('returns the same amount for the same currency', () => {
    expect(convert(1000, 'EUR', 'EUR', rate)).toBe(1000);
  });

  it('converts EUR to USD', () => {
    expect(convert(10000, 'EUR', 'USD', rate)).toBe(10800);
  });

  it('converts USD to EUR with rounding', () => {
    expect(convert(10000, 'USD', 'EUR', rate)).toBe(9259);
  });

  it('throws on a non-positive rate when conversion is needed', () => {
    expect(() => convert(100, 'USD', 'EUR', { usdMicros: 0, inrMicros: 0 })).toThrow();
  });
});

describe('displayAmount', () => {
  const rate = { usdMicros: 1_100_000, inrMicros: 100_000_000 };
  it('keeps the original amount and currency when no display currency is chosen', () => {
    expect(displayAmount(1100, 'USD', null, rate)).toEqual({ cents: 1100, currency: 'USD' });
  });
  it('converts to the chosen display currency', () => {
    expect(displayAmount(1100, 'USD', 'EUR', rate)).toEqual({ cents: 1000, currency: 'EUR' });
    expect(displayAmount(1000, 'EUR', 'USD', rate)).toEqual({ cents: 1100, currency: 'USD' });
  });
  it('does not touch amounts already in the display currency', () => {
    expect(displayAmount(1234, 'EUR', 'EUR', rate)).toEqual({ cents: 1234, currency: 'EUR' });
  });
});

describe('rates', () => {
  it('parses a rate with comma decimals', () => {
    expect(parseRate('1,0825')).toBe(1_082_500);
  });

  it('rejects zero and garbage', () => {
    expect(parseRate('0')).toBeNull();
    expect(parseRate('x')).toBeNull();
  });

  it('formats a rate trimming trailing zeros', () => {
    expect(formatRate(1_080_000)).toBe('1,08');
  });
});

describe('Indian rupee', () => {
  const rates = { usdMicros: 1_100_000, inrMicros: 100_000_000 }; // 1 € = 1,10 US$ = 100 ₹

  it('converts EUR and INR both ways', () => {
    expect(convert(1000, 'EUR', 'INR', rates)).toBe(100_000);
    expect(convert(100_000, 'INR', 'EUR', rates)).toBe(1000);
  });

  it('converts INR to USD through the euro', () => {
    expect(convert(100_000, 'INR', 'USD', rates)).toBe(1100);
    expect(convert(1100, 'USD', 'INR', rates)).toBe(100_000);
  });

  it('formats rupee amounts with the ₹ symbol', () => {
    expect(formatMoney(123_450, 'INR')).toBe('1.234,50 ₹');
    expect(currencySymbol('INR')).toBe('₹');
  });

  it('parses amounts written with rupee marks', () => {
    expect(parseAmount('₹ 250')).toBe(25_000);
    expect(parseAmount('Rs 1.500')).toBe(150_000);
  });

  it('builds market rates from the settings and overrides only the dollar rate', () => {
    const market = marketRates({ fxRateMicros: 1_100_000, inrRateMicros: 100_000_000 });
    expect(market).toEqual(rates);
    expect(withUsdRate(market, 1_200_000)).toEqual({ usdMicros: 1_200_000, inrMicros: 100_000_000 });
    expect(withUsdRate(market, null)).toBe(market);
  });

  it('throws when the rupee rate is missing', () => {
    expect(() => convert(100, 'INR', 'EUR', { usdMicros: 1_100_000, inrMicros: 0 })).toThrow();
  });
});
