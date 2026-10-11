import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { FilterSheet } from '@/components/orders/FilterSheet';
import { IconButton } from '@/components/ui/Button';
import { OrderCard } from '@/components/orders/OrderCard';
import { CONTENT_MAX_WIDTH, EmptyState, ErrorView, LoadingView } from '@/components/ui/Layout';
import { formatMoney } from '@/domain/money';
import { countActiveFilters, filterOrders, type OrderFilterCriteria, type OrderListItem } from '@/domain/orderFilters';
import { CURRENCIES } from '@/domain/types';
import { useLoader } from '@/hooks/useLoader';
import { loadOrderList } from '@/hooks/useOrderList';
import { MIN_TOUCH, radius, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

function pendingSummary(items: readonly OrderListItem[]): string {
  const parts = CURRENCIES.map((currency) => {
    const cents = items.filter((i) => i.currency === currency).reduce((sum, i) => sum + i.pendingCents, 0);
    return cents > 0 ? formatMoney(cents, currency) : null;
  }).filter(Boolean);
  if (items.length === 0) return 'ninguno coincide';
  return parts.length > 0 ? `Pendiente de pago: ${parts.join(' + ')}` : 'Todo pagado';
}

export default function OrdersScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(loadOrderList);
  const [criteria, setCriteria] = useState<OrderFilterCriteria>({ sort: 'fecha_desc' });
  const [isFilterOpen, setFilterOpen] = useState(false);

  const visible = useMemo(() => filterOrders(data?.items ?? [], criteria), [data, criteria]);
  const activeFilters = countActiveFilters(criteria);
  const openOrder = useCallback((id: number) => router.push({ pathname: '/pedido/[id]', params: { id } }), []);
  const renderItem = useCallback(({ item }: { item: OrderListItem }) => <OrderCard item={item} onPress={openOrder} />, [openOrder]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data && loading) return <LoadingView />;
  if (!data) return null;

  if (data.items.length === 0) {
    const hasSuppliers = data.suppliers.length > 0;
    return (
      <EmptyState
        icon="receipt-outline"
        title={hasSuppliers ? 'Aún no hay pedidos' : 'Empieza añadiendo un proveedor'}
        message={
          hasSuppliers
            ? 'Crea un pedido y pega la lista de piezas que te envía tu proveedor por WhatsApp.'
            : 'Cada pedido pertenece a un proveedor. Añade el primero con su número de WhatsApp.'
        }
        actionLabel={hasSuppliers ? 'Nuevo pedido' : 'Añadir proveedor'}
        onAction={() => router.push(hasSuppliers ? '/pedido/editar' : '/proveedor/editar')}
      />
    );
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
          <TextInput
            value={criteria.query ?? ''}
            onChangeText={(query) => setCriteria((c) => ({ ...c, query }))}
            placeholder="Buscar pieza, proveedor, seguimiento…"
            placeholderTextColor={theme.colors.textSecondary}
            accessibilityLabel="Buscar pedidos"
            style={styles.searchInput}
            inputMode="search"
            enterKeyHint="search"
            autoCorrect={false}
          />
          {criteria.query ? (
            <IconButton
              icon="close-circle"
              label="Borrar búsqueda"
              color={theme.colors.textSecondary}
              onPress={() => setCriteria((c) => ({ ...c, query: '' }))}
            />
          ) : null}
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={activeFilters > 0 ? `Filtros, ${activeFilters} activos` : 'Filtros y orden'}
          style={({ pressed }) => [styles.filterButton, activeFilters > 0 && styles.filterActive, pressed && styles.pressed]}
        >
          <Ionicons name="options-outline" size={22} color={activeFilters > 0 ? theme.colors.onPrimary : theme.colors.primary} />
          {activeFilters > 0 ? <Text style={styles.filterCount}>{activeFilters}</Text> : null}
        </Pressable>
      </View>
      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {visible.length} {visible.length === 1 ? 'pedido' : 'pedidos'} · {pendingSummary(visible)}
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState icon="funnel-outline" title="Sin resultados" message="Ningún pedido coincide con la búsqueda o los filtros." />
        }
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <FilterSheet
        isVisible={isFilterOpen}
        criteria={criteria}
        suppliers={data.suppliers}
        onChange={setCriteria}
        onClose={() => setFilterOpen(false)}
      />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { padding: spacing.lg, paddingBottom: spacing.xxl, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    separator: { height: spacing.md },
    header: { gap: spacing.sm, marginBottom: spacing.md },
    searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    search: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: MIN_TOUCH,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    searchInput: { ...typography.body, flex: 1, color: theme.colors.text, paddingVertical: spacing.sm },
    filterButton: {
      minWidth: MIN_TOUCH,
      minHeight: MIN_TOUCH,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      paddingHorizontal: spacing.sm,
      gap: 2,
    },
    filterActive: { backgroundColor: theme.colors.primary },
    filterCount: { ...typography.footnote, fontWeight: '700', color: theme.colors.onPrimary },
    pressed: { opacity: 0.6 },
    summary: { ...typography.footnote, color: theme.colors.textSecondary },
  });
