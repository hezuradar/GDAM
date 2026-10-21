import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { saveReception } from '@/api/data';
import { announce, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState, FormScroll, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { formatQuantity, plural } from '@/domain/exportText';
import { parseDecimal } from '@/domain/money';
import { receptionSummary } from '@/domain/reception';
import type { OrderLine } from '@/domain/types';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { goBack, parseIdParam } from '@/lib/params';
import { MIN_TOUCH, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

const quantityToInput = (q: number) => String(q).replace('.', ',');
/** Empty → null (not checked); invalid → undefined. */
const parseReceived = (text: string): number | null | undefined => {
  if (text.trim() === '') return null;
  return parseDecimal(text.trim()) ?? undefined;
};
const describeLine = (line: OrderLine) =>
  [`${formatQuantity(line.quantity)} ×`, line.pieceType, line.measurements].filter(Boolean).join(' ');

export default function ReceptionScreen() {
  const orderId = parseIdParam(useLocalSearchParams<{ orderId: string }>().orderId);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { data, loading, error, reload } = useOrderDetail(orderId);
  const [received, setReceived] = useState<ReadonlyMap<number, string>>(new Map());
  const [isSeeded, setSeeded] = useState(false);
  const [isSaving, setSaving] = useState(false);

  // Seed once from what was saved before (later focus reloads must not discard the checklist).
  useEffect(() => {
    if (!data || isSeeded) return;
    setSeeded(true);
    setReceived(new Map(data.lines.map((l) => [l.id, l.receivedQuantity === null ? '' : quantityToInput(l.receivedQuantity)])));
  }, [data, isSeeded]);

  if (!data) {
    if (error) return <EmptyState icon="alert-circle-outline" title="No se pudo cargar el pedido" message={error} actionLabel="Reintentar" onAction={reload} />;
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;
  }
  const { order, lines } = data;
  if (lines.length === 0) {
    return <EmptyState icon="cube-outline" title="El pedido no tiene líneas" message="Añade las piezas antes de recepcionarlo." />;
  }

  const textOf = (line: OrderLine) => received.get(line.id) ?? '';
  const receivedOf = (line: OrderLine) => parseReceived(textOf(line));
  const isFull = (line: OrderLine) => (receivedOf(line) ?? 0) >= line.quantity;
  const setText = (lineId: number, text: string) => setReceived((prev) => new Map(prev).set(lineId, text));
  const toggle = (line: OrderLine) => setText(line.id, isFull(line) ? '0' : quantityToInput(line.quantity));
  const markAll = () => {
    setReceived(new Map(lines.map((l) => [l.id, quantityToInput(l.quantity)])));
    announce('Todo marcado como recibido');
  };

  const hasInvalid = lines.some((l) => receivedOf(l) === undefined);
  // On saving, a line left unmarked means it did not arrive.
  const payload = lines.map((l) => ({ lineId: l.id, receivedQuantity: receivedOf(l) ?? 0 }));
  const summary = receptionSummary(lines.map((l, i) => ({ id: l.id, quantity: l.quantity, receivedQuantity: payload[i].receivedQuantity })));
  const missingText = `Faltan ${formatQuantity(summary.missingPieces)} ${summary.missingPieces === 1 ? 'pieza' : 'piezas'} en ${plural(summary.missingLines, 'línea', 'líneas')}`;

  const save = async (markReceived: boolean) => {
    if (isSaving || hasInvalid) return;
    setSaving(true);
    try {
      await saveReception(order.id, payload, markReceived);
      announce(markReceived ? 'Recepción confirmada' : 'Recepción guardada');
      goBack();
    } catch (e: unknown) {
      showError('No se pudo guardar la recepción', e);
    } finally {
      setSaving(false);
    }
  };
  const handleConfirm = () => {
    if (summary.isComplete) {
      void save(true);
      return;
    }
    confirmDestructive({
      title: '¿Confirmar con piezas pendientes?',
      message: `${missingText}. El pedido quedará como recibido; cuando llegue el resto, vuelve a «Recepcionar pedido».`,
      confirmLabel: 'Confirmar recepción',
      onConfirm: () => void save(true),
    });
  };

  return (
    <FormScroll>
      <Text style={styles.help}>
        Marca lo que ha llegado. Si de una línea llegó solo una parte, escribe cuántas piezas. Lo que quede sin marcar se
        guarda como no recibido.
      </Text>
      <Button variant="secondary" icon="checkmark-done-outline" label="Marcar todo como recibido" onPress={markAll} />

      <SectionHeader title={`Piezas (${summary.completeLines} de ${lines.length} completas)`} icon="cube-outline" />
      <Card>
        {lines.map((line, index) => {
          const value = receivedOf(line);
          const full = isFull(line);
          const description = describeLine(line);
          return (
            <View key={line.id} style={[styles.line, index > 0 && styles.separated]}>
              <Pressable
                onPress={() => toggle(line)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: full }}
                accessibilityLabel={`${description}. ${full ? 'Recibida' : 'No recibida o incompleta'}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Ionicons name={full ? 'checkbox' : 'square-outline'} size={26} color={full ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={styles.lineText}>{description}</Text>
              </Pressable>
              <TextField
                label={`Recibidas de ${formatQuantity(line.quantity)}`}
                value={textOf(line)}
                onChangeText={(text) => setText(line.id, text)}
                keyboardType="decimal-pad"
                placeholder="0"
                error={value === undefined ? 'Cantidad no válida' : undefined}
              />
            </View>
          );
        })}
      </Card>

      <Card>
        <Text style={summary.isComplete ? styles.ok : styles.warning}>
          {summary.isComplete ? '✓ Todo recibido' : `⚠︎ ${missingText}`}
        </Text>
      </Card>
      <Button
        icon="checkmark"
        label={isSaving ? 'Guardando…' : 'Confirmar recepción'}
        onPress={handleConfirm}
        isDisabled={isSaving || hasInvalid}
        accessibilityHint="Guarda lo recibido y marca el pedido como recibido"
      />
      <Button
        variant="secondary"
        icon="save-outline"
        label="Guardar sin cambiar el estado"
        onPress={() => void save(false)}
        isDisabled={isSaving || hasInvalid}
        accessibilityHint="Guarda lo recibido hasta ahora; el pedido mantiene su estado"
      />
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    help: { ...typography.callout, color: theme.colors.textSecondary },
    line: { gap: spacing.xs, paddingVertical: spacing.sm },
    separated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
    pressed: { opacity: 0.6 },
    lineText: { ...typography.body, color: theme.colors.text, flex: 1 },
    ok: { ...typography.body, color: theme.colors.text, fontWeight: '600' },
    warning: { ...typography.body, color: theme.colors.warning.fg, fontWeight: '600' },
  });
