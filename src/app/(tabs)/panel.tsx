import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listProducts, loadOrderListRaw } from '@/api/data';
import { signedPercent } from '@/components/stats/InventorySections';
import { BarList, CountBars } from '@/components/stats/StatsParts';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, EmptyState, ErrorView, FormScroll, LoadingView, PressableRow, SectionHeader } from '@/components/ui/Layout';
import { StatTile } from '@/components/ui/Visuals';
import { LATE_ORDER_DAYS, orderOverview } from '@/domain/dashboard';
import { formatDate, formatQuantity, plural } from '@/domain/exportText';
import { overheadStats, priceChanges, warehouseStats } from '@/domain/inventory';
import { computeProductCosts, formatMargin } from '@/domain/landedCost';
import { formatMoney, marketRates } from '@/domain/money';
import { buildOrderListItems } from '@/domain/orderList';
import { profitStats, spendStats } from '@/domain/stats';
import { CURRENCIES, type Currency } from '@/domain/types';
import { CURRENCY_LABEL, ORDER_STATUS_LABEL, type IconName } from '@/i18n/es';
import { useLoader } from '@/hooks/useLoader';
import { spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

const SPEND_MONTHS = 6;
const TOP_SUPPLIERS = 5;

async function loadDashboard() {
  const [list, catalog] = await Promise.all([loadOrderListRaw(), listProducts()]);
  const market = marketRates(list.settings);
  const items = buildOrderListItems({
    orders: list.orders,
    lines: list.lines,
    payments: list.payments,
    supplierNames: new Map(list.suppliers.map((s) => [s.id, s.name])),
    marketRates: market,
  });
  return { list, items, products: computeProductCosts(catalog.products, marketRates(catalog.settings)) };
}

interface Attention {
  readonly key: string;
  readonly icon: IconName;
  readonly label: string;
  readonly count: number;
  readonly target: Href;
}

const ORDERS: Href = '/';
const PRODUCTS: Href = '/productos';
const STATS: Href = '/estadisticas';

export default function DashboardScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(loadDashboard);
  const [currency, setCurrency] = useState<Currency>('EUR');

  const view = useMemo(() => {
    if (!data) return null;
    const { orders, lines, payments, suppliers, settings } = data.list;
    return {
      spend: spendStats({ orders, lines, payments, suppliers, marketRates: marketRates(settings) }, currency, new Date(), SPEND_MONTHS),
      profit: profitStats(data.products, currency),
      warehouse: warehouseStats(data.products, currency),
      overhead: overheadStats(data.products, currency),
      prices: priceChanges(data.products, currency),
      orders: orderOverview(data.items),
    };
  }, [data, currency]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!view) return loading ? <LoadingView /> : null;
  if (view.spend.orderCount === 0) {
    return (
      <EmptyState
        icon="grid-outline"
        title="Aún no hay datos"
        message="El panel se llena cuando registres tu primer pedido."
        actionLabel="Nuevo pedido"
        onAction={() => router.push('/pedido/editar')}
      />
    );
  }

  const { spend, profit, warehouse, overhead, prices, orders } = view;
  const money = (cents: number) => formatMoney(cents, currency);
  const attention: Attention[] = [
    { key: 'late', icon: 'time-outline' as const, label: `Pedidos de más de ${LATE_ORDER_DAYS} días sin llegar`, count: orders.lateCount, target: ORDERS },
    { key: 'unpaid', icon: 'wallet-outline' as const, label: 'Pedidos con pago pendiente', count: orders.unpaidCount, target: ORDERS },
    { key: 'noPrice', icon: 'pricetag-outline' as const, label: 'Pedidos con líneas sin precio', count: orders.missingPriceCount, target: ORDERS },
    { key: 'loss', icon: 'trending-down-outline' as const, label: 'Productos por debajo del coste', count: profit.negativeMargin.length, target: STATS },
    { key: 'rises', icon: 'arrow-up-circle-outline' as const, label: 'Productos que han subido de precio', count: prices.riseCount, target: STATS },
    { key: 'noSale', icon: 'cash-outline' as const, label: 'Productos sin precio de venta', count: profit.withoutSaleCount, target: PRODUCTS },
  ].filter((a) => a.count > 0);

  return (
    <FormScroll>
      <ChipGroup<Currency>
        label="Ver importes en"
        value={currency}
        options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
        onChange={setCurrency}
      />

      <SectionHeader title="Resumen" icon="speedometer-outline" />
      <View style={styles.tiles}>
        <StatTile
          icon="cart-outline"
          label="Total comprado"
          value={money(spend.totalCents)}
          detail={plural(spend.orderCount, 'pedido', 'pedidos')}
          onPress={() => router.navigate(STATS)}
          accessibilityHint="Abre las estadísticas"
        />
        <StatTile
          icon="hourglass-outline"
          label="Pendiente de pago"
          value={money(spend.pendingCents)}
          detail={plural(orders.unpaidCount, 'pedido', 'pedidos')}
          onPress={() => router.navigate(ORDERS)}
          accessibilityHint="Abre los pedidos"
        />
        <StatTile
          icon="cube-outline"
          label="Valor del almacén"
          value={money(warehouse.stockCents)}
          detail={`${formatQuantity(warehouse.stockPieces)} piezas`}
          onPress={() => router.navigate(STATS)}
          accessibilityHint="Abre las estadísticas"
        />
        <StatTile
          icon="airplane-outline"
          label="En camino"
          value={money(warehouse.transitCents)}
          detail={`${formatQuantity(warehouse.transitPieces)} piezas`}
        />
        <StatTile
          icon="trending-up-outline"
          label="Beneficio previsto"
          value={profit.withSaleCount > 0 ? money(profit.profitCents) : '—'}
          detail={profit.marginBp === null ? 'sin precios de venta' : `margen ${formatMargin(profit.marginBp)}`}
          onPress={() => router.navigate(PRODUCTS)}
          accessibilityHint="Abre los productos"
        />
        <StatTile
          icon="layers-outline"
          label="Envío + aduanas"
          value={signedPercent(overhead.shippingCustomsBp)}
          detail="sobre el precio del proveedor"
        />
      </View>

      <SectionHeader title="Requiere atención" icon="alert-circle-outline" />
      <Card>
        {attention.length === 0 ? (
          <Text style={styles.ok}>Todo en orden: nada pendiente de revisar.</Text>
        ) : (
          attention.map((a) => <AttentionRow key={a.key} item={a} />)
        )}
      </Card>

      <SectionHeader title="Pedidos por estado" icon="git-branch-outline" />
      <Card>
        <CountBars items={orders.statusCounts.map((s) => ({ key: s.status, label: ORDER_STATUS_LABEL[s.status], count: s.count }))} />
      </Card>

      {orders.lateOrders.length > 0 ? (
        <>
          <SectionHeader title="Los que más tardan" icon="time-outline" />
          <Card>
            {orders.lateOrders.map((o) => (
              <PressableRow
                key={o.id}
                onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: o.id } })}
                accessibilityLabel={`Pedido ${o.id} de ${o.supplierName}, ${ORDER_STATUS_LABEL[o.status]}, ${o.days} días`}
                accessibilityHint="Abre el pedido"
              >
                <Text style={styles.rowTitle}>
                  #{o.id} · {o.supplierName}
                </Text>
                <Text style={styles.late}>
                  {o.days} días · {ORDER_STATUS_LABEL[o.status]} · pedido el {formatDate(o.orderDate)}
                </Text>
              </PressableRow>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title={`Compras por mes (${SPEND_MONTHS} meses)`} icon="calendar-outline" />
      <Card>
        <BarList currency={currency} items={spend.byMonth} />
      </Card>

      <SectionHeader title="Principales proveedores" icon="business-outline" />
      <Card>
        <BarList currency={currency} total={spend.totalCents} items={spend.bySupplier.slice(0, TOP_SUPPLIERS)} />
      </Card>

      <Button variant="secondary" label="Ver estadísticas completas" icon="stats-chart-outline" onPress={() => router.navigate(STATS)} />
    </FormScroll>
  );
}

function AttentionRow({ item }: { item: Attention }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <PressableRow onPress={() => router.navigate(item.target)} accessibilityLabel={`${item.label}: ${item.count}`} accessibilityHint="Abre la lista">
      <View style={styles.attention}>
        <Ionicons name={item.icon} size={20} color={theme.colors.warning.fg} />
        <Text style={styles.attentionLabel}>{item.label}</Text>
        <Text style={styles.count}>{item.count}</Text>
      </View>
    </PressableRow>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    ok: { ...typography.body, color: theme.colors.textSecondary },
    attention: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    attentionLabel: { ...typography.body, color: theme.colors.text, flex: 1 },
    count: { ...typography.headline, color: theme.colors.warning.fg, fontVariant: ['tabular-nums'] },
    rowTitle: { ...typography.headline, color: theme.colors.text },
    late: { ...typography.footnote, color: theme.colors.warning.fg, fontWeight: '600' },
  });
