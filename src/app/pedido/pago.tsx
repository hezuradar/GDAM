import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { announce, announceErrors, confirmDestructive, showError } from '@/components/ui/alerts';
import { Button, ButtonRow } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { DateField } from '@/components/ui/DateField';
import { Card, EmptyState, ErrorView, FormScroll, InfoRow, LoadingView } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { deletePayment, getPayment, savePayment } from '@/api/data';
import { isValidIsoDate, todayIso } from '@/domain/dates';
import { centsToInput, convert, convertInput, currencySymbol, formatMoney, formatRate, parseAmount, parseRate, withUsdRate } from '@/domain/money';
import { CURRENCIES, PAYMENT_METHODS, type Currency, type PaymentMethod } from '@/domain/types';
import { useOrderDetail } from '@/hooks/useOrderDetail';
import { PAYMENT_METHOD_LABEL } from '@/i18n/es';
import { goBack, parseIdParam } from '@/lib/params';
import { typography, useThemedStyles, type Theme } from '@/theme/theme';

type Errors = Partial<Record<'amount' | 'rate' | 'date', string>>;

export default function PaymentFormScreen() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ orderId: string; id?: string }>();
  const orderId = parseIdParam(params.orderId);
  const id = parseIdParam(params.id);
  const { data, error, loading, reload } = useOrderDetail(orderId);
  const [isSaving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [rate, setRate] = useState('');
  /** Rate frozen with the payment being edited (null = a new payment). */
  const [frozenRate, setFrozenRate] = useState<number | null>(null);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('transferencia');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  // A failed load must not leave a plausible-looking form: saving would overwrite the
  // existing payment with the defaults. Show the error and offer a retry instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  // Reset while rendering, before the load: the same screen instance can move to another
  // payment or order, and a retry must not keep what the failed attempt left.
  const loadKey = `${orderId}:${id}:${loadAttempt}`;
  const [formKey, setFormKey] = useState(loadKey);
  if (formKey !== loadKey) {
    setFormKey(loadKey);
    setLoadError(null);
    setAmount('');
    setCurrency(null);
    setRate('');
    setFrozenRate(null);
    setPaidOn(todayIso());
    setMethod('transferencia');
    setNote('');
  }

  useEffect(() => {
    if (id === null) return;
    getPayment(id)
      .then((p) => {
        if (!p) {
          showError('Pago no encontrado', new Error('Puede que se haya eliminado.'));
          goBack();
          return;
        }
        setAmount(centsToInput(p.amountCents));
        setCurrency(p.currency);
        // The rate the payment was registered with: it stays frozen unless the user changes it.
        setFrozenRate(p.snapshot?.usdMicros ?? null);
        setRate(p.snapshot?.usdMicros ? formatRate(p.snapshot.usdMicros) : '');
        setPaidOn(p.paidOn);
        setMethod(p.method);
        setNote(p.note);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'No se pudo cargar el pago'));
  }, [id, orderId, loadAttempt]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (loadError) return <ErrorView message={loadError} onRetry={() => setLoadAttempt((n) => n + 1)} />;
  if (!data) {
    return loading ? <LoadingView /> : <EmptyState icon="help-circle-outline" title="Pedido no encontrado" message="Puede que se haya eliminado." />;
  }
  const { order, totals, payment } = data;
  const payCurrency = currency ?? order.currency;
  const isForeign = payCurrency !== order.currency;
  // A bank EUR↔USD rate can be frozen on the payment; rupee payments always use the market rate.
  const isEurUsdPair = isForeign && payCurrency !== 'INR' && order.currency !== 'INR';
  // What the payment is worth with: the typed rate, else the rate it was registered with,
  // else the order's rate (the server freezes the same one when it saves).
  const rateMicros = isEurUsdPair ? (parseRate(rate) ?? frozenRate ?? totals.rates.usdMicros) : null;
  const paymentRates = withUsdRate(totals.rates, rateMicros);
  const amountCents = parseAmount(amount);
  const fillPending = (fraction: number) =>
    setAmount(centsToInput(Math.round(convert(payment.pendingCents * fraction, order.currency, payCurrency, totals.rates))));

  /** Switching the payment currency converts the typed amount (bank rate if typed, else the order's). */
  const changePayCurrency = (next: Currency) => {
    setAmount((typed) => convertInput(typed, payCurrency, next, withUsdRate(totals.rates, parseRate(rate))));
    setCurrency(next);
  };

  const handleSave = async () => {
    const found: Errors = {};
    if (amountCents === null || amountCents <= 0) found.amount = 'Introduce un importe mayor que 0';
    if (isEurUsdPair && rate.trim() && parseRate(rate) === null) found.rate = 'Cambio no válido (ej. 1,08)';
    if (!isValidIsoDate(paidOn)) found.date = 'Fecha no válida';
    setErrors(found);
    if (!announceErrors(found) || amountCents === null || isSaving) return;
    setSaving(true);
    try {
      await savePayment(
        order.id,
        { amountCents, currency: payCurrency, paidOn, method, fxRateMicros: isEurUsdPair ? parseRate(rate) : null, note },
        id,
      );
      announce('Pago guardado');
      goBack();
    } catch (e: unknown) {
      showError('No se pudo guardar el pago', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () =>
    id !== null &&
    confirmDestructive({
      title: '¿Eliminar este pago?',
      message: amountCents ? formatMoney(amountCents, payCurrency) : '',
      confirmLabel: 'Eliminar',
      onConfirm: () => {
        deletePayment(id)
          .then(() => goBack())
          .catch((e: unknown) => showError('No se pudo eliminar', e));
      },
    });

  return (
    <FormScroll>
      <Stack.Screen options={{ title: id === null ? 'Registrar pago' : 'Editar pago' }} />
      <Card>
        <InfoRow label="Total del pedido" value={formatMoney(totals.totalCents, order.currency)} />
        <InfoRow label="Pendiente" value={formatMoney(payment.pendingCents, order.currency)} isStrong />
      </Card>
      <TextField label={`Importe (${currencySymbol(payCurrency)})`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={errors.amount} autoFocus={id === null} />
      {id === null && payment.pendingCents > 0 ? (
        <ButtonRow>
          <Button variant="secondary" label="Todo lo pendiente" onPress={() => fillPending(1)} accessibilityHint="Rellena el importe con el total pendiente" />
          <Button variant="secondary" label="50 %" onPress={() => fillPending(0.5)} accessibilityHint="Rellena la mitad de lo pendiente" />
        </ButtonRow>
      ) : null}
      <ChipGroup<Currency> label="Moneda del pago" value={payCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={changePayCurrency} />
      {isForeign ? (
        <>
          {isEurUsdPair ? (
            <TextField
              label="Cambio aplicado (1 € = … US$)"
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              placeholder={formatRate(totals.rates.usdMicros)}
              error={errors.rate}
              hint="El del banco, si lo sabes. Vacío = el cambio con el que se registró."
            />
          ) : (
            <Text style={styles.equivalent}>Cambio de mercado: 1 € = {formatRate(totals.rates.inrMicros)} ₹</Text>
          )}
          {amountCents ? (
            <Text style={styles.equivalent} accessibilityLiveRegion="polite">
              Equivale a {formatMoney(convert(amountCents, payCurrency, order.currency, paymentRates), order.currency)}
            </Text>
          ) : null}
        </>
      ) : null}
      <DateField label="Fecha del pago" value={paidOn} onChange={setPaidOn} error={errors.date} />
      <ChipGroup<PaymentMethod> label="Forma de pago" value={method} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} onChange={setMethod} />
      <TextField label="Nota" value={note} onChangeText={setNote} placeholder="Referencia de la transferencia…" maxLength={500} />
      <Button label={isSaving ? 'Guardando…' : 'Guardar pago'} icon="checkmark" onPress={handleSave} isDisabled={isSaving} />
      {id !== null ? <Button variant="destructive" label="Eliminar pago" icon="trash-outline" onPress={handleDelete} /> : null}
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({ equivalent: { ...typography.callout, color: theme.colors.textSecondary } });
