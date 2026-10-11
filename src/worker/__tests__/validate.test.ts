import { HttpError } from '../http';
import {
  parseId,
  parseImportInput,
  parseLineInput,
  parseLinePricingInput,
  parseOrderInput,
  parsePaymentInput,
  parseSettingsInput,
  parseSupplierInput,
} from '../validate';

const validOrder = {
  supplierId: 3,
  orderDate: '2026-10-02',
  status: 'confirmado',
  currency: 'USD',
  shippingCents: 4000,
  shippingCurrency: 'USD',
  customsCents: 0,
  customsCurrency: 'EUR',
  fxRateMicros: null,
  carrier: ' DHL ',
  trackingNumber: 'JD1',
  notes: '',
};

const expectBadRequest = (fn: () => unknown, fragment: string) => {
  try {
    fn();
    throw new Error('should have thrown');
  } catch (e: unknown) {
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(400);
    expect((e as HttpError).message).toContain(fragment);
  }
};

describe('parseId', () => {
  it('accepts positive integers', () => expect(parseId('42')).toBe(42));
  it.each(['0', '-1', 'abc', '1.5', '', undefined, '1234567890'])('rejects %p', (raw) => {
    expectBadRequest(() => parseId(raw), 'Identificador');
  });
});

describe('parseSupplierInput', () => {
  it('trims and fills defaults', () => {
    expect(parseSupplierInput({ name: ' Aceros ' })).toEqual({ name: 'Aceros', whatsapp: '', notes: '' });
  });
  it('requires a name', () => expectBadRequest(() => parseSupplierInput({ name: '  ' }), 'name'));
  it('rejects non-objects', () => expectBadRequest(() => parseSupplierInput([]), 'objeto'));
  it('limits lengths', () => expectBadRequest(() => parseSupplierInput({ name: 'x'.repeat(81) }), 'largo'));
});

describe('parseOrderInput', () => {
  it('accepts a valid order', () => {
    expect(parseOrderInput(validOrder)).toMatchObject({ supplierId: 3, carrier: 'DHL', fxRateMicros: null });
  });
  it('rejects an invalid status', () => expectBadRequest(() => parseOrderInput({ ...validOrder, status: 'x' }), 'status'));
  it('rejects an invalid date', () => expectBadRequest(() => parseOrderInput({ ...validOrder, orderDate: '2026-02-30' }), 'orderDate'));
  it('rejects negative amounts', () => expectBadRequest(() => parseOrderInput({ ...validOrder, shippingCents: -1 }), 'shippingCents'));
  it('rejects absurd rates', () => expectBadRequest(() => parseOrderInput({ ...validOrder, fxRateMicros: 99 }), 'fxRateMicros'));
});

describe('parseLineInput / parseImportInput', () => {
  const line = { quantity: 2.5, pieceType: 'tubo', measurements: '25x2', unitPriceCents: null, rawText: '2,5 tubo 25x2' };

  it('accepts decimal quantities and pending prices', () => {
    expect(parseLineInput(line)).toEqual(line);
  });
  it('rejects zero quantity', () => expectBadRequest(() => parseLineInput({ ...line, quantity: 0 }), 'quantity'));
  it('requires a piece type', () => expectBadRequest(() => parseLineInput({ ...line, pieceType: '' }), 'pieceType'));
  it('validates every imported line', () => {
    expectBadRequest(() => parseImportInput({ lines: [line, { ...line, quantity: -1 }], replaceExisting: false }), 'quantity');
  });
  it('rejects empty imports', () => expectBadRequest(() => parseImportInput({ lines: [], replaceExisting: false }), 'lines'));
  it('requires replaceExisting', () => expectBadRequest(() => parseImportInput({ lines: [line] }), 'replaceExisting'));
});

describe('parsePaymentInput', () => {
  const payment = { amountCents: 3000, currency: 'EUR', paidOn: '2026-10-10', method: 'transferencia', fxRateMicros: 1_100_000, note: '' };
  it('accepts a valid payment', () => expect(parsePaymentInput(payment)).toEqual(payment));
  it('rejects zero amounts', () => expectBadRequest(() => parsePaymentInput({ ...payment, amountCents: 0 }), 'amountCents'));
  it('rejects unknown methods', () => expectBadRequest(() => parsePaymentInput({ ...payment, method: 'bitcoin' }), 'method'));
});

describe('parseSettingsInput', () => {
  it('accepts automatic mode without manual rate', () => {
    expect(parseSettingsInput({ defaultCurrency: 'USD', fxAuto: true, manualFxRateMicros: null })).toEqual({
      defaultCurrency: 'USD',
      fxAuto: true,
      manualFxRateMicros: null,
    });
  });
  it('requires a boolean fxAuto', () => expectBadRequest(() => parseSettingsInput({ defaultCurrency: 'USD', fxAuto: 'si' }), 'fxAuto'));
});

describe('parseLinePricingInput', () => {
  const base = { salePriceCents: null, saleCurrency: null, marginBp: 2500 };
  it('accepts a theoretical value with its currency', () => {
    expect(parseLinePricingInput({ ...base, theoreticalCostCents: 20000, theoreticalCurrency: 'EUR' })).toEqual({
      ...base,
      theoreticalCostCents: 20000,
      theoreticalCurrency: 'EUR',
    });
  });
  it('treats a missing theoretical value as none', () => {
    expect(parseLinePricingInput(base)).toEqual({ ...base, theoreticalCostCents: null, theoreticalCurrency: null });
  });
  it('drops the currency when there is no theoretical value', () => {
    expect(parseLinePricingInput({ ...base, theoreticalCostCents: null, theoreticalCurrency: 'USD' }).theoreticalCurrency).toBeNull();
  });
  it('requires a currency with a theoretical value', () =>
    expectBadRequest(() => parseLinePricingInput({ ...base, theoreticalCostCents: 100, theoreticalCurrency: null }), 'theoreticalCurrency'));
  it('rejects a negative theoretical value', () =>
    expectBadRequest(() => parseLinePricingInput({ ...base, theoreticalCostCents: -1, theoreticalCurrency: 'EUR' }), 'theoreticalCostCents'));
});
