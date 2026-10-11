import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { setLinePrices } from '@/api/data';
import { announce, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, EmptyState, FormScroll, InfoRow, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { distributeTotal, goodsFromTotal, isReplacementLine, type DistributionMode } from '@/domain/distribute';
import { formatQuantity, plural } from '@/domain/exportText';
import { currencySymbol, formatMoney, parseAmount } from '@/domain/money';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { goBack, parseIdParam } from '@/lib/params';
import { MIN_TOUCH, spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

const MODE_OPTIONS: readonly { value: DistributionMode; label: string }[] = [
  { value: 'pieza', label: 'Igual por pieza' },
  { value: 'linea', label: 'Igual por línea' },
];

export default function DistributeTotalScreen() {
  const orderId = parseIdParam(useLocalSearchParams<{ orderId: string }>().orderId) ?? 0;
  const styles = useThemedStyles(makeStyles);
  const { data, loading } = useOrderDetail(orderId);
  const [amountText, setAmountText] = useState('');
  const [includesExtras, setIncludesExtras] = useState(true);
  const [mode, setMode] = useState<DistributionMode>('pieza');
  const [isSaving, setSaving] = useState(false);

  if (!data) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;
  }
  const { order, totals, lines } = data;
  const money = (cents: number) => formatMoney(cents, order.currency);
  const extrasCents = totals.shippingCents + totals.customsCents;
  const amountCents = amountText.trim() === '' ? null : parseAmount(amountText);
  const goodsCents = amountCents === null ? null : goodsFromTotal(amountCents, totals, includesExtras && extrasCents > 0);
  const distribution = goodsCents === null ? null : distributeTotal(lines, goodsCents, mode);
  const pricedCount = lines.filter((l) => l.unitPriceCents !== null && !isReplacementLine(l)).length;
  const replacementCount = lines.filter(isReplacementLine).length;
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const amountError =
    amountText.trim() !== '' && amountCents === null
      ? 'Importe no válido'
      : goodsCents !== null && goodsCents < 0
        ? `El total es menor que el envío y las aduanas (${money(extrasCents)})`
        : undefined;

  const runSave = async () => {
    if (!distribution || isSaving) return;
    setSaving(true);
    try {
      await setLinePrices(order.id, distribution.prices);
      announce(`Precios repartidos en ${plural(distribution.prices.length, 'línea', 'líneas')}`);
      goBack();
    } catch (e: unknown) {
      showError('No se pudieron guardar los precios', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (pricedCount === 0) {
      void runSave();
      return;
    }
    confirmDestructive({
      title: `¿Sustituir los precios de ${plural(pricedCount, 'línea', 'líneas')}?`,
      message: 'Las líneas que ya tienen precio tomarán el precio repartido.',
      confirmLabel: 'Sustituir',
      onConfirm: () => void runSave(),
    });
  };

  if (lines.length === 0) {
    return <EmptyState icon="cube-outline" title="El pedido no tiene líneas" message="Añade las piezas antes de repartir el importe." />;
  }

  return (
    <FormScroll>
      <Text style={styles.help}>
        Escribe el importe total que te ha dado el proveedor y se reparte entre las piezas del pedido. Las piezas a 0
        (reposiciones) no cambian.
      </Text>
      <TextField
        label={`Importe total (${currencySymbol(order.currency)})`}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="0,00"
        error={amountError}
        autoFocus
      />
      {extrasCents > 0 ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
            El importe incluye envío y aduanas ({money(extrasCents)})
          </Text>
          <Switch value={includesExtras} onValueChange={setIncludesExtras} accessibilityLabel="El importe incluye envío y aduanas" />
        </View>
      ) : null}
      <ChipGroup<DistributionMode> label="Cómo repartir" value={mode} options={MODE_OPTIONS} onChange={setMode} />
      <Text style={styles.note}>
        {mode === 'pieza'
          ? 'Todas las piezas quedan con el mismo precio por unidad.'
          : 'Cada línea recibe la misma parte, dividida entre sus piezas.'}
      </Text>

      {distribution ? (
        <>
          <SectionHeader title="Vista previa" icon="eye-outline" />
          <Card>
            {distribution.prices.map((price) => {
              const line = lineById.get(price.lineId);
              if (!line) return null;
              const description = [`${formatQuantity(line.quantity)} ×`, line.pieceType, line.measurements].filter(Boolean).join(' ');
              return (
                <InfoRow
                  key={price.lineId}
                  label={description}
                  value={`${money(price.unitPriceCents)}/ud · ${money(Math.round(line.quantity * price.unitPriceCents))}`}
                />
              );
            })}
            <InfoRow icon="cube-outline" label="Productos" value={money(distribution.goodsCents)} isStrong />
            {distribution.differenceCents !== 0 ? (
              <Text style={styles.note}>
                Por el redondeo a céntimos, las líneas suman {money(distribution.resultingCents)} (
                {distribution.differenceCents > 0 ? '+' : ''}
                {money(distribution.differenceCents)}).
              </Text>
            ) : null}
            {replacementCount > 0 ? (
              <Text style={styles.note}>{plural(replacementCount, 'línea a 0 se queda', 'líneas a 0 se quedan')} igual (reposiciones).</Text>
            ) : null}
          </Card>
          <Button
            icon="checkmark"
            label={isSaving ? 'Guardando…' : `Aplicar a ${plural(distribution.prices.length, 'línea', 'líneas')}`}
            onPress={handleSave}
            isDisabled={isSaving || amountError !== undefined}
          />
        </>
      ) : goodsCents !== null && goodsCents >= 0 ? (
        <Text style={styles.note}>No hay líneas a las que repartir: todas están a 0 (reposiciones).</Text>
      ) : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    help: { ...typography.callout, color: theme.colors.textSecondary },
    note: { ...typography.footnote, color: theme.colors.textSecondary },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: MIN_TOUCH },
    switchLabel: { ...typography.body, color: theme.colors.text, flex: 1 },
  });
