import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useState } from 'react';
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

/** Stable empty list so the hooks below keep the same identity while the order loads. */
const EMPTY_LINES: readonly OrderLine[] = [];

type ReceptionRowProps = {
  line: OrderLine;
  value: string;
  isFull: boolean;
  hasError: boolean;
  onToggle: (lineId: number) => void;
  onChange: (lineId: number, text: string) => void;
};

/**
 * Memoized row: typing in one field must not re-render every other row of the order.
 * The callbacks are stable (useCallback in the parent) and the props are primitives.
 */
const ReceptionRow = memo(function ReceptionRow({ line, value, isFull, hasError, onToggle, onChange }: ReceptionRowProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const description = describeLine(line);
  return (
    <View style={styles.line}>
      <Pressable
        onPress={() => onToggle(line.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isFull }}
        accessibilityLabel={`${description}. ${isFull ? 'Recibida' : 'No recibida o incompleta'}`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Ionicons name={isFull ? 'checkbox' : 'square-outline'} size={26} color={isFull ? theme.colors.primary : theme.colors.textSecondary} />
        <Text style={styles.lineText}>{description}</Text>
      </Pressable>
      <TextField
        label={`Recibidas de ${formatQuantity(line.quantity)}`}
        value={value}
        onChangeText={(text) => onChange(line.id, text)}
        keyboardType="decimal-pad"
        placeholder="0"
        error={hasError ? 'Cantidad no válida' : undefined}
      />
    </View>
  );
});

export default function ReceptionScreen() {
  const orderId = parseIdParam(useLocalSearchParams<{ orderId: string }>().orderId);
  const styles = useThemedStyles(makeStyles);
  const { data, loading, error, reload } = useOrderDetail(orderId);
  const [received, setReceived] = useState<ReadonlyMap<number, string>>(new Map());
  const [isSeeded, setSeeded] = useState(false);
  const [isSaving, setSaving] = useState(false);

  // Hooks must run on every render, so the derived values are computed before the early
  // returns below, with safe fallbacks while the order is still loading.
  const lines = data?.lines ?? EMPTY_LINES;

  // Seed once from what was saved before (later focus reloads must not discard the checklist).
  // Done while rendering, so the first frame with data already shows the saved quantities.
  if (data && !isSeeded) {
    setSeeded(true);
    setReceived(new Map(data.lines.map((l) => [l.id, l.receivedQuantity === null ? '' : quantityToInput(l.receivedQuantity)])));
  }

  // Stable callbacks: the memoized rows only re-render when their own value changes.
  const setText = useCallback((lineId: number, text: string) => setReceived((prev) => new Map(prev).set(lineId, text)), []);
  const toggle = useCallback(
    (lineId: number) => {
      // Functional update: the callback stays stable, so the memoized rows do not re-render
      // on every keystroke.
      setReceived((prev) => {
        const quantity = lines.find((l) => l.id === lineId)?.quantity ?? 0;
        const parsed = parseReceived(prev.get(lineId) ?? '');
        const full = (parsed ?? 0) >= quantity;
        const next = new Map(prev);
        next.set(lineId, full ? '0' : quantityToInput(quantity));
        return next;
      });
    },
    [lines],
  );

  if (!data) {
    if (error) return <EmptyState icon="alert-circle-outline" title="No se pudo cargar el pedido" message={error} actionLabel="Reintentar" onAction={reload} />;
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;
  }
  const { order } = data;
  if (lines.length === 0) {
    return <EmptyState icon="cube-outline" title="El pedido no tiene líneas" message="Añade las piezas antes de recepcionarlo." />;
  }

  const textOf = (line: OrderLine) => received.get(line.id) ?? '';
  const receivedOf = (line: OrderLine) => parseReceived(textOf(line));
  const isFull = (line: OrderLine) => (receivedOf(line) ?? 0) >= line.quantity;
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
        {lines.map((line, index) => (
          <View key={line.id} style={index > 0 ? styles.separated : undefined}>
            <ReceptionRow
              line={line}
              value={textOf(line)}
              isFull={isFull(line)}
              hasError={receivedOf(line) === undefined}
              onToggle={toggle}
              onChange={setText}
            />
          </View>
        ))}
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
