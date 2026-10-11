import { orderSummaryText, plural } from '../exportText';

describe('plural', () => {
  it('uses the singular only for exactly one', () => {
    expect(plural(1, 'pedido', 'pedidos')).toBe('1 pedido');
    expect(plural(0, 'pedido', 'pedidos')).toBe('0 pedidos');
    expect(plural(3, 'línea', 'líneas')).toBe('3 líneas');
  });
});

describe('orderSummaryText', () => {
  it('builds a WhatsApp-friendly summary', () => {
    const text = orderSummaryText({
      orderId: 7,
      supplierName: 'Aceros Shenzhen',
      orderDate: '2026-10-01',
      currency: 'USD',
      carrier: 'DHL',
      trackingNumber: 'JD0001',
      lines: [
        { quantity: 10, pieceType: 'tornillo', measurements: 'M8x40', unitPriceCents: 25 },
        { quantity: 2, pieceType: 'brida', measurements: 'DN50', unitPriceCents: null },
      ],
      totals: { goodsCents: 250, shippingCents: 1000, customsCents: 0, totalCents: 1250, pendingPriceCount: 1, rates: { usdMicros: 1_080_000, inrMicros: 100_000_000 } },
      paidCents: 500,
      pendingCents: 750,
    });

    expect(text).toContain('*Pedido #7* · Aceros Shenzhen · 01/10/2026');
    expect(text).toContain('• 10 tornillo M8x40 — 0,25 US$/ud = 2,50 US$');
    expect(text).toContain('• 2 brida DN50 — precio pendiente');
    expect(text).toContain('Envío: 10,00 US$');
    expect(text).not.toContain('Aduanas');
    expect(text).toContain('*Total: 12,50 US$* (provisional, 1 precio pendiente)');
    expect(text).toContain('Pendiente de pago: 7,50 US$');
    expect(text).toContain('Seguimiento: DHL JD0001');
  });
});
