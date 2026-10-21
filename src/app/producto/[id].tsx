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
/** Empty field → null (no value); invalid text → undefined. */
const parseOptionalAmount = (text: string): number | null | undefined => {
  if (text.trim() === '') return null;
  return parseAmount(text) ?? undefined;
};
const storedToInput = (cents: number | null, from: Currency, rates: FxRates) =>
  cents === null ? '' : centsToInput(convert(cents, from, 'EUR', rates));

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
  const [handlingText, setHandlingText] = useState('');
  const [edited, setEdited] = useState<EditedField>(null);
  const [isTheoreticalEdited, setTheoreticalEdited] = useState(false);
  const [isHandlingEdited, setHandlingEdited] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const seeded = useRef(false);
  // Guards against a double tap firing two saves (and two goBack) before state updates.
  // Declared before the early returns below: a hook after them would change the hook
  // count between renders and React would throw.
  const savingRef = useRef(false);

  // Zero-price replacements (or lines without price) are costed with a theoretical value.
  const needsTheoretical = !!product && (product.unitPriceCents === null || product.unitPriceCents === 0);
  const theoreticalCents = parseOptionalAmount(theoreticalText) ?? null;
  const handlingCents = parseOptionalAmount(handlingText) ?? null;

  /** Landed cost with the values being typed, recomputing the order's shipping share live. */
  const previewLanded = (theoretical: number | null, handling: number | null): number | null => {
    if (!data || (needsTheoretical && theoretical === null)) return null;
    const overrides = { ...(needsTheoretical ? { theoreticalCents: theoretical } : {}), handlingCents: handling, currency };
    return previewLandedCost(data.orderRows, data.market, lineId, overrides, currency);
  };
  const landed = previewLanded(theoreticalCents, handlingCents);

  // Seed the fields once from what is stored (later focus reloads must not discard typing).
  useEffect(() => {
    if (!product || seeded.current) return;
    seeded.current = true;
    const initial = productSaleInfo(product, 'EUR');
    setSaleText(initial.salePriceCents === null ? '' : centsToInput(initial.salePriceCents));
    setMarginText(marginToInput(initial.marginBp));
    setTheoreticalText(storedToInput(product.theoreticalCostCents, product.theoreticalCurrency ?? product.currency, product.rates));
    setHandlingText(storedToInput(product.handlingCostCents, product.handlingCurrency ?? product.currency, product.rates));
  }, [product]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!product) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Producto no encontrado" message="Puede que se haya eliminado." />;
  }

  const toCurrency = (cents: number | null, next: Currency) => (cents === null ? '' : centsToInput(convert(cents, currency, next, product.rates)));
  const changeCurrency = (next: Currency) => {
    const sale = parseAmount(saleText);
    if (sale !== null) setSaleText(toCurrency(sale, next));
    if (theoreticalCents !== null) setTheoreticalText(toCurrency(theoreticalCents, next));
    if (handlingCents !== null) setHandlingText(toCurrency(handlingCents, next));
    setCurrency(next);
  };
  /** When the cost changes, keep whichever sale field the user drives and recompute the other one. */
  const syncSaleWithCost = (nextLanded: number | null) => {
    if (nextLanded === null) return;
    if (edited === 'sale') {
      const sale = parseAmount(saleText);
      setMarginText(marginToInput(sale === null ? null : marginFromSalePrice(nextLanded, sale)));
      return;
    }
    const margin = parseMarginBp(marginText);
    if (margin !== null) setSaleText(centsToInput(salePriceFromMargin(nextLanded, margin)));
  };
  const onTheoreticalChange = (text: string) => {
    setTheoreticalText(text);
    setTheoreticalEdited(true);
    syncSaleWithCost(previewLanded(parseOptionalAmount(text) ?? null, handlingCents));
  };
  const onHandlingChange = (text: string) => {
    setHandlingText(text);
    setHandlingEdited(true);
    syncSaleWithCost(previewLanded(theoreticalCents, parseOptionalAmount(text) ?? null));
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

  // Theoretical value and handling only feed costing; the order line keeps its own price.
  // Untouched values are sent as stored, so switching currency never adds rounding.
  const costPricing = () => ({
    ...(needsTheoretical && isTheoreticalEdited
      ? { theoreticalCostCents: theoreticalCents, theoreticalCurrency: theoreticalCents === null ? null : currency }
      : { theoreticalCostCents: product.theoreticalCostCents, theoreticalCurrency: product.theoreticalCurrency }),
    ...(isHandlingEdited
      ? { handlingCostCents: handlingCents, handlingCurrency: handlingCents === null ? null : currency }
      : { handlingCostCents: product.handlingCostCents, handlingCurrency: product.handlingCurrency }),
  });

  // Guards against a double tap firing two saves (and two goBack) before state updates.
  const save = async (pricing: Parameters<typeof saveLinePricing>[1], message: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveLinePricing(product.lineId, pricing);
      announce(message);
      goBack();
    } catch (e: unknown) {
      showError('No se pudo guardar', e);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleSave = () => {
    const isValid = announceErrors({
      theoretical: needsTheoretical && parseOptionalAmount(theoreticalText) === undefined ? 'Valor teórico no válido' : undefined,
      handling: parseOptionalAmount(handlingText) === undefined ? 'Gastos de manipulación no válidos' : undefined,
    });
    if (!isValid) return;
    const costs = costPricing();
    if (edited === 'margin') {
      const marginBp = parseMarginBp(marginText);
      if (!announceErrors({ margin: marginBp === null ? 'Porcentaje no válido (ej. 25)' : undefined })) return;
      void save({ salePriceCents: null, saleCurrency: null, marginBp, ...costs }, 'Beneficio guardado');
      return;
    }
    if (edited === 'sale') {
      const sale = parseAmount(saleText);
      if (!announceErrors({ sale: sale === null ? 'Precio de venta no válido' : undefined })) return;
      void save({ salePriceCents: sale, saleCurrency: currency, marginBp: null, ...costs }, 'Precio de venta guardado');
      return;
    }
    // Only the costs changed: keep the stored sale pricing as it is.
    void save({ salePriceCents: product.salePriceCents, saleCurrency: product.saleCurrency, marginBp: product.marginBp, ...costs }, 'Coste guardado');
  };

  const title = [formatQuantity(product.quantity), '×', product.pieceType, product.measurements].filter(Boolean).join(' ');
  const money = (cents: number) => formatMoney(convert(cents, product.currency, currency, product.rates), currency);
  const symbol = currencySymbol(currency);
  const baseCents = needsTheoretical ? (theoreticalCents ?? 0) : convert(product.unitPriceCents ?? 0, product.currency, currency, product.rates);
  const handlingShown = handlingCents ?? 0;
  const hasChanges = edited !== null || isTheoreticalEdited || isHandlingEdited;
  const info = productSaleInfo(product, currency);

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
      <Card>
        {needsTheoretical ? (
          <>
            <InfoRow icon="receipt-outline" label="Precio en el pedido" value={product.unitPriceCents === null ? 'Sin precio' : money(0)} />
            <TextField
              label={`Valor teórico por unidad (${symbol})`}
              value={theoreticalText}
              onChangeText={onTheoreticalChange}
              keyboardType="decimal-pad"
              placeholder="0,00"
              hint="Para piezas de reposición: solo sirve para calcular la venta; el pedido no cambia"
            />
          </>
        ) : null}
        <TextField
          label={`Gastos de manipulación por unidad (${symbol})`}
          value={handlingText}
          onChangeText={onHandlingChange}
          keyboardType="decimal-pad"
          placeholder="0,00"
          hint="Limpieza, corte, pulido, embalaje… antes de vender. Se suma al coste; el pedido no cambia"
        />
      </Card>
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
            value={formatMoney(baseCents, currency)}
          />
          <InfoRow
            icon="airplane-outline"
            label="Envío + aduanas (proporcional)"
            value={`+ ${formatMoney(landed - baseCents - handlingShown, currency)}`}
          />
          {handlingShown > 0 ? (
            <InfoRow icon="construct-outline" label="Manipulación" value={`+ ${formatMoney(handlingShown, currency)}`} />
          ) : null}
          <InfoRow icon="calculator-outline" label="Coste unitario total" value={formatMoney(landed, currency)} isStrong />
        </Card>
      )}

      <SectionHeader title="Venta" icon="cart-outline" />
      <Card>
        <TextField
          label={`Precio de venta por unidad (${symbol})`}
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

      <Button label={isSaving ? 'Guardando…' : 'Guardar'} icon="checkmark" onPress={handleSave} isDisabled={isSaving || !hasChanges} />
      {info.salePriceCents !== null || product.marginBp !== null ? (
        <Button
          variant="secondary"
          label="Quitar precio de venta"
          icon="close-circle-outline"
          onPress={() => void save({ salePriceCents: null, saleCurrency: null, marginBp: null, ...costPricing() }, 'Precio de venta quitado')}
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
