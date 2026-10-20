import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { setLinePrices } from '@/api/data';
import { announce, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, EmptyState, FormScroll, InfoRow, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import {
  distributeTotal,
  excludedPricedCents,
  goodsFromTotal,
  isReplacementLine,
  type DistributionMode,
} from '@/domain/distribute';
import { formatQuantity, plural } from '@/domain/exportText';
import { currencySymbol, formatMoney, parseAmount } from '@/domain/money';
import type { OrderLine } from '@/domain/types';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { goBack, parseIdParam } from '@/lib/params';
import { MIN_TOUCH, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

const MODE_OPTIONS: readonly { value: DistributionMode; label: string }[] = [
  { value: 'pieza', label: 'Igual por pieza' },
  { value: 'linea', label: 'Igual por línea' },
];

const describeLine = (line: OrderLine) =>
  [`${formatQuantity(line.quantity)} ×`, line.pieceType, line.measurements].filter(Boolean).join(' ');

export default function DistributeTotalScreen() {
  const orderId = parseIdParam(useLocalSearchParams<{ orderId: string }>().orderId);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, loading } = useOrderDetail(orderId);
  const [amountText, setAmountText] = useState('');
  const [includesExtras, setIncludesExtras] = useState(true);
  const [subtractExcluded, setSubtractExcluded] = useState(true);
  const [mode, setMode] = useState<DistributionMode>('pieza');
  const [excluded, setExcluded] = useState<ReadonlySet<number>>(new Set());
  const [isSaving, setSaving] = useState(false);

  if (!data) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;
  }
  const { order, totals, lines } = data;
  if (lines.length === 0) {
    return <EmptyState icon="cube-outline" title="El pedido no tiene líneas" message="Añade las piezas antes de repartir el importe." />;
  }

  const money = (cents: number) => formatMoney(cents, order.currency);
  const extrasCents = totals.shippingCents + totals.customsCents;
  const excludedCents = excludedPricedCents(lines, excluded);
  const amountCents = amountText.trim() === '' ? null : parseAmount(amountText);
  const takenExtras = includesExtras && extrasCents > 0 ? extrasCents : 0;
  const takenExcluded = subtractExcluded ? excludedCents : 0;
  const goodsCents = amountCents === null ? null : goodsFromTotal(amountCents, totals, takenExtras > 0) - takenExcluded;
  const distribution = goodsCents === null ? null : distributeTotal(lines, goodsCents, mode, excluded);
  const priceById = new Map(distribution?.prices.map((p) => [p.lineId, p.unitPriceCents]) ?? []);
  const selectableCount = lines.filter((l) => !isReplacementLine(l)).length;
  const includedCount = lines.filter((l) => !isReplacementLine(l) && !excluded.has(l.id)).length;
  const overwrittenCount = lines.filter((l) => priceById.has(l.id) && l.unitPriceCents !== null).length;

  const amountError =
    amountText.trim() !== '' && amountCents === null
      ? 'Importe no válido'
      : goodsCents !== null && goodsCents < 0
        ? 'El importe es menor que lo que se descuenta (envío, aduanas o líneas excluidas)'
        : undefined;

  const toggle = (lineId: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });

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
    if (overwrittenCount === 0) {
      void runSave();
      return;
    }
    confirmDestructive({
      title: `¿Sustituir los precios de ${plural(overwrittenCount, 'línea', 'líneas')}?`,
      message: 'Las líneas incluidas que ya tienen precio tomarán el precio repartido.',
      confirmLabel: 'Sustituir',
      onConfirm: () => void runSave(),
    });
  };

  const lineDetail = (line: OrderLine): string => {
    if (isReplacementLine(line)) return 'Reposición: se queda a 0';
    const current = line.unitPriceCents === null ? 'sin precio' : `${money(line.unitPriceCents)}/ud`;
    if (excluded.has(line.id)) return `Excluida: mantiene ${current}`;
    const unit = priceById.get(line.id);
    return unit === undefined ? `Ahora ${current}` : `→ ${money(unit)}/ud · ${money(Math.round(line.quantity * unit))}`;
  };

  return (
    <FormScroll>
      <Text style={styles.help}>
        Escribe el importe total que te ha dado el proveedor y se reparte entre las piezas marcadas. Desmarca las que no
        entren en el reparto; las piezas a 0 (reposiciones) no cambian.
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
          ? 'Todas las piezas incluidas quedan con el mismo precio por unidad.'
          : 'Cada línea incluida recibe la misma parte, dividida entre sus piezas.'}
      </Text>

      <SectionHeader title={`Piezas del reparto (${includedCount} de ${selectableCount})`} icon="cube-outline" />
      <Card>
        {lines.map((line) => {
          const isReplacement = isReplacementLine(line);
          const isIncluded = !isReplacement && !excluded.has(line.id);
          const description = describeLine(line);
          const detail = lineDetail(line);
          return (
            <Pressable
              key={line.id}
              onPress={() => toggle(line.id)}
              disabled={isReplacement}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isIncluded, disabled: isReplacement }}
              accessibilityLabel={`${description}. ${detail}`}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Ionicons
                name={isReplacement ? 'refresh-circle-outline' : isIncluded ? 'checkbox' : 'square-outline'}
                size={24}
                color={isIncluded ? theme.colors.primary : theme.colors.textSecondary}
              />
              <View style={styles.flex}>
                <Text style={[styles.lineText, !isIncluded && styles.muted]}>{description}</Text>
                <Text style={styles.note}>{detail}</Text>
              </View>
            </Pressable>
          );
        })}
      </Card>
      {excludedCents > 0 ? (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
            Restar del importe las excluidas que ya tienen precio ({money(excludedCents)})
          </Text>
          <Switch
            value={subtractExcluded}
            onValueChange={setSubtractExcluded}
            accessibilityLabel="Restar del importe las líneas excluidas que ya tienen precio"
          />
        </View>
      ) : null}

      {distribution && amountCents !== null ? (
        <>
          <SectionHeader title="Resumen" icon="calculator-outline" />
          <Card>
            <InfoRow label="Importe escrito" value={money(amountCents)} />
            {takenExtras > 0 ? <InfoRow label="− Envío y aduanas" value={money(takenExtras)} /> : null}
            {takenExcluded > 0 ? <InfoRow label="− Líneas excluidas" value={money(takenExcluded)} /> : null}
            <InfoRow icon="cube-outline" label="A repartir" value={money(distribution.goodsCents)} isStrong />
            {distribution.differenceCents !== 0 ? (
              <Text style={styles.note}>
                Por el redondeo a céntimos, las líneas suman {money(distribution.resultingCents)} (
                {distribution.differenceCents > 0 ? '+' : ''}
                {money(distribution.differenceCents)}).
              </Text>
            ) : null}
          </Card>
          <Button
            icon="checkmark"
            label={isSaving ? 'Guardando…' : `Aplicar a ${plural(distribution.prices.length, 'línea', 'líneas')}`}
            onPress={handleSave}
            isDisabled={isSaving || amountError !== undefined}
          />
        </>
      ) : amountCents !== null && amountError === undefined ? (
        <Text style={styles.note}>Marca al menos una pieza para repartir el importe.</Text>
      ) : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    help: { ...typography.callout, color: theme.colors.textSecondary },
    note: { ...typography.footnote, color: theme.colors.textSecondary },
    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', minHeight: MIN_TOUCH, paddingVertical: spacing.xs },
    pressed: { opacity: 0.6 },
    lineText: { ...typography.body, color: theme.colors.text },
    muted: { color: theme.colors.textSecondary },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: MIN_TOUCH },
    switchLabel: { ...typography.body, color: theme.colors.text, flex: 1 },
  });
