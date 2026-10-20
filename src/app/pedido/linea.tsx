import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { announce, announceErrors, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { EmptyState, FormScroll } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { deleteLine, getLine, saveLine } from '@/api/data';
import { getOrder } from '@/api/data';
import { formatQuantity } from '@/domain/exportText';
import { centsToInput, currencySymbol, parseAmount, parseDecimal } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { goBack, parseIdParam } from '@/lib/params';
import { typography, useThemedStyles, type Theme } from '@/theme/theme';

type Errors = Partial<Record<'quantity' | 'pieceType' | 'price', string>>;

export default function LineFormScreen() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ orderId: string; id?: string }>();
  const orderId = parseIdParam(params.orderId);
  const id = parseIdParam(params.id);
  const [currency, setCurrency] = useState<Currency>('EUR');
  const [quantity, setQuantity] = useState('1');
  const [pieceType, setPieceType] = useState('');
  const [measurements, setMeasurements] = useState('');
  const [price, setPrice] = useState('');
  const [rawText, setRawText] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (orderId === null) return;
    const load = async () => {
      const [order, line] = await Promise.all([getOrder(orderId), id ? getLine(id) : null]);
      if (!order || (id !== null && !line)) {
        showError('No encontrado', new Error('El pedido o la línea ya no existen.'));
        goBack();
        return;
      }
      setCurrency(order.currency);
      if (line) {
        setQuantity(formatQuantity(line.quantity));
        setPieceType(line.pieceType);
        setMeasurements(line.measurements);
        setPrice(centsToInput(line.unitPriceCents));
        setRawText(line.rawText);
      }
    };
    load().catch((e: unknown) => showError('No se pudo cargar la línea', e));
  }, [orderId, id]);

  if (orderId === null) {
    return <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Falta el identificador del pedido." />;
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
      await saveLine(orderId, { quantity: qty, pieceType, measurements, unitPriceCents, rawText }, id);
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

  return (
    <FormScroll>
      <Stack.Screen options={{ title: id === null ? 'Nueva línea' : 'Editar línea' }} />
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
      <Button label={isSaving ? 'Guardando…' : 'Guardar línea'} icon="checkmark" onPress={handleSave} isDisabled={isSaving} />
      {id !== null ? <Button variant="destructive" label="Eliminar línea" icon="trash-outline" onPress={handleDelete} /> : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({ raw: { ...typography.footnote, color: theme.colors.textSecondary } });
