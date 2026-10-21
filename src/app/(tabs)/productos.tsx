import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listProducts } from '@/api/data';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { CONTENT_MAX_WIDTH, EmptyState, ErrorView, InfoRow, LoadingView } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { IconText } from '@/components/ui/Visuals';
import { formatDate, formatQuantity } from '@/domain/exportText';
import { computeProductCosts, formatMargin, productSaleInfo, type ProductCost } from '@/domain/landedCost';
import { convert, formatMoney, marketRates } from '@/domain/money';
import { foldText } from '@/domain/orderFilters';
import { CURRENCIES, type Currency } from '@/domain/types';
import { CURRENCY_LABEL } from '@/i18n/es';
import { useLoader } from '@/hooks/useLoader';
import { radius, spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

async function loadProducts(): Promise<ProductCost[]> {
  const { products, settings } = await listProducts();
  return computeProductCosts(products, marketRates(settings));
}

const ProductCard = memo(function ProductCard({
  product,
  currency,
  onOpen,
}: {
  product: ProductCost;
  currency: Currency;
  onOpen: (lineId: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const info = productSaleInfo(product, currency);
  const money = (cents: number, from: Currency = product.currency) => formatMoney(convert(cents, from, currency, product.rates), currency);
  const title = [formatQuantity(product.quantity), '×', product.pieceType, product.measurements].filter(Boolean).join(' ');
  const profit = info.salePriceCents !== null && info.landedUnitCents !== null ? info.salePriceCents - info.landedUnitCents : null;
  return (
    <Pressable
      onPress={() => onOpen(product.lineId)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Coste unitario ${info.landedUnitCents === null ? 'pendiente' : formatMoney(info.landedUnitCents, currency)}${
        info.salePriceCents !== null ? `. Venta ${formatMoney(info.salePriceCents, currency)}` : ''
      }`}
      accessibilityHint="Poner precio de venta o porcentaje de beneficio"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.title}>{title}</Text>
      <View style={styles.metaRow}>
        <IconText icon="business-outline">{product.supplierName || 'Sin proveedor'}</IconText>
        <IconText icon="receipt-outline">
          #{product.orderId} · {formatDate(product.orderDate)}
        </IconText>
      </View>
      {product.landedUnitCents === null || info.landedUnitCents === null ? (
        <IconText icon="pricetag-outline">Precio pendiente: añádelo en el pedido o toca para poner un valor teórico</IconText>
      ) : (
        <>
          <InfoRow
            icon="pricetag-outline"
            label={product.usesTheoreticalCost ? 'Valor teórico por unidad' : 'Precio por unidad'}
            value={money(product.landedUnitCents - (product.allocatedPerUnitCents ?? 0) - product.handlingPerUnitCents)}
          />
          {product.usesTheoreticalCost ? (
            <IconText icon="refresh-circle-outline">Reposición: en el pedido figura a {money(product.unitPriceCents ?? 0)}</IconText>
          ) : null}
          {product.unitPriceCents === 0 && !product.usesTheoreticalCost ? (
            <IconText icon="alert-circle-outline">Pieza a 0 (reposición): toca para poner un valor teórico</IconText>
          ) : null}
          <InfoRow icon="airplane-outline" label="Envío + aduanas por unidad" value={`+ ${money(product.allocatedPerUnitCents ?? 0)}`} />
          {product.handlingPerUnitCents > 0 ? (
            <InfoRow icon="construct-outline" label="Manipulación por unidad" value={`+ ${money(product.handlingPerUnitCents)}`} />
          ) : null}
          <InfoRow icon="calculator-outline" label="Coste unitario total" value={formatMoney(info.landedUnitCents, currency)} isStrong />
          <View style={styles.divider} />
          {info.salePriceCents === null ? (
            <IconText icon="add-circle-outline">Toca para poner precio de venta o % de beneficio</IconText>
          ) : (
            <>
              <InfoRow icon="cart-outline" label="Precio de venta" value={formatMoney(info.salePriceCents, currency)} isStrong />
              <InfoRow
                icon="trending-up-outline"
                label={`Beneficio${info.marginBp !== null ? ` (${formatMargin(info.marginBp)})` : ''}`}
                value={profit === null ? '—' : `${formatMoney(profit, currency)} / ud`}
              />
            </>
          )}
        </>
      )}
    </Pressable>
  );
});

/** Stable separator component: an inline arrow would remount every separator on each render. */
function ListSeparator() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.separator} />;
}

export default function ProductsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(loadProducts);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const folded = foldText(query.trim());
    return (data ?? []).filter((p) => foldText(`${p.pieceType} ${p.measurements} ${p.supplierName} ${p.orderId}`).includes(folded));
  }, [data, query]);
  const open = useCallback((lineId: number) => router.push({ pathname: '/producto/[id]', params: { id: lineId } }), []);
  // Stable renderItem: a new function every render would re-render every visible card on
  // each keystroke in the search box.
  const renderItem = useCallback(
    ({ item }: { item: ProductCost }) => <ProductCard product={item} currency={currency} onOpen={open} />,
    [currency, open],
  );

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data && loading) return <LoadingView />;
  if (!data) return null;
  if (data.length === 0) {
    return <EmptyState icon="cube-outline" title="Aún no hay productos" message="Los productos aparecen al añadir líneas a tus pedidos." />;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.list}
      data={visible}
      keyExtractor={(p) => String(p.lineId)}
      ItemSeparatorComponent={ListSeparator}
      ListHeaderComponent={
        <View style={styles.header}>
          <ChipGroup<Currency>
            label="Ver importes en"
            value={currency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
            onChange={setCurrency}
          />
          <TextField label="Buscar producto" value={query} onChangeText={setQuery} autoCorrect={false} inputMode="search" />
          <Text style={styles.note}>
            Envío y aduanas de cada pedido se reparten entre sus productos en proporción al importe de cada línea.
          </Text>
        </View>
      }
      renderItem={renderItem}
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { padding: spacing.lg, paddingBottom: spacing.xxl, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    header: { gap: spacing.md, marginBottom: spacing.md },
    note: { ...typography.footnote, color: theme.colors.textSecondary },
    separator: { height: spacing.md },
    card: { backgroundColor: theme.colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    pressed: { opacity: 0.7 },
    title: { ...typography.headline, color: theme.colors.text },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.divider },
  });
