import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { shareText } from '@/lib/share';
import { LinesList, PaymentsList, TotalsCard } from '@/components/orders/OrderSections';
import { announce, confirmDestructive, showError } from '@/components/ui/alerts';
import { Avatar, DisplayCurrencySwitch, StatusStepper } from '@/components/ui/Visuals';
import { setDisplayCurrency, useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import { Button, ButtonRow, IconButton } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, EmptyState, ErrorView, FormScroll, InfoRow, LoadingView, PressableRow, SectionHeader } from '@/components/ui/Layout';
import { deleteOrder, updateOrderStatus } from '@/api/data';
import { formatDate, orderSummaryText, plural } from '@/domain/exportText';
import { ORDER_STATUSES, type OrderStatus } from '@/domain/types';
import { useOrderDetail, type OrderDetail } from '@/hooks/useOrderDetail';
import { ORDER_STATUS_ICON, ORDER_STATUS_LABEL } from '@/i18n/es';
import { goBack, parseIdParam, trackingUrl, whatsappUrl } from '@/lib/params';
import { spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

function summaryFor(detail: OrderDetail): string {
  return orderSummaryText({
    orderId: detail.order.id,
    supplierName: detail.supplier?.name ?? '',
    orderDate: detail.order.orderDate,
    currency: detail.order.currency,
    carrier: detail.order.carrier,
    trackingNumber: detail.order.trackingNumber,
    lines: detail.lines,
    totals: detail.totals,
    paidCents: detail.payment.paidCents,
    pendingCents: detail.payment.pendingCents,
  });
}

export default function OrderDetailScreen() {
  const id = parseIdParam(useLocalSearchParams<{ id: string }>().id) ?? 0;
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useOrderDetail(id);
  const displayCurrency = useDisplayCurrency();

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data && loading) return <LoadingView />;
  if (!data) return <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;

  const { order, supplier, lines, payments, totals, payment } = data;
  const go = (pathname: '/pedido/linea' | '/pedido/pago' | '/pedido/importar' | '/pedido/editar', extra: Record<string, number> = {}) =>
    router.push({ pathname, params: { orderId: order.id, ...extra } });

  const changeStatus = (status: OrderStatus) =>
    updateOrderStatus(order.id, status)
      .then(() => announce(`Estado: ${ORDER_STATUS_LABEL[status]}`))
      .then(reload)
      .catch((e: unknown) => showError('No se pudo cambiar el estado', e));

  const sendSummary = async () => {
    const text = summaryFor(data);
    const url = supplier ? whatsappUrl(supplier.whatsapp, text) : null;
    try {
      if (url) await Linking.openURL(url);
      else await shareText(text, `Pedido #${order.id}`);
    } catch (e: unknown) {
      showError('No se pudo compartir', e);
    }
  };

  const copyTracking = async () => {
    try {
      await Clipboard.setStringAsync(order.trackingNumber);
      announce('Número de seguimiento copiado');
    } catch (e: unknown) {
      showError('No se pudo copiar', e);
    }
  };

  const handleDelete = () =>
    confirmDestructive({
      title: `¿Eliminar el pedido #${order.id}?`,
      message: `Se borrarán también ${plural(lines.length, 'línea', 'líneas')} y ${plural(payments.length, 'pago', 'pagos')}. No se puede deshacer.`,
      confirmLabel: 'Eliminar pedido',
      onConfirm: () => {
        deleteOrder(order.id)
          .then(() => goBack())
          .catch((e: unknown) => showError('No se pudo eliminar', e));
      },
    });

  return (
    <FormScroll>
      <Stack.Screen
        options={{
          title: `Pedido #${order.id}`,
          headerRight: () => <IconButton icon="create-outline" label="Editar pedido" onPress={() => router.push({ pathname: '/pedido/editar', params: { id: order.id } })} />,
        }}
      />
      <Card>
        {supplier ? (
          <PressableRow onPress={() => router.push({ pathname: '/proveedor/[id]', params: { id: supplier.id } })} accessibilityLabel={`Proveedor ${supplier.name}`}>
            <View style={styles.supplierRow}>
              <Avatar name={supplier.name} size={44} />
              <Text style={styles.title}>{supplier.name}</Text>
            </View>
          </PressableRow>
        ) : null}
        <InfoRow label="Fecha" value={formatDate(order.orderDate)} />
        <InfoRow label="Moneda del pedido" value={order.currency} />
        <StatusStepper status={order.status} />
        <ChipGroup<OrderStatus>
          label="Cambiar estado"
          value={order.status}
          options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], icon: ORDER_STATUS_ICON[s] }))}
          onChange={changeStatus}
        />
        {order.notes ? <Text style={styles.body}>{order.notes}</Text> : null}
      </Card>

      <SectionHeader title="Envío" icon="airplane-outline" />
      <Card>
        {order.trackingNumber ? (
          <>
            <InfoRow label={order.carrier || 'Seguimiento'} value={order.trackingNumber} />
            <ButtonRow>
              <Button variant="secondary" icon="copy-outline" label="Copiar" onPress={copyTracking} />
              <Button
                variant="secondary"
                icon="navigate-outline"
                label="Rastrear"
                onPress={() => Linking.openURL(trackingUrl(order.trackingNumber)).catch((e: unknown) => showError('No se pudo abrir', e))}
              />
            </ButtonRow>
          </>
        ) : (
          <Button variant="secondary" icon="add" label="Añadir número de seguimiento" onPress={() => router.push({ pathname: '/pedido/editar', params: { id: order.id } })} />
        )}
      </Card>

      <SectionHeader title={`Productos (${lines.length})`} icon="cube-outline" action={<IconButton icon="add-circle-outline" label="Añadir línea" onPress={() => go('/pedido/linea')} />} />
      {lines.length > 0 ? <LinesList lines={lines} currency={order.currency} rates={totals.rates} onPressLine={(lineId) => go('/pedido/linea', { id: lineId })} /> : null}
      <Button
        variant={lines.length === 0 ? 'primary' : 'secondary'}
        icon="clipboard-outline"
        label="Pegar lista de WhatsApp"
        onPress={() => go('/pedido/importar')}
      />

      <SectionHeader title="Importes" icon="calculator-outline" />
      <DisplayCurrencySwitch value={displayCurrency} onChange={setDisplayCurrency} />
      <TotalsCard totals={totals} payment={payment} currency={order.currency} usesOrderRate={order.fxRateMicros !== null} />

      <SectionHeader title={`Pagos (${payments.length})`} icon="cash-outline" action={<IconButton icon="add-circle-outline" label="Registrar pago" onPress={() => go('/pedido/pago')} />} />
      {payments.length > 0 ? <PaymentsList payments={payments} onPressPayment={(paymentId) => go('/pedido/pago', { id: paymentId })} /> : null}
      {payment.status !== 'pagado' ? <Button variant="secondary" icon="cash-outline" label="Registrar pago" onPress={() => go('/pedido/pago')} /> : null}

      <SectionHeader title="Acciones" icon="flash-outline" />
      <Button icon="logo-whatsapp" label={supplier?.whatsapp ? 'Enviar resumen por WhatsApp' : 'Compartir resumen'} onPress={sendSummary} />
      <Button variant="destructive" icon="trash-outline" label="Eliminar pedido" onPress={handleDelete} />
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    title: { ...typography.title, color: theme.colors.text, flexShrink: 1 },
    supplierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    body: { ...typography.body, color: theme.colors.text },
  });
