import { canImport, parseWhatsAppMessage, parseWhatsAppText, toImportableLine } from '../whatsappParser';

describe('English and Spanish formats', () => {
  it.each([
    ['100 pcs Hex bolt M8x40 $0.05 each', { quantity: 100, pieceType: 'Hex bolt', measurements: 'M8x40', unitPriceCents: 5, priceCurrency: 'USD' }],
    ['Hex bolt M8x40 - 100 pcs @ 0.05 USD', { quantity: 100, pieceType: 'Hex bolt', measurements: 'M8x40', unitPriceCents: 5, priceCurrency: 'USD' }],
    ['Tornillo M8x40 x 50 uds a 0,10€', { quantity: 50, pieceType: 'Tornillo', measurements: 'M8x40', unitPriceCents: 10, priceCurrency: 'EUR' }],
    ['Qty: 20 Flange DN50 unit price 3.20 EUR', { quantity: 20, pieceType: 'Flange', measurements: 'DN50', unitPriceCents: 320, priceCurrency: 'EUR' }],
    ['30 units steel plate 200x300x5 at 12.50 dollars per piece', { quantity: 30, pieceType: 'steel plate', measurements: '200x300x5', unitPriceCents: 1250, priceCurrency: 'USD' }],
    ['Cantidad: 8 brida DN80 precio unitario 6,40 €', { quantity: 8, pieceType: 'brida', measurements: 'DN80', unitPriceCents: 640, priceCurrency: 'EUR' }],
    ['tubo 25x2 L=1000 12 piezas 4,20 € c/u', { quantity: 12, pieceType: 'tubo', measurements: '25x2 L=1000', unitPriceCents: 420, priceCurrency: 'EUR' }],
  ])('%p', (text, expected) => {
    const [line] = parseWhatsAppText(text);
    expect(line).toMatchObject({ ...expected, issues: [] });
  });
});

describe('parseWhatsAppMessage', () => {
  it('separates product lines, shipping and totals', () => {
    const message = parseWhatsAppMessage(
      'Hi, here is the order\n10 tornillo M8x40 0,25€\nEnvío: 25 €\nTotal: 27,50 €',
    );
    expect(message.lines.map((l) => l.pieceType)).toEqual(['Hi, here is the order', 'tornillo']);
    expect(message.shipping).toEqual({ cents: 2500, currency: 'EUR', rawText: 'Envío: 25 €' });
    expect(message.ignored).toEqual(['Total: 27,50 €']);
  });

  it.each([
    ['Shipping cost: USD 40.50', 4050, 'USD'],
    ['Freight 35$', 3500, 'USD'],
    ['Gastos de envío 18,90 euros', 1890, 'EUR'],
    ['Portes: 12', 1200, null],
    ['Delivery fee $15', 1500, 'USD'],
  ])('detects shipping in %p', (text, cents, currency) => {
    expect(parseWhatsAppMessage(text).shipping).toEqual({ cents, currency, rawText: text });
  });

  it('ignores shipping lines without an amount and keeps product lines that mention shipping', () => {
    const message = parseWhatsAppMessage('Shipping included\n10 cajas de envío 30x20');
    expect(message.shipping).toBeNull();
    expect(message.ignored).toEqual(['Shipping included']);
    expect(message.lines).toHaveLength(1);
    expect(message.lines[0].quantity).toBe(10);
  });

  it('keeps only the first shipping amount and reports the rest as ignored', () => {
    const message = parseWhatsAppMessage('Envío 20€\nShipping $30');
    expect(message.shipping?.cents).toBe(2000);
    expect(message.ignored).toEqual(['Shipping $30']);
  });
});

describe('toImportableLine', () => {
  const RATE = 1_100_000;

  it('keeps prices already in the order currency', () => {
    const [parsed] = parseWhatsAppText('10 tornillo M8x40 0,25€');
    expect(toImportableLine(parsed, 'EUR', RATE)).toEqual({
      quantity: 10,
      pieceType: 'tornillo',
      measurements: 'M8x40',
      unitPriceCents: 25,
      rawText: '10 tornillo M8x40 0,25€',
    });
  });

  it('converts prices given in another currency', () => {
    const [parsed] = parseWhatsAppText('2 placa 200x300 $11.00');
    expect(toImportableLine(parsed, 'EUR', RATE).unitPriceCents).toBe(1000);
  });

  it('uses the raw text as piece type when none was detected', () => {
    const [parsed] = parseWhatsAppText('Hola, te paso el pedido');
    expect(toImportableLine(parsed, 'EUR', RATE).pieceType).toBe('Hola, te paso el pedido');
  });

  it('cannot import lines with invalid quantity', () => {
    expect(canImport(parseWhatsAppText('0 tornillo M6')[0])).toBe(false);
    expect(canImport(parseWhatsAppText('1 tornillo M6')[0])).toBe(true);
  });
});

