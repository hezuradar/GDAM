import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { listProducts, loadOrderListRaw } from '@/api/data';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, EmptyState, ErrorView, FormScroll, InfoRow, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { StatTile } from '@/components/ui/Visuals';
import { BarList, RankList, type RankItem } from '@/components/stats/StatsParts';
import { formatQuantity, plural } from '@/domain/exportText';
import { computeProductCosts, formatMargin } from '@/domain/landedCost';
import { formatMoney, marketRates } from '@/domain/money';
import { profitStats, spendStats, type ProductProfit } from '@/domain/stats';
import { CURRENCIES, type Currency } from '@/domain/types';
import { CURRENCY_LABEL } from '@/i18n/es';
import { useLoader } from '@/hooks/useLoader';
import { spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

async function loadStatsData() {
  const [list, catalog] = await Promise.all([loadOrderListRaw(), listProducts()]);
  return { list, products: computeProductCosts(catalog.products, marketRates(catalog.settings)) };
}

const percent = (part: number, total: number) => (total > 0 ? `${Math.round((part * 100) / total)} %` : '—');
const openProduct = (lineId: number) => router.push({ pathname: '/producto/[id]', params: { id: lineId } });

export default function StatsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(loadStatsData);
  const [currency, setCurrency] = useState<Currency>('EUR');

  const stats = useMemo(() => {
    if (!data) return null;
    const { orders, lines, payments, suppliers, settings } = data.list;
    return {
      spend: spendStats({ orders, lines, payments, suppliers, marketRates: marketRates(settings) }, currency),
      profit: profitStats(data.products, currency),
    };
  }, [data, currency]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!stats) return loading ? <LoadingView /> : null;
  const { spend, profit } = stats;
  if (spend.orderCount === 0) {
    return <EmptyState icon="stats-chart-outline" title="Aún no hay datos" message="Las estadísticas aparecen cuando registres pedidos." />;
  }

  const money = (cents: number) => formatMoney(cents, currency);
  const profitItem = (p: ProductProfit, value: string): RankItem => ({
    key: p.lineId,
    title: p.label || 'Sin descripción',
    subtitle: `${formatQuantity(p.quantity)} uds · ${p.supplierName || 'Sin proveedor'} · #${p.orderId}`,
    value,
    isNegative: p.unitProfitCents < 0,
  });
  const marginText = (p: ProductProfit) => (p.marginBp === null ? '—' : formatMargin(p.marginBp));
  const activeMonths = spend.byMonth.some((m) => m.cents > 0);

  return (
    <FormScroll>
      <ChipGroup<Currency>
        label="Ver importes en"
        value={currency}
        options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
        onChange={setCurrency}
      />

      <SectionHeader title="Gasto" icon="wallet-outline" />
      <View style={styles.tiles}>
        <StatTile icon="cart-outline" label="Total gastado" value={money(spend.totalCents)} detail={plural(spend.orderCount, 'pedido', 'pedidos')} />
        <StatTile icon="checkmark-circle-outline" label="Pagado" value={money(spend.paidCents)} detail={percent(spend.paidCents, spend.totalCents)} />
        <StatTile icon="hourglass-outline" label="Pendiente de pago" value={money(spend.pendingCents)} />
        <StatTile
          icon="cube-outline"
          label="Coste medio por pieza"
          value={spend.avgPieceCostCents === null ? '—' : money(spend.avgPieceCostCents)}
          detail={`${formatQuantity(spend.pieces)} piezas`}
        />
      </View>
      <Card>
        <BarList
          currency={currency}
          total={spend.totalCents}
          items={[
            { key: 'goods', label: 'Productos', cents: spend.goodsCents },
            { key: 'shipping', label: 'Envío', cents: spend.shippingCents },
            { key: 'customs', label: 'Aduanas', cents: spend.customsCents },
          ]}
        />
        {spend.pendingPriceLines > 0 ? (
          <Text style={styles.note}>
            {plural(spend.pendingPriceLines, 'línea sin precio', 'líneas sin precio')}: el gasto real será mayor.
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Gasto por proveedor" icon="business-outline" />
      <Card>
        <BarList currency={currency} total={spend.totalCents} items={spend.bySupplier} />
      </Card>

      {activeMonths ? (
        <>
          <SectionHeader title="Gasto por mes (12 meses)" icon="calendar-outline" />
          <Card>
            <BarList currency={currency} items={spend.byMonth} />
          </Card>
        </>
      ) : null}

      <SectionHeader title="Beneficio previsto" icon="trending-up-outline" />
      {profit.withSaleCount === 0 ? (
        <Text style={styles.note}>
          Aún no hay productos con precio de venta. Ponlo en Productos para ver el beneficio y los márgenes.
        </Text>
      ) : (
        <>
          <View style={styles.tiles}>
            <StatTile icon="pricetag-outline" label="Coste" value={money(profit.costCents)} />
            <StatTile icon="cash-outline" label="Venta prevista" value={money(profit.saleCents)} />
            <StatTile icon="trending-up-outline" label="Beneficio" value={money(profit.profitCents)} />
            <StatTile icon="analytics-outline" label="Margen medio" value={profit.marginBp === null ? '—' : formatMargin(profit.marginBp)} detail="sobre el coste" />
          </View>
          <Text style={styles.note}>
            Calculado con {plural(profit.withSaleCount, 'producto', 'productos')} con precio de venta de {profit.productCount}, vendiendo
            todas sus unidades. Coste = precio + envío y aduanas repartidos.
          </Text>

          <SectionHeader title="Más margen" icon="ribbon-outline" />
          <Card>
            <RankList items={profit.topByMargin.map((p) => profitItem(p, marginText(p)))} onPress={openProduct} />
          </Card>

          <SectionHeader title="Más beneficio total" icon="podium-outline" />
          <Card>
            <RankList items={profit.topByProfit.map((p) => profitItem(p, money(p.totalProfitCents)))} onPress={openProduct} />
          </Card>
        </>
      )}

      {profit.topByUnitCost.length > 0 ? (
        <>
          <SectionHeader title="Coste por unidad más alto" icon="pricetags-outline" />
          <Card>
            <RankList
              items={profit.topByUnitCost.map((p) => ({
                key: p.lineId,
                title: p.label || 'Sin descripción',
                subtitle: `${formatQuantity(p.quantity)} uds · ${p.supplierName || 'Sin proveedor'}`,
                value: money(p.unitCostCents),
              }))}
              onPress={openProduct}
            />
          </Card>
        </>
      ) : null}

      {profit.negativeMargin.length > 0 || profit.withoutSaleCount > 0 || profit.withoutCostCount > 0 ? (
        <>
          <SectionHeader title="Para revisar" icon="alert-circle-outline" />
          {profit.negativeMargin.length > 0 ? (
            <Card>
              <Text style={styles.cardTitle}>Se venden por debajo del coste</Text>
              <RankList
                items={profit.negativeMargin.map((p) => profitItem(p, `${money(p.unitProfitCents)}/ud`))}
                onPress={openProduct}
              />
            </Card>
          ) : null}
          <Card>
            <InfoRow icon="pricetag-outline" label="Sin precio de venta" value={plural(profit.withoutSaleCount, 'producto', 'productos')} />
            <InfoRow icon="help-circle-outline" label="Sin coste (precio pendiente)" value={plural(profit.withoutCostCount, 'producto', 'productos')} />
          </Card>
        </>
      ) : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    note: { ...typography.footnote, color: theme.colors.textSecondary },
    cardTitle: { ...typography.headline, color: theme.colors.text },
  });
