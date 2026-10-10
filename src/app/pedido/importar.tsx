import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { announce, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, FormScroll, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { importLines } from '@/api/data';
import { formatQuantity } from '@/domain/exportText';
import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { canImport, ISSUE_NO_QUANTITY, parseWhatsAppText, toImportableLine, type ParsedLine } from '@/domain/whatsappParser';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { goBack, parseIdParam } from '@/lib/params';
import { MIN_TOUCH, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

const EXAMPLE = '10 tornillo M8x40\n5 x placa 200x300x5 3.50\n12 pcs tubo 25x2 L=1000 @ 4,20€';

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
  const parsed = useMemo(() => parseWhatsAppText(text), [text]);

  if (!data) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;
  }
  const { order, totals, lines: existing } = data;

  const updateText = (value: string) => {
    setText(value);
    setExcluded(defaultExcluded(parseWhatsAppText(value)));
  };
  const toggle = (index: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const included = parsed.filter((line, i) => !excluded.has(i) && canImport(line));

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
      await importLines(order.id, inputs, replaceExisting);
      announce(`${inputs.length} líneas añadidas`);
      goBack();
    } catch (e: unknown) {
      showError('No se pudieron añadir las líneas', e);
    } finally {
      setSaving(false);
    }
  };

  const handleImport = () => {
    if (!replaceExisting) {
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
        precio por unidad. Precios sin símbolo se toman en {order.currency}.
      </Text>
      <Button variant="secondary" icon="clipboard-outline" label="Pegar del portapapeles" onPress={handlePaste} />
      <TextField label="Texto del pedido" value={text} onChangeText={updateText} multiline placeholder={EXAMPLE} autoCorrect={false} autoCapitalize="none" />

      {parsed.length > 0 ? (
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
            label={
              isSaving
                ? 'Guardando…'
                : `${replaceExisting ? 'Reemplazar con' : 'Añadir'} ${included.length} ${included.length === 1 ? 'línea' : 'líneas'}`
            }
            onPress={handleImport}
            isDisabled={included.length === 0 || isSaving}
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
  });
