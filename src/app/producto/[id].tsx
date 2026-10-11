import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { listProducts, saveLinePricing } from '@/api/data';
import { announce, announceErrors, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, EmptyState, ErrorView, FormScroll, InfoRow, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { formatQuantity } from '@/domain/exportText';
import {
  computeProductCosts,
  formatMargin,
  marginFromSalePrice,
  previewLandedCost,
  productSaleInfo,
  salePriceFromMargin,
  type ProductCost,
  type ProductSource,
} from '@/domain/landedCost';
import { centsToInput, convert, currencySymbol, formatMoney, marketRates, parseAmount, parseDecimal, type FxRates } from '@/domain/money';
import { CURRENCIES, type Currency } from '@/domain/types';
import { CURRENCY_LABEL } from '@/i18n/es';
import { useLoader } from '@/hooks/useLoader';
import { goBack, parseIdParam } from '@/lib/params';
import { typography, useThemedStyles, type Theme } from '@/theme/theme';

type EditedField = 'sale' | 'margin' | null;

const marginToInput = (bp: number | null) => (bp === null ? '' : String(bp / 100).replace('.', ','));
const parseMarginBp = (text: string): number | null => {
  const trimmed = text.trim().replace('%', '');
  const negative = trimmed.startsWith('-');
  const value = parseDecimal(negative ? trimmed.slice(1) : trimmed);
  return value === null ? null : Math.round((negative ? -value : value) * 100);
};

export default function ProductPricingScreen() {
  const lineId = parseIdParam(useLocalSearchParams<{ id: string }>().id) ?? 0;
  const styles = useThemedStyles(makeStyles);
  // The other lines of the order are kept too: a theoretical value changes how shipping is shared.
  const load = useCallback(async (): Promise<{ product: ProductCost; orderRows: ProductSource[]; market: FxRates } | null> => {
    const { products, settings } = await listProducts();
    const market = marketRates(settings);
    const product = computeProductCosts(products, market).find((p) => p.lineId === lineId);
    return product ? { product, orderRows: products.filter((p) => p.orderId === product.orderId), market } : null;
  }, [lineId]);
  const { data, error, loading, reload } = useLoader(load);
  const product = data?.product ?? null;
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [saleText, setSaleText] = useState('');
  const [marginText, setMarginText] = useState('');
  const [theoreticalText, setTheoreticalText] = useState('');
  const [edited, setEdited] = useState<EditedField>(null);
  const [isTheoreticalEdited, setTheoreticalEdited] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const seeded = useRef(false);

  const info = product ? productSaleInfo(product, currency) : null;
  // Zero-price replacements (or lines without price) are costed with a theoretical value.
  const needsTheoretical = !!product && (product.unitPriceCents === null || product.unitPriceCents === 0);
  const theoreticalCents = theoreticalText.trim() === '' ? null : parseAmount(theoreticalText);
  // Landed cost with the value being typed, recomputing the order's shipping share live.
  const previewLanded = (value: number | null): number | null =>
    data && value !== null ? previewLandedCost(data.orderRows, data.market, lineId, value, currency, currency) : null;
  const landed = needsTheoretical ? previewLanded(theoreticalCents) : (info?.landedUnitCents ?? null);

  // Seed the fields once from what is stored (later focus reloads must not discard typing).
  useEffect(() => {
    if (!product || seeded.current) return;
    seeded.current = true;
    const initial = productSaleInfo(product, 'EUR');
    setSaleText(initial.salePriceCents === null ? '' : centsToInput(initial.salePriceCents));
    setMarginText(marginToInput(initial.marginBp));
    if (product.theoreticalCostCents !== null) {
      const from = product.theoreticalCurrency ?? product.currency;
      setTheoreticalText(centsToInput(convert(product.theoreticalCostCents, from, 'EUR', product.rates)));
    }
  }, [product]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!product) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Producto no encontrado" message="Puede que se haya eliminado." />;
  }

  const changeCurrency = (next: Currency) => {
    const sale = parseAmount(saleText);
    if (sale !== null) setSaleText(centsToInput(convert(sale, currency, next, product.rates)));
    if (theoreticalCents !== null) setTheoreticalText(centsToInput(convert(theoreticalCents, currency, next, product.rates)));
    setCurrency(next);
  };
  const onTheoreticalChange = (text: string) => {
    setTheoreticalText(text);
    setTheoreticalEdited(true);
    const value = text.trim() === '' ? null : parseAmount(text);
    const nextLanded = previewLanded(value);
    if (nextLanded === null) return;
    // Keep whichever field the user drives and recompute the other one.
    if (edited === 'sale') {
      const sale = parseAmount(saleText);
      setMarginText(marginToInput(sale === null ? null : marginFromSalePrice(nextLanded, sale)));
    } else {
      const margin = parseMarginBp(marginText);
      if (margin !== null) setSaleText(centsToInput(salePriceFromMargin(nextLanded, margin)));
    }
  };
  // The theoretical value only feeds costing; the order line keeps its own price (0).
  const theoreticalPricing = () =>
    needsTheoretical
      ? { theoreticalCostCents: theoreticalCents, theoreticalCurrency: theoreticalCents === null ? null : currency }
      : { theoreticalCostCents: product.theoreticalCostCents, theoreticalCurrency: product.theoreticalCurrency };
  const onSaleChange = (text: string) => {
    setSaleText(text);
    setEdited('sale');
    const sale = parseAmount(text);
    const margin = sale !== null && landed !== null ? marginFromSalePrice(landed, sale) : null;
    setMarginText(marginToInput(margin));
  };
  const onMarginChange = (text: string) => {
    setMarginText(text);
    setEdited('margin');
    const margin = parseMarginBp(text);
    setSaleText(margin !== null && landed !== null ? centsToInput(salePriceFromMargin(landed, margin)) : '');
  };

  const save = async (pricing: Parameters<typeof saveLinePricing>[1], message: string) => {
    setSaving(true);
    try {
      await saveLinePricing(product.lineId, pricing);
      announce(message);
      goBack();
    } catch (e: unknown) {
      showError('No se pudo guardar', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const invalidTheoretical = needsTheoretical && theoreticalText.trim() !== '' && theoreticalCents === null;
    if (!announceErrors({ theoretical: invalidTheoretical ? 'Valor teórico no válido' : undefined })) return;
    const theoretical = theoreticalPricing();
    if (edited === 'margin') {
      const marginBp = parseMarginBp(marginText);
      if (!announceErrors({ margin: marginBp === null ? 'Porcentaje no válido (ej. 25)' : undefined })) return;
      void save({ salePriceCents: null, saleCurrency: null, marginBp, ...theoretical }, 'Beneficio guardado');
      return;
    }
    if (edited === 'sale') {
      const sale = parseAmount(saleText);
      if (!announceErrors({ sale: sale === null ? 'Precio de venta no válido' : undefined })) return;
      void save({ salePriceCents: sale, saleCurrency: currency, marginBp: null, ...theoretical }, 'Precio de venta guardado');
      return;
    }
    // Only the theoretical value changed: keep the stored sale pricing as it is.
    void save(
      { salePriceCents: product.salePriceCents, saleCurrency: product.saleCurrency, marginBp: product.marginBp, ...theoretical },
      'Valor teórico guardado',
    );
  };

  const title = [formatQuantity(product.quantity), '×', product.pieceType, product.measurements].filter(Boolean).join(' ');
  const money = (cents: number) => formatMoney(convert(cents, product.currency, currency, product.rates), currency);

  return (
    <FormScroll>
      <Stack.Screen options={{ title: 'Precio de venta' }} />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.note}>
        {product.supplierName} · pedido #{product.orderId}
      </Text>
      <ChipGroup<Currency>
        label="Moneda"
        value={currency}
        options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
        onChange={changeCurrency}
      />

      <SectionHeader title="Coste por unidad" icon="calculator-outline" />
      {needsTheoretical ? (
        <Card>
          <InfoRow icon="receipt-outline" label="Precio en el pedido" value={product.unitPriceCents === null ? 'Sin precio' : money(0)} />
          <TextField
            label={`Valor teórico por unidad (${currencySymbol(currency)})`}
            value={theoreticalText}
            onChangeText={onTheoreticalChange}
            keyboardType="decimal-pad"
            placeholder="0,00"
            hint="Para piezas de reposición: solo sirve para calcular la venta; el pedido no cambia"
          />
        </Card>
      ) : null}
      {landed === null ? (
        <Text style={styles.note}>
          {needsTheoretical
            ? 'Pon un valor teórico para calcular el coste y el precio de venta.'
            : 'Este producto aún no tiene precio. Añádelo en el pedido para calcular el coste.'}
        </Text>
      ) : (
        <Card>
          <InfoRow
            icon="pricetag-outline"
            label={needsTheoretical ? 'Valor teórico por unidad' : 'Precio por unidad'}
            value={needsTheoretical ? formatMoney(theoreticalCents ?? 0, currency) : money(product.unitPriceCents ?? 0)}
          />
          <InfoRow
            icon="airplane-outline"
            label="Envío + aduanas (proporcional)"
            value={`+ ${needsTheoretical ? formatMoney(landed - (theoreticalCents ?? 0), currency) : money(product.allocatedPerUnitCents ?? 0)}`}
          />
          <InfoRow icon="calculator-outline" label="Coste unitario total" value={formatMoney(landed, currency)} isStrong />
        </Card>
      )}

      <SectionHeader title="Venta" icon="cart-outline" />
      <Card>
        <TextField
          label={`Precio de venta por unidad (${currencySymbol(currency)})`}
          value={saleText}
          onChangeText={onSaleChange}
          keyboardType="decimal-pad"
          placeholder="0,00"
          hint="Escribe el precio y se calcula el % de beneficio"
        />
        <TextField
          label="% de beneficio sobre el coste"
          value={marginText}
          onChangeText={onMarginChange}
          keyboardType="decimal-pad"
          placeholder="25"
          hint="O escribe el % y se calcula el precio de venta"
        />
        {landed !== null && parseAmount(saleText) !== null ? (
          <InfoRow
            icon="trending-up-outline"
            label={`Beneficio por unidad${marginText ? ` (${formatMargin(parseMarginBp(marginText) ?? 0)})` : ''}`}
            value={formatMoney((parseAmount(saleText) ?? 0) - landed, currency)}
            isStrong
          />
        ) : null}
      </Card>

      <Button label={isSaving ? 'Guardando…' : 'Guardar'} icon="checkmark" onPress={handleSave} isDisabled={isSaving || (edited === null && !isTheoreticalEdited)} />
      {info?.salePriceCents !== null || product.marginBp !== null ? (
        <Button
          variant="secondary"
          label="Quitar precio de venta"
          icon="close-circle-outline"
          onPress={() =>
            void save(
              { salePriceCents: null, saleCurrency: null, marginBp: null, ...theoreticalPricing() },
              'Precio de venta quitado',
            )
          }
          isDisabled={isSaving}
        />
      ) : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    title: { ...typography.title, color: theme.colors.text },
    note: { ...typography.callout, color: theme.colors.textSecondary },
  });
