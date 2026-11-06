import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { announce, announceErrors, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorView, FormScroll } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { deleteLine, getLine, getOrder, saveLine, setLineExcluded, substituteLine } from '@/api/data';
import { formatQuantity } from '@/domain/exportText';
import { centsToInput, currencySymbol, parseAmount, parseDecimal } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { goBack, parseIdParam } from '@/lib/params';
import { typography, useThemedStyles, type Theme } from '@/theme/theme';

type Errors = Partial<Record<'quantity' | 'pieceType' | 'price', string>>;

export default function LineFormScreen() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ orderId: string; id?: string; substituteFor?: string }>();
  const orderId = parseIdParam(params.orderId);
  const id = parseIdParam(params.id);
  // Substitution: a new line that replaces this one (the original is left out of the order on save).
  const substituteFor = id === null ? parseIdParam(params.substituteFor) : null;
  const [substitutedText, setSubstitutedText] = useState('');
  const [isExcluded, setExcluded] = useState(false);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [quantity, setQuantity] = useState('1');
  const [pieceType, setPieceType] = useState('');
  const [measurements, setMeasurements] = useState('');
  const [price, setPrice] = useState('');
  const [rawText, setRawText] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [isSaving, setSaving] = useState(false);
  // A failed load must not leave a plausible-looking form: saving would overwrite the
  // existing line with the defaults. Show the error and offer a retry instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const retryLoad = () => {
    setLoadError(null);
    setLoadAttempt((n) => n + 1);
  };

  useEffect(() => {
    if (orderId === null) return;
    const load = async () => {
      const [order, line, original] = await Promise.all([
        getOrder(orderId),
        id ? getLine(id) : null,
        substituteFor ? getLine(substituteFor) : null,
      ]);
      if (!order || (id !== null && !line) || (substituteFor !== null && !original)) {
        showError('No encontrado', new Error('El pedido o la línea ya no existen.'));
        goBack();
        return;
      }
      setCurrency(order.currency);
      if (original) {
        // Same number of pieces by default; the product and its price are the ones agreed now.
        setQuantity(formatQuantity(original.quantity));
        setSubstitutedText([formatQuantity(original.quantity), original.pieceType, original.measurements].filter(Boolean).join(' '));
      }
      if (line) {
        setExcluded(line.isExcluded);
        setQuantity(formatQuantity(line.quantity));
        setPieceType(line.pieceType);
        setMeasurements(line.measurements);
        setPrice(centsToInput(line.unitPriceCents));
        setRawText(line.rawText);
      }
    };
    load().catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la línea'));
  }, [orderId, id, substituteFor, loadAttempt]);

  if (orderId === null) {
    return <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Falta el identificador del pedido." />;
  }

  if (loadError) {
    return <ErrorView message={loadError} onRetry={retryLoad} />;
  }

  const handleSave = async () => {
    const qty = parseDecimal(quantity.trim());
    const unitPriceCents = price.trim() ? parseAmount(price) : null;
    const found: Errors = {};
    if (qty === null || qty <= 0) found.quantity = 'Introduce una cantidad mayor que 0';
    if (!pieceType.trim()) found.pieceType = 'Indica el tipo de pieza';
    if (price.trim() && unitPriceCents === null) found.price = 'Precio no válido';
    setErrors(found);
    if (!announceErrors(found) || qty === null || isSaving) return;
    setSaving(true);
    try {
      const input = { quantity: qty, pieceType, measurements, unitPriceCents, rawText };
      if (substituteFor !== null) {
        await substituteLine(substituteFor, input);
        announce('Sustitución guardada: la línea original ya no cuenta en el pedido');
        // Back past the original line's form, straight to the order.
        router.dismissTo({ pathname: '/pedido/[id]', params: { id: orderId } });
        return;
      }
      await saveLine(orderId, input, id);
      announce('Línea guardada');
      goBack();
    } catch (e: unknown) {
      showError('No se pudo guardar la línea', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () =>
    id !== null &&
    confirmDestructive({
      title: '¿Eliminar esta línea?',
      message: `${quantity} ${pieceType} ${measurements}`.trim(),
      confirmLabel: 'Eliminar',
      onConfirm: () => {
        deleteLine(id)
          .then(() => goBack())
          .catch((e: unknown) => showError('No se pudo eliminar', e));
      },
    });

  const toggleExcluded = () => {
    if (id === null || isSaving) return;
    setSaving(true);
    setLineExcluded(id, !isExcluded)
      .then(() => {
        announce(isExcluded ? 'Línea incluida de nuevo en el pedido' : 'Línea quitada del pedido');
        goBack();
      })
      .catch((e: unknown) => showError('No se pudo cambiar la línea', e))
      .finally(() => setSaving(false));
  };

  const title = substituteFor !== null ? 'Sustituir producto' : id === null ? 'Nueva línea' : 'Editar línea';

  return (
    <FormScroll>
      <Stack.Screen options={{ title }} />
      {substituteFor !== null ? (
        <Text style={styles.notice}>
          Sustituye a: {substitutedText}. Al guardar, esa línea deja de contar en el total y en los pagos.
        </Text>
      ) : null}
      {isExcluded ? <Text style={styles.notice}>Esta línea no está incluida: no cuenta en el total ni en los pagos.</Text> : null}
      <TextField label="Número de piezas" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" error={errors.quantity} />
      <TextField label="Tipo de pieza" value={pieceType} onChangeText={setPieceType} error={errors.pieceType} placeholder="tornillo, placa, tubo…" />
      <TextField label="Medidas" value={measurements} onChangeText={setMeasurements} placeholder="M8x40, 200x300x5…" autoCapitalize="none" />
      <TextField
        label={`Precio por pieza (${currencySymbol(currency)})`}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        placeholder="Pendiente"
        error={errors.price}
        hint="Déjalo vacío si aún no lo sabes; podrás añadirlo después."
      />
      {rawText ? <Text style={styles.raw}>Texto original: «{rawText}»</Text> : null}
      <Button
        label={isSaving ? 'Guardando…' : substituteFor !== null ? 'Guardar sustitución' : 'Guardar línea'}
        icon="checkmark"
        onPress={handleSave}
        isDisabled={isSaving}
      />
      {id !== null ? (
        <>
          <Button
            variant="secondary"
            label="Sustituir por otro producto"
            icon="swap-horizontal-outline"
            accessibilityHint="Crea una línea con el producto y precio acordados y quita esta del pedido"
            onPress={() => router.push({ pathname: '/pedido/linea', params: { orderId, substituteFor: id } })}
            isDisabled={isSaving}
          />
          <Button
            variant="secondary"
            label={isExcluded ? 'Volver a incluir en el pedido' : 'Quitar del pedido (no enviado)'}
            icon={isExcluded ? 'add-circle-outline' : 'remove-circle-outline'}
            accessibilityHint="La línea se conserva, pero no cuenta en el total ni en lo pendiente de pago"
            onPress={toggleExcluded}
            isDisabled={isSaving}
          />
          <Button variant="destructive" label="Eliminar línea" icon="trash-outline" onPress={handleDelete} />
        </>
      ) : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    raw: { ...typography.footnote, color: theme.colors.textSecondary },
    notice: { ...typography.callout, color: theme.colors.warning.fg, fontWeight: '600' },
  });