describe('parseWhatsAppText', () => {
  it('parses quantity, piece type and measurements without price', () => {
    const [line] = parseWhatsAppText('10 tornillo M8x40');
    expect(line).toMatchObject({
      quantity: 10,
      pieceType: 'tornillo',
      measurements: 'M8x40',
      unitPriceCents: null,
      issues: [],
    });
  });

  it('accepts "x" after the quantity and a decimal trailing price', () => {
    const [line] = parseWhatsAppText('5 x placa 200x300x5 3.50');
    expect(line).toMatchObject({
      quantity: 5,
      pieceType: 'placa',
      measurements: '200x300x5',
      unitPriceCents: 350,
      priceCurrency: null,
    });
  });

  it('parses "pcs", multi-token measurements and "@ price€"', () => {
    const [line] = parseWhatsAppText('12 pcs tubo 25x2 L=1000 @ 4,20€');
    expect(line).toMatchObject({
      quantity: 12,
      pieceType: 'tubo',
      measurements: '25x2 L=1000',
      unitPriceCents: 420,
      priceCurrency: 'EUR',
    });
  });

  it('keeps alphanumeric measurements like DN50', () => {
    const [line] = parseWhatsAppText('3 brida DN50');
    expect(line).toMatchObject({ quantity: 3, pieceType: 'brida', measurements: 'DN50' });
  });

  it('supports multi-word piece types and dollar prices', () => {
    const [line] = parseWhatsAppText('4 uds tubo acero inox 40x40x2 $12.5');
    expect(line).toMatchObject({
      quantity: 4,
      pieceType: 'tubo acero inox',
      measurements: '40x40x2',
      unitPriceCents: 1250,
      priceCurrency: 'USD',
    });
  });

  it('strips bullets, emojis and WhatsApp copy prefixes', () => {
    const text = '[10/10/26, 17:43] Juan Proveedor: • 2 codo 90º Ø32\n👉 6× manguito Ø32';
    const lines = parseWhatsAppText(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ quantity: 2, pieceType: 'codo', measurements: '90º Ø32' });
    expect(lines[1]).toMatchObject({ quantity: 6, pieceType: 'manguito', measurements: 'Ø32' });
  });

  it('ignores blank lines', () => {
    expect(parseWhatsAppText('\n  \n10 tuerca M8\n\n')).toHaveLength(1);
  });

  it('flags lines without quantity for review', () => {
    const [line] = parseWhatsAppText('Hola, te paso el pedido');
    expect(line.quantity).toBe(1);
    expect(line.issues).toContain('Sin cantidad');
  });

  it('flags a bare trailing integer as a possible price', () => {
    const [line] = parseWhatsAppText('10 tornillo M8 40');
    expect(line.unitPriceCents).toBeNull();
    expect(line.measurements).toBe('M8 40');
    expect(line.issues).toContain('¿El último número es un precio?');
  });

  it('accepts decimal quantities with comma', () => {
    const [line] = parseWhatsAppText('2,5 cable 3x1,5');
    expect(line.quantity).toBe(2.5);
    expect(line.measurements).toBe('3x1,5');
  });

  it('does not treat a measurement prefix as quantity', () => {
    const [line] = parseWhatsAppText('200x300 placa');
    expect(line.issues).toContain('Sin cantidad');
  });

  it('flags lines with zero quantity', () => {
    const [line] = parseWhatsAppText('0 tornillo M6');
    expect(line.issues).toContain('Cantidad no válida');
  });

  it('keeps the raw text', () => {
    const [line] = parseWhatsAppText('  10 tornillo M8x40  ');
    expect(line.rawText).toBe('10 tornillo M8x40');
  });

  it('handles a large paste quickly', () => {
    const text = Array.from({ length: 500 }, (_, i) => `${i + 1} tornillo M8x${i} @ 0,10€`).join('\n');
    const start = Date.now();
    const lines = parseWhatsAppText(text);
    expect(lines).toHaveLength(500);
    expect(Date.now() - start).toBeLessThan(500);
  });
});
