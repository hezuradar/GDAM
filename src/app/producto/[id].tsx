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
  productSaleInfo,
  salePriceFromMargin,
  type ProductCost,
} from '@/domain/landedCost';
import { centsToInput, convert, formatMoney, parseAmount, parseDecimal } from '@/domain/money';
import { CURRENCIES, type Currency } from '@/domain/types';
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
  const load = useCallback(async (): Promise<ProductCost | null> => {
    const { products, settings } = await listProducts();
    return computeProductCosts(products, settings.fxRateMicros).find((p) => p.lineId === lineId) ?? null;
  }, [lineId]);
  const { data: product, error, loading, reload } = useLoader(load);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [saleText, setSaleText] = useState('');
  const [marginText, setMarginText] = useState('');
  const [edited, setEdited] = useState<EditedField>(null);
  const [isSaving, setSaving] = useState(false);
  const seeded = useRef(false);

  const info = product ? productSaleInfo(product, currency) : null;
  const landed = info?.landedUnitCents ?? null;

  // Seed the fields once from what is stored (later focus reloads must not discard typing).
  useEffect(() => {
    if (!product || seeded.current) return;
    seeded.current = true;
    const initial = productSaleInfo(product, 'EUR');
    setSaleText(initial.salePriceCents === null ? '' : centsToInput(initial.salePriceCents));
    setMarginText(marginToInput(initial.marginBp));
  }, [product]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!product) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Producto no encontrado" message="Puede que se haya eliminado." />;
  }

  const changeCurrency = (next: Currency) => {
    const sale = parseAmount(saleText);
    if (sale !== null) setSaleText(centsToInput(convert(sale, currency, next, product.rateMicros)));
    setCurrency(next);
  };
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
    if (edited === 'margin') {
      const marginBp = parseMarginBp(marginText);
      if (!announceErrors({ margin: marginBp === null ? 'Porcentaje no válido (ej. 25)' : undefined })) return;
      void save({ salePriceCents: null, saleCurrency: null, marginBp }, 'Beneficio guardado');
      return;
    }
    const sale = parseAmount(saleText);
    if (!announceErrors({ sale: sale === null ? 'Precio de venta no válido' : undefined })) return;
    void save({ salePriceCents: sale, saleCurrency: currency, marginBp: null }, 'Precio de venta guardado');
  };

  const title = [formatQuantity(product.quantity), '×', product.pieceType, product.measurements].filter(Boolean).join(' ');
  const money = (cents: number) => formatMoney(convert(cents, product.currency, currency, product.rateMicros), currency);

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
        options={CURRENCIES.map((c) => ({ value: c, label: c === 'EUR' ? 'Euros (€)' : 'Dólares (US$)' }))}
        onChange={changeCurrency}
      />

      <SectionHeader title="Coste por unidad" icon="calculator-outline" />
      {landed === null || product.unitPriceCents === null ? (
        <Text style={styles.note}>Este producto aún no tiene precio. Añádelo en el pedido para calcular el coste.</Text>
      ) : (
        <Card>
          <InfoRow icon="pricetag-outline" label="Precio por unidad" value={money(product.unitPriceCents)} />
          <InfoRow icon="airplane-outline" label="Envío + aduanas (proporcional)" value={`+ ${money(product.allocatedPerUnitCents ?? 0)}`} />
          <InfoRow icon="calculator-outline" label="Coste unitario total" value={formatMoney(landed, currency)} isStrong />
        </Card>
      )}

      <SectionHeader title="Venta" icon="cart-outline" />
      <Card>
        <TextField
          label={`Precio de venta por unidad (${currency === 'EUR' ? '€' : 'US$'})`}
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

      <Button label={isSaving ? 'Guardando…' : 'Guardar'} icon="checkmark" onPress={handleSave} isDisabled={isSaving || edited === null} />
      {info?.salePriceCents !== null || product.marginBp !== null ? (
        <Button
          variant="secondary"
          label="Quitar precio de venta"
          icon="close-circle-outline"
          onPress={() => void save({ salePriceCents: null, saleCurrency: null, marginBp: null }, 'Precio de venta quitado')}
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
