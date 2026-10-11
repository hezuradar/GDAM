import { refreshFx } from './fx';
import { json, notFound, readJson } from './http';
import * as repo from './repo';
import {
  parseId,
  parseImportInput,
  parseLineInput,
  parseLinePricesInput,
  parseLinePricingInput,
  parseOrderInput,
  parsePaymentInput,
  parseSettingsInput,
  parseStatus,
  parseSupplierInput,
} from './validate';

type Handler = (ctx: { params: string[]; request: Request; db: D1Database }) => Promise<Response>;
type Route = readonly [method: string, pattern: RegExp, handler: Handler];

const ID = '(\\d+)';
const path = (template: string) => new RegExp(`^/api${template.replace(/:id/g, ID)}$`);

async function orThrow<T>(promise: Promise<T | null>, what: string): Promise<T> {
  const value = await promise;
  if (value === null) throw notFound(what);
  return value;
}

const routes: readonly Route[] = [
  // Suppliers
  ['GET', path('/suppliers'), async ({ db }) => json(await repo.listSuppliers(db))],
  ['POST', path('/suppliers'), async ({ db, request }) => json({ id: await repo.createSupplier(db, parseSupplierInput(await readJson(request))) }, 201)],
  ['GET', path('/suppliers/:id'), async ({ db, params }) => json(await orThrow(repo.getSupplier(db, parseId(params[0])), 'Proveedor'))],
  ['PUT', path('/suppliers/:id'), async ({ db, params, request }) => {
    await repo.updateSupplier(db, parseId(params[0]), parseSupplierInput(await readJson(request)));
    return json({ ok: true });
  }],
  ['DELETE', path('/suppliers/:id'), async ({ db, params }) => {
    await repo.deleteSupplier(db, parseId(params[0]));
    return json({ ok: true });
  }],

  // Orders
  ['GET', path('/orders'), async ({ db }) => {
    const [orders, lines, payments, suppliers, settings] = await Promise.all([
      repo.listOrders(db), repo.listAllLinesForList(db), repo.listAllPaymentsForList(db), repo.listSuppliers(db), repo.getSettings(db),
    ]);
    return json({ orders, lines, payments, suppliers, settings });
  }],
  ['POST', path('/orders'), async ({ db, request }) => json({ id: await repo.createOrder(db, parseOrderInput(await readJson(request))) }, 201)],
  ['GET', path('/orders/:id'), async ({ db, params }) => {
    const id = parseId(params[0]);
    const order = await orThrow(repo.getOrder(db, id), 'Pedido');
    const [supplier, lines, payments, settings] = await Promise.all([
      repo.getSupplier(db, order.supplierId), repo.listLines(db, id), repo.listPayments(db, id), repo.getSettings(db),
    ]);
    return json({ order, supplier, lines, payments, settings });
  }],
  ['PUT', path('/orders/:id'), async ({ db, params, request }) => {
    await repo.updateOrder(db, parseId(params[0]), parseOrderInput(await readJson(request)));
    return json({ ok: true });
  }],
  ['PATCH', path('/orders/:id/status'), async ({ db, params, request }) => {
    await repo.updateOrderStatus(db, parseId(params[0]), parseStatus(await readJson(request)));
    return json({ ok: true });
  }],
  ['DELETE', path('/orders/:id'), async ({ db, params }) => {
    await repo.deleteOrder(db, parseId(params[0]));
    return json({ ok: true });
  }],

  // Lines
  ['POST', path('/orders/:id/lines'), async ({ db, params, request }) =>
    json({ id: await repo.createLine(db, parseId(params[0]), parseLineInput(await readJson(request))) }, 201)],
  ['POST', path('/orders/:id/lines/import'), async ({ db, params, request }) =>
    json({ count: await repo.importLines(db, parseId(params[0]), parseImportInput(await readJson(request))) }, 201)],
  ['PUT', path('/orders/:id/line-prices'), async ({ db, params, request }) =>
    json({ count: await repo.setLinePrices(db, parseId(params[0]), parseLinePricesInput(await readJson(request))) })],
  ['GET', path('/lines/:id'), async ({ db, params }) => json(await orThrow(repo.getLine(db, parseId(params[0])), 'Línea'))],
  ['PUT', path('/lines/:id'), async ({ db, params, request }) => {
    await repo.updateLine(db, parseId(params[0]), parseLineInput(await readJson(request)));
    return json({ ok: true });
  }],
  ['GET', path('/products'), async ({ db }) => {
    const [products, settings] = await Promise.all([repo.listProducts(db), repo.getSettings(db)]);
    return json({ products, settings });
  }],
  ['PATCH', path('/lines/:id/pricing'), async ({ db, params, request }) => {
    await repo.updateLinePricing(db, parseId(params[0]), parseLinePricingInput(await readJson(request)));
    return json({ ok: true });
  }],
  ['DELETE', path('/lines/:id'), async ({ db, params }) => {
    await repo.deleteLine(db, parseId(params[0]));
    return json({ ok: true });
  }],

  // Payments
  ['POST', path('/orders/:id/payments'), async ({ db, params, request }) =>
    json({ id: await repo.createPayment(db, parseId(params[0]), parsePaymentInput(await readJson(request))) }, 201)],
  ['GET', path('/payments/:id'), async ({ db, params }) => json(await orThrow(repo.getPayment(db, parseId(params[0])), 'Pago'))],
  ['PUT', path('/payments/:id'), async ({ db, params, request }) => {
    await repo.updatePayment(db, parseId(params[0]), parsePaymentInput(await readJson(request)));
    return json({ ok: true });
  }],
  ['DELETE', path('/payments/:id'), async ({ db, params }) => {
    await repo.deletePayment(db, parseId(params[0]));
    return json({ ok: true });
  }],

  // Settings, exchange rate, backup
  ['GET', path('/settings'), async ({ db }) => json(await repo.getSettings(db))],
  ['PUT', path('/settings'), async ({ db, request }) => {
    await repo.saveSettings(db, parseSettingsInput(await readJson(request)));
    return json(await repo.getSettings(db));
  }],
  ['POST', path('/fx/refresh'), async ({ db, request }) => {
    await readJson(request); // enforces same-origin JSON (CSRF protection)
    await refreshFx(db);
    return json(await repo.getSettings(db));
  }],
  ['GET', path('/backup'), async ({ db }) => json(await repo.exportBackup(db))],
];

export function matchRoute(method: string, pathname: string): { handler: Handler; params: string[] } | 'method' | null {
  let pathMatched = false;
  for (const [routeMethod, pattern, handler] of routes) {
    const match = pattern.exec(pathname);
    if (!match) continue;
    pathMatched = true;
    if (routeMethod === method) return { handler, params: match.slice(1) };
  }
  return pathMatched ? 'method' : null;
}
