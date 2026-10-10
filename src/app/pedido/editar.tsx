import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { announce, announceErrors, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { DateField } from '@/components/ui/DateField';
import { Card, EmptyState, FormScroll, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { getOrder, saveOrder } from '@/api/data';
import { getSettings } from '@/api/data';
import { listSuppliers } from '@/api/data';
import { todayIso } from '@/domain/dates';
import { centsToInput, formatRate, parseAmount, parseRate } from '@/domain/money';
import { CURRENCIES, ORDER_STATUSES, type Currency, type OrderStatus, type Supplier } from '@/domain/types';
import { ORDER_STATUS_ICON, ORDER_STATUS_LABEL } from '@/i18n/es';
import { goBack, parseIdParam } from '@/lib/params';
import { typography, useThemedStyles, type Theme } from '@/theme/theme';

const makeStyles = (theme: Theme) =>
  StyleSheet.create({ warning: { ...typography.footnote, color: theme.colors.warning.fg, fontWeight: '600' } });

interface FormState {
  supplierId: number | null;
  orderDate: string;
  status: OrderStatus;
  currency: Currency;
  shipping: string;
  shippingCurrency: Currency;
  customs: string;
  customsCurrency: Currency;
  rate: string;
  carrier: string;
  trackingNumber: string;
  notes: string;
}

type Errors = Partial<Record<'supplier' | 'shipping' | 'customs' | 'rate', string>>;

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (form.supplierId === null) errors.supplier = 'Elige un proveedor';
  if (form.shipping.trim() && parseAmount(form.shipping) === null) errors.shipping = 'Importe no válido';
  if (form.customs.trim() && parseAmount(form.customs) === null) errors.customs = 'Importe no válido';
  if (form.rate.trim() && parseRate(form.rate) === null) errors.rate = 'Cambio no válido (ej. 1,08)';
  return errors;
}

export default function OrderFormScreen() {
  const styles = useThemedStyles(makeStyles);
  const params = useLocalSearchParams<{ id?: string; supplierId?: string }>();
  const id = parseIdParam(params.id);
  const [suppliers, setSuppliers] = useState<readonly Supplier[] | null>(null);
  const [form, setForm] = useState<FormState>({
    supplierId: parseIdParam(params.supplierId),
    orderDate: todayIso(),
    status: 'borrador',
    currency: 'USD',
    shipping: '',
    shippingCurrency: 'USD',
    customs: '',
    customsCurrency: 'EUR',
    rate: '',
    carrier: '',
    trackingNumber: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [isSaving, setSaving] = useState(false);
  const [defaultRate, setDefaultRate] = useState('');
  const [loadedCurrency, setLoadedCurrency] = useState<Currency | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const load = async () => {
      const [list, settings, order] = await Promise.all([listSuppliers(), getSettings(), id ? getOrder(id) : null]);
      setSuppliers(list);
      setDefaultRate(formatRate(settings.fxRateMicros));
      if (id !== null && !order) {
        showError('Pedido no encontrado', new Error('Puede que se haya eliminado.'));
        goBack();
        return;
      }
      if (order) {
        setLoadedCurrency(order.currency);
        setForm({
          supplierId: order.supplierId,
          orderDate: order.orderDate,
          status: order.status,
          currency: order.currency,
          shipping: order.shippingCents ? centsToInput(order.shippingCents) : '',
          shippingCurrency: order.shippingCurrency,
          customs: order.customsCents ? centsToInput(order.customsCents) : '',
          customsCurrency: order.customsCurrency,
          rate: order.fxRateMicros ? formatRate(order.fxRateMicros) : '',
          carrier: order.carrier,
          trackingNumber: order.trackingNumber,
          notes: order.notes,
        });
      } else {
        const c = settings.defaultCurrency;
        setForm((f) => ({ ...f, currency: c, shippingCurrency: c, supplierId: f.supplierId ?? (list.length === 1 ? list[0].id : null) }));
      }
    };
    load().catch((e: unknown) => showError('No se pudo cargar el pedido', e));
  }, [id]);

  const handleSave = async () => {
    const found = validate(form);
    setErrors(found);
    if (!announceErrors(found) || form.supplierId === null || isSaving) return;
    setSaving(true);
    try {
      const savedId = await saveOrder(
        {
          supplierId: form.supplierId,
          orderDate: form.orderDate,
          status: form.status,
          currency: form.currency,
          shippingCents: parseAmount(form.shipping) ?? 0,
          shippingCurrency: form.shippingCurrency,
          customsCents: parseAmount(form.customs) ?? 0,
          customsCurrency: form.customsCurrency,
          fxRateMicros: form.rate.trim() ? parseRate(form.rate) : null,
          carrier: form.carrier,
          trackingNumber: form.trackingNumber,
          notes: form.notes,
        },
        id,
      );
      announce('Pedido guardado');
      if (id === null) router.replace({ pathname: '/pedido/[id]', params: { id: savedId } });
      else goBack();
    } catch (e: unknown) {
      showError('No se pudo guardar el pedido', e);
    } finally {
      setSaving(false);
    }
  };

  if (suppliers && suppliers.length === 0) {
    return (
      <EmptyState
        icon="people-outline"
        title="Primero, un proveedor"
        message="Para crear un pedido necesitas al menos un proveedor."
        actionLabel="Añadir proveedor"
        onAction={() => router.replace('/proveedor/editar')}
      />
    );
  }

  return (
    <FormScroll>
      <Stack.Screen options={{ title: id === null ? 'Nuevo pedido' : 'Editar pedido' }} />
      <Card>
        <ChipGroup<number>
          label={errors.supplier ? `Proveedor — ${errors.supplier}` : 'Proveedor'}
          value={form.supplierId}
          options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => set('supplierId', v)}
        />
        <DateField label="Fecha del pedido" value={form.orderDate} onChange={(v) => set('orderDate', v)} />
        <ChipGroup<Currency> label="Moneda de los productos" value={form.currency} options={currencyOptions} onChange={(v) => set('currency', v)} />
        {loadedCurrency !== null && loadedCurrency !== form.currency ? (
          <Text style={styles.warning}>
            Al guardar, los precios de las líneas se convertirán de {loadedCurrency} a {form.currency} con el cambio del pedido.
          </Text>
        ) : null}
        <ChipGroup<OrderStatus>
          label="Estado"
          value={form.status}
          options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], icon: ORDER_STATUS_ICON[s] }))}
          onChange={(v) => set('status', v)}
        />
      </Card>

      <SectionHeader title="Envío y aduanas" />
      <Card>
        <TextField label="Coste de envío" value={form.shipping} onChangeText={(v) => set('shipping', v)} keyboardType="decimal-pad" placeholder="0,00" error={errors.shipping} hint="Déjalo vacío si aún no lo sabes" />
        <ChipGroup<Currency> label="Moneda del envío" value={form.shippingCurrency} options={currencyOptions} onChange={(v) => set('shippingCurrency', v)} />
        <TextField label="Aduanas" value={form.customs} onChangeText={(v) => set('customs', v)} keyboardType="decimal-pad" placeholder="0,00" error={errors.customs} />
        <ChipGroup<Currency> label="Moneda de aduanas" value={form.customsCurrency} options={currencyOptions} onChange={(v) => set('customsCurrency', v)} />
        <TextField label="Transportista" value={form.carrier} onChangeText={(v) => set('carrier', v)} placeholder="DHL, FedEx, SF Express…" />
        <TextField label="Número de seguimiento" value={form.trackingNumber} onChangeText={(v) => set('trackingNumber', v)} autoCapitalize="characters" autoCorrect={false} />
      </Card>

      <SectionHeader title="Otros" />
      <Card>
        <TextField
          label="Cambio fijo para este pedido (1 € = … US$)"
          value={form.rate}
          onChangeText={(v) => set('rate', v)}
          keyboardType="decimal-pad"
          placeholder={defaultRate}
          error={errors.rate}
          hint={`Vacío = usar el cambio de Ajustes (${defaultRate})`}
        />
        <TextField label="Notas" value={form.notes} onChangeText={(v) => set('notes', v)} multiline maxLength={2000} />
      </Card>

      <Button label={isSaving ? 'Guardando…' : 'Guardar pedido'} icon="checkmark" onPress={handleSave} isDisabled={isSaving || suppliers === null} />
    </FormScroll>
  );
}
