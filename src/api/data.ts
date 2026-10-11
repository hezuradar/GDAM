import type { ListLine, ListPayment } from '@/domain/orderList';
import type { Currency, Order, OrderLine, OrderStatus, Payment, Supplier } from '@/domain/types';
import { apiRequest, getOrNull } from './client';

/** Typed data access through the API. Same operations the on-device repositories used to offer. */

export interface AppSettings {
  /** "1 EUR = X USD" * 1e6 */
  readonly fxRateMicros: number;
  readonly defaultCurrency: Currency;
  readonly fxAuto: boolean;
  readonly fxSource: string | null;
  readonly fxAsOf: string | null;
  readonly fxUpdatedAt: string | null;
}

export type SupplierInput = Omit<Supplier, 'id'>;
export type OrderInput = Omit<Order, 'id'>;
export type LineInput = Pick<OrderLine, 'quantity' | 'pieceType' | 'measurements' | 'unitPriceCents' | 'rawText'>;
export type PaymentInput = Omit<Payment, 'id' | 'orderId'>;

export interface OrderListRaw {
  readonly orders: readonly Order[];
  readonly lines: readonly ListLine[];
  readonly payments: readonly ListPayment[];
  readonly suppliers: readonly Supplier[];
  readonly settings: AppSettings;
}

export interface OrderDetailRaw {
  readonly order: Order;
  readonly supplier: Supplier | null;
  readonly lines: readonly OrderLine[];
  readonly payments: readonly Payment[];
  readonly settings: AppSettings;
}

type Created = { id: number };

// Session
export interface SessionState {
  readonly authenticated: boolean;
  /** false when the server has no APP_PASSWORD yet (the API is closed). */
  readonly configured: boolean;
}
export const getSession = () => apiRequest<SessionState>('GET', '/session');
export const login = (password: string) => apiRequest('POST', '/login', { password });
export const logout = () => apiRequest('POST', '/logout', {});

// Suppliers
export const listSuppliers = () => apiRequest<Supplier[]>('GET', '/suppliers');
export const getSupplier = (id: number) => getOrNull<Supplier>(`/suppliers/${id}`);
export async function saveSupplier(input: SupplierInput, id: number | null): Promise<number> {
  if (id === null) return (await apiRequest<Created>('POST', '/suppliers', input)).id;
  await apiRequest('PUT', `/suppliers/${id}`, input);
  return id;
}
/** The server refuses (409) when the supplier still has orders. */
export const deleteSupplier = (id: number) => apiRequest('DELETE', `/suppliers/${id}`);

// Orders
export const loadOrderListRaw = () => apiRequest<OrderListRaw>('GET', '/orders');
export const getOrderDetailRaw = (id: number) => getOrNull<OrderDetailRaw>(`/orders/${id}`);
export async function getOrder(id: number): Promise<Order | null> {
  return (await getOrderDetailRaw(id))?.order ?? null;
}
/** When the currency changes, the server converts line prices in the same transaction. */
export async function saveOrder(input: OrderInput, id: number | null): Promise<number> {
  if (id === null) return (await apiRequest<Created>('POST', '/orders', input)).id;
  await apiRequest('PUT', `/orders/${id}`, input);
  return id;
}
export const updateOrderStatus = (id: number, status: OrderStatus) => apiRequest('PATCH', `/orders/${id}/status`, { status });
export const deleteOrder = (id: number) => apiRequest('DELETE', `/orders/${id}`);

// Lines
export const getLine = (id: number) => getOrNull<OrderLine>(`/lines/${id}`);
export async function saveLine(orderId: number, input: LineInput, id: number | null): Promise<number> {
  if (id === null) return (await apiRequest<Created>('POST', `/orders/${orderId}/lines`, input)).id;
  await apiRequest('PUT', `/lines/${id}`, input);
  return id;
}
export const deleteLine = (id: number) => apiRequest('DELETE', `/lines/${id}`);
/** Adds (or replaces) lines atomically on the server. */
export const importLines = (orderId: number, lines: readonly LineInput[], replaceExisting: boolean) =>
  apiRequest<{ count: number }>('POST', `/orders/${orderId}/lines/import`, { lines, replaceExisting });

// Payments
export const getPayment = (id: number) => getOrNull<Payment>(`/payments/${id}`);
export async function savePayment(orderId: number, input: PaymentInput, id: number | null): Promise<number> {
  if (id === null) return (await apiRequest<Created>('POST', `/orders/${orderId}/payments`, input)).id;
  await apiRequest('PUT', `/payments/${id}`, input);
  return id;
}
export const deletePayment = (id: number) => apiRequest('DELETE', `/payments/${id}`);

// Settings, exchange rate, backup
export const getSettings = () => apiRequest<AppSettings>('GET', '/settings');
export const saveSettings = (input: { defaultCurrency: Currency; fxAuto: boolean; manualFxRateMicros: number | null }) =>
  apiRequest<AppSettings>('PUT', '/settings', input);
/** Downloads the current market EUR/USD rate on the server and returns the updated settings. */
export const refreshFxRate = () => apiRequest<AppSettings>('POST', '/fx/refresh', {});
export async function exportBackupJson(): Promise<string> {
  return JSON.stringify(await apiRequest<unknown>('GET', '/backup'), null, 1);
}
