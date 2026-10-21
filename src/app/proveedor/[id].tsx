import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { OrderCard } from '@/components/orders/OrderCard';
import { confirmDestructive, showError } from '@/components/ui/alerts';
import { Button, ButtonRow, IconButton } from '@/components/ui/Button';
import { Card, EmptyState, ErrorView, FormScroll, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { deleteSupplier, getSupplier } from '@/api/data';
import { plural } from '@/domain/exportText';
import { filterOrders } from '@/domain/orderFilters';
import { useLoader } from '@/hooks/useLoader';
import { loadOrderList } from '@/hooks/useOrderList';
import { goBack, parseIdParam, whatsappUrl } from '@/lib/params';
import { spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

export default function SupplierDetailScreen() {
  const id = parseIdParam(useLocalSearchParams<{ id: string }>().id) ?? 0;
  const styles = useThemedStyles(makeStyles);
  const load = useCallback(async () => {
    const [supplier, list] = await Promise.all([getSupplier(id), loadOrderList()]);
    return { supplier, orders: filterOrders(list.items, { supplierId: id }) };
  }, [id]);
  const { data, error, loading, reload } = useLoader(load);
  // Stable handler: an inline arrow would break the memoization of every OrderCard.
  const openOrder = useCallback((orderId: number) => router.push({ pathname: '/pedido/[id]', params: { id: orderId } }), []);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data && loading) return <LoadingView />;
  if (!data?.supplier) return <EmptyState icon="help-circle-outline" title="Proveedor no encontrado" message="Puede que se haya eliminado." />;

  const { supplier, orders } = data;
  const chatUrl = whatsappUrl(supplier.whatsapp, '');

  const handleDelete = () => {
    // The server also refuses (409) if orders were added from another device meanwhile.
    if (orders.length > 0) {
      showError('No se puede eliminar', new Error(`Este proveedor tiene ${plural(orders.length, 'pedido', 'pedidos')}. Elimínalos primero.`));
      return;
    }
    confirmDestructive({
      title: `¿Eliminar a ${supplier.name}?`,
      message: 'Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
      onConfirm: () => {
        deleteSupplier(supplier.id)
          .then(() => goBack())
          .catch((e: unknown) => showError('No se pudo eliminar', e));
      },
    });
  };

  return (
    <FormScroll>
      <Stack.Screen
        options={{
          title: supplier.name,
          headerRight: () => (
            <IconButton icon="create-outline" label="Editar proveedor" onPress={() => router.push({ pathname: '/proveedor/editar', params: { id: supplier.id } })} />
          ),
        }}
      />
      <Card>
        <Text style={styles.name} accessibilityRole="header">
          {supplier.name}
        </Text>
        <Text style={styles.secondary}>{supplier.whatsapp ? `WhatsApp ${supplier.whatsapp}` : 'Sin número de WhatsApp'}</Text>
        {supplier.notes ? <Text style={styles.body}>{supplier.notes}</Text> : null}
        <ButtonRow>
          {chatUrl ? (
            <Button
              variant="secondary"
              icon="logo-whatsapp"
              label="Abrir chat"
              onPress={() => Linking.openURL(chatUrl).catch((e: unknown) => showError('No se pudo abrir WhatsApp', e))}
            />
          ) : null}
          <Button icon="add" label="Nuevo pedido" onPress={() => router.push({ pathname: '/pedido/editar', params: { supplierId: supplier.id } })} />
        </ButtonRow>
      </Card>

      <SectionHeader title={`Pedidos (${orders.length})`} />
      {orders.length === 0 ? (
        <Text style={styles.secondary}>Todavía no hay pedidos de este proveedor.</Text>
      ) : (
        <View style={styles.orders}>
          {orders.map((item) => (
            <OrderCard key={item.id} item={item} onPress={openOrder} />
          ))}
        </View>
      )}

      <Button variant="destructive" icon="trash-outline" label="Eliminar proveedor" onPress={handleDelete} />
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    name: { ...typography.largeTitle, color: theme.colors.text },
    secondary: { ...typography.callout, color: theme.colors.textSecondary },
    body: { ...typography.body, color: theme.colors.text },
    orders: { gap: spacing.md },
  });
