import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { OrderSort } from '@/domain/orderFilters';
import type { Currency, OrderStatus, PaymentMethod, PaymentStatus } from '@/domain/types';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  enviado: 'Enviado',
  recibido: 'Recibido',
  cancelado: 'Cancelado',
};

export const ORDER_STATUS_ICON: Record<OrderStatus, IconName> = {
  borrador: 'create-outline',
  confirmado: 'checkmark-circle-outline',
  enviado: 'airplane-outline',
  recibido: 'cube-outline',
  cancelado: 'close-circle-outline',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  sin_pagar: 'Sin pagar',
  parcial: 'Pago parcial',
  pagado: 'Pagado',
};

export const PAYMENT_STATUS_ICON: Record<PaymentStatus, IconName> = {
  sin_pagar: 'alert-circle-outline',
  parcial: 'pie-chart-outline',
  pagado: 'checkmark-done-circle-outline',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  efectivo: 'Efectivo',
  paypal: 'PayPal',
  otro: 'Otro',
};

export const CURRENCY_LABEL: Record<Currency, string> = { EUR: 'Euros (€)', USD: 'Dólares (US$)', INR: 'Rupias (₹)' };

export const SORT_LABEL: Record<OrderSort, string> = {
  fecha_desc: 'Más recientes',
  fecha_asc: 'Más antiguos',
  pendiente_desc: 'Más pendiente de pago',
};
