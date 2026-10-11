import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { announce, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, FormScroll, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { importLines, saveOrder } from '@/api/data';
import { formatQuantity } from '@/domain/exportText';
import { formatMoney } from '@/domain/money';
import { plural } from '@/domain/exportText';
import type { Currency } from '@/domain/types';
import { canImport, ISSUE_NO_QUANTITY, parseWhatsAppMessage, toImportableLine, type ParsedLine } from '@/domain/whatsappParser';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { goBack, parseIdParam } from '@/lib/params';
import { MIN_TOUCH, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

const EXAMPLE = '10 tornillo M8x40\n100 pcs Hex bolt M8x40 $0.05 each\n12 piezas tubo 25x2 @ 4,20€\nEnvío / Shipping: 25 €';

function defaultExcluded(lines: readonly ParsedLine[]): Set<number> {
  return new Set(lines.flatMap((l, i) => (!canImport(l) || l.issues.includes(ISSUE_NO_QUANTITY) ? [i] : [])));
}

function describeLine(line: ParsedLine, orderCurrency: Currency): string {
  const priceText =
    line.unitPriceCents === null ? 'sin precio' : `${formatMoney(line.unitPriceCents, line.priceCurrency ?? orderCurrency)}/ud`;
  return [`${formatQuantity(line.quantity)} ×`, line.pieceType || '—', line.measurements, '·', priceText].filter(Boolean).join(' ');
}

export default function ImportScreen() {
  const orderId = parseIdParam(useLocalSearchParams<{ orderId: string }>().orderId) ?? 0;
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, loading } = useOrderDetail(orderId);
  const [text, setText] = useState('');
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isSaving, setSaving] = useState(false);
  const message = useMemo(() => parseWhatsAppMessage(text), [text]);
  const parsed = message.lines;
  const [applyShipping, setApplyShipping] = useState(true);

  if (!data) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;
  }
  const { order, totals, lines: existing } = data;

  const updateText = (value: string) => {
    setText(value);
    setExcluded(defaultExcluded(parseWhatsAppMessage(value).lines));
  };
  const toggle = (index: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const included = parsed.filter((line, i) => !excluded.has(i) && canImport(line));
  const willApplyShipping = Boolean(message.shipping && applyShipping);
  const linesLabel = plural(included.length, 'línea', 'líneas');
  const importLabel = isSaving
    ? 'Guardando…'
    : included.length === 0
      ? 'Actualizar el envío'
      : `${replaceExisting ? 'Reemplazar con' : 'Añadir'} ${linesLabel}${willApplyShipping ? ' y el envío' : ''}`;

  const handlePaste = async () => {
    try {
      const value = await Clipboard.getStringAsync();
      if (value) updateText(value);
      else announce('El portapapeles está vacío');
    } catch (e: unknown) {
      showError('No se pudo leer el portapapeles', e);
    }
  };

  const runImport = async () => {
    if (isSaving) return;
    setSaving(true);
    try {
      const inputs = included.map((line) => toImportableLine(line, order.currency, totals.rateMicros));
      if (inputs.length > 0) await importLines(order.id, inputs, replaceExisting);
      if (message.shipping && applyShipping) {
        const { id: _id, ...orderInput } = order;
        await saveOrder(
          { ...orderInput, shippingCents: message.shipping.cents, shippingCurrency: message.shipping.currency ?? order.currency },
          order.id,
        );
      }
      announce(`${inputs.length} líneas añadidas`);
      goBack();
    } catch (e: unknown) {
      showError('No se pudieron añadir las líneas', e);
    } finally {
      setSaving(false);
    }
  };

  const handleImport = () => {
    if (!replaceExisting || included.length === 0) {
      void runImport();
      return;
    }
    confirmDestructive({
      title: `¿Reemplazar las ${existing.length} líneas actuales?`,
      message: 'Se borrarán las líneas actuales, incluidos los precios que hayas añadido. No se puede deshacer.',
      confirmLabel: 'Reemplazar',
      onConfirm: () => void runImport(),
    });
  };

  return (
    <FormScroll>
      <Text style={styles.help}>
        Copia el mensaje de WhatsApp y pégalo aquí. Una pieza por línea: cantidad, tipo de pieza, medidas y, si lo sabes, el
        precio por unidad (en español o en inglés). Si el mensaje incluye el envío, también se detecta. Precios sin
        símbolo se toman en {order.currency}.
      </Text>
      <Button variant="secondary" icon="clipboard-outline" label="Pegar del portapapeles" onPress={handlePaste} />
      <TextField label="Texto del pedido" value={text} onChangeText={updateText} multiline placeholder={EXAMPLE} autoCorrect={false} autoCapitalize="none" />

      {parsed.length > 0 || message.shipping || message.ignored.length > 0 ? (
        <>
          <SectionHeader title={`Vista previa (${included.length} de ${parsed.length})`} />
          <Card>
            {parsed.map((line, index) => {
              const isIncluded = !excluded.has(index) && canImport(line);
              return (
                <Pressable
                  key={`${index}-${line.rawText}`}
                  onPress={() => canImport(line) && toggle(index)}
                  disabled={!canImport(line)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isIncluded, disabled: !canImport(line) }}
                  accessibilityLabel={`${describeLine(line, order.currency)}${line.issues.length ? `. Revisar: ${line.issues.join(', ')}` : ''}`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <Ionicons name={isIncluded ? 'checkbox' : 'square-outline'} size={24} color={isIncluded ? theme.colors.primary : theme.colors.textSecondary} />
                  <View style={styles.flex}>
                    <Text style={[styles.lineText, !isIncluded && styles.excluded]}>{describeLine(line, order.currency)}</Text>
                    {line.issues.length > 0 ? <Text style={styles.issue}>⚠︎ {line.issues.join(' · ')}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </Card>
          {message.shipping ? (
            <>
              <SectionHeader title="Envío detectado" icon="airplane-outline" />
              <Card>
                <Text style={styles.lineText}>
                  {formatMoney(message.shipping.cents, message.shipping.currency ?? order.currency)}
                  {message.shipping.currency ? '' : ` (sin moneda: se toma ${order.currency})`}
                </Text>
                <Text style={styles.raw}>«{message.shipping.rawText}»</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
                    Actualizar el coste de envío del pedido
                    {order.shippingCents > 0 ? ` (ahora ${formatMoney(order.shippingCents, order.shippingCurrency)})` : ''}
                  </Text>
                  <Switch
                    value={applyShipping}
                    onValueChange={setApplyShipping}
                    accessibilityLabel="Actualizar el coste de envío del pedido"
                  />
                </View>
              </Card>
            </>
          ) : null}
          {message.ignored.length > 0 ? (
            <Text style={styles.raw}>
              No se importan (totales u otros envíos): {message.ignored.map((line) => `«${line}»`).join(', ')}
            </Text>
          ) : null}
          {existing.length > 0 ? (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
                Reemplazar las {existing.length} líneas actuales
              </Text>
              <Switch
                value={replaceExisting}
                onValueChange={setReplaceExisting}
                accessibilityLabel={`Reemplazar las ${existing.length} líneas actuales`}
              />
            </View>
          ) : null}
          <Button
            icon="download-outline"
            variant={replaceExisting ? 'destructive' : 'primary'}
            label={importLabel}
            onPress={handleImport}
            isDisabled={(included.length === 0 && !willApplyShipping) || isSaving}
          />
        </>
      ) : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    help: { ...typography.callout, color: theme.colors.textSecondary },
    row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', minHeight: MIN_TOUCH, paddingVertical: spacing.xs },
    pressed: { opacity: 0.6 },
    lineText: { ...typography.body, color: theme.colors.text },
    excluded: { color: theme.colors.textSecondary, textDecorationLine: 'line-through' },
    issue: { ...typography.footnote, color: theme.colors.warning.fg, fontWeight: '600' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: MIN_TOUCH },
    switchLabel: { ...typography.body, color: theme.colors.text, flex: 1 },
    raw: { ...typography.footnote, color: theme.colors.textSecondary },
  });
