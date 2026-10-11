import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { announce, announceErrors, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, ErrorView, FormScroll, InfoRow, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { exportBackupJson } from '@/api/data';
import { getSettings, logout, refreshFxRate, saveSettings, type AppSettings } from '@/api/data';
import { todayIso } from '@/domain/dates';
import { formatDate } from '@/domain/exportText';
import { formatRate, parseRate } from '@/domain/money';
import { CURRENCIES, type Currency } from '@/domain/types';
import { useLoader } from '@/hooks/useLoader';
import { CURRENCY_LABEL } from '@/i18n/es';
import { saveTextFile } from '@/lib/share';
import { MIN_TOUCH, spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

const SOURCE_LABEL: Record<string, string> = {
  'open.er-api.com': 'ExchangeRate-API (open.er-api.com)',
  'currency-api': 'Currency API (jsDelivr)',
  manual: 'introducido a mano',
};

/** "2026-10-10" or an ISO date-time → Spanish short date (and time when present). */
function formatWhen(value: string | null): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function rateDescription(settings: AppSettings): string {
  if (!settings.fxSource) return 'Todavía no se ha descargado ningún cambio.';
  const source = SOURCE_LABEL[settings.fxSource] ?? settings.fxSource;
  return settings.fxSource === 'manual'
    ? `Cambio ${source} el ${formatWhen(settings.fxUpdatedAt)}.`
    : `Fuente: ${source}. Cotización del ${formatWhen(settings.fxAsOf)}, comprobada el ${formatWhen(settings.fxUpdatedAt)}.`;
}

export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(getSettings);
  const [isAuto, setAuto] = useState(true);
  const [rateText, setRateText] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [rateError, setRateError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [isRefreshing, setRefreshing] = useState(false);

  // Seed the form once: later focus reloads must not discard unsaved edits.
  const isSeeded = useRef(false);
  useEffect(() => {
    if (!data || isSeeded.current) return;
    isSeeded.current = true;
    setAuto(data.fxAuto);
    setRateText(formatRate(data.fxRateMicros));
    setCurrency(data.defaultCurrency);
  }, [data]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data) return loading ? <LoadingView /> : null;

  const markDirty = () => setSavedMessage(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const settings = await refreshFxRate();
      setRateText(formatRate(settings.fxRateMicros));
      announce(`Cambio actualizado: 1 euro igual a ${formatRate(settings.fxRateMicros)} dólares`);
      await reload();
    } catch (e: unknown) {
      showError('No se pudo actualizar el cambio', e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSave = async () => {
    const manualFxRateMicros = isAuto ? null : parseRate(rateText);
    if (!isAuto && manualFxRateMicros === null) {
      const message = 'Introduce un número mayor que 0, por ejemplo 1,12';
      setRateError(message);
      announceErrors({ rate: message });
      return;
    }
    setRateError(null);
    try {
      await saveSettings({ defaultCurrency: currency, fxAuto: isAuto, manualFxRateMicros });
      if (isAuto && !data.fxAuto) await refreshFxRate().catch(() => undefined);
      setSavedMessage('Ajustes guardados');
      announce('Ajustes guardados');
      await reload();
    } catch (e: unknown) {
      showError('No se pudieron guardar los ajustes', e);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e: unknown) {
      showError('No se pudo cerrar la sesión', e);
      return;
    }
    window.location.replace('/');
  };

  const handleBackup = async () => {
    try {
      const json = await exportBackupJson();
      await saveTextFile(json, `compras-copia-${todayIso()}.json`, 'Copia de seguridad de compras');
    } catch (e: unknown) {
      showError('No se pudo exportar la copia', e);
    }
  };

  return (
    <FormScroll>
      <SectionHeader title="Cambio euro / dólar" />
      <Card>
        <InfoRow label="1 € =" value={`${formatRate(data.fxRateMicros)} US$`} isStrong />
        <Text style={styles.body}>{rateDescription(data)}</Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel} accessibilityElementsHidden importantForAccessibility="no">
            Actualizar automáticamente con el cambio del mercado
          </Text>
          <Switch
            value={isAuto}
            onValueChange={(value) => {
              setAuto(value);
              markDirty();
            }}
            accessibilityLabel="Actualizar automáticamente con el cambio del mercado"
          />
        </View>
        {isAuto ? (
          <>
            <Text style={styles.body}>
              El servidor lo descarga cada hora, aunque nadie tenga la app abierta. Las fuentes gratuitas publican el cambio una
              vez al día.
            </Text>
            <Button
              variant="secondary"
              icon="refresh"
              label={isRefreshing ? 'Actualizando…' : 'Actualizar ahora'}
              onPress={handleRefresh}
              isDisabled={isRefreshing}
            />
          </>
        ) : (
          <TextField
            label="Cambio manual: 1 € equivale a … US$"
            value={rateText}
            onChangeText={(t) => {
              setRateText(t);
              markDirty();
            }}
            keyboardType="decimal-pad"
            error={rateError}
            hint="Por ejemplo, el cambio que te aplica tu banco."
          />
        )}
        <Text style={styles.body}>
          Se usa en pedidos y pagos que no tengan un cambio propio. Un pedido puede fijar su propio cambio al editarlo.
        </Text>
      </Card>

      <SectionHeader title="Pedidos nuevos" />
      <Card>
        <ChipGroup<Currency>
          label="Moneda por defecto"
          value={currency}
          options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
          onChange={(c) => {
            setCurrency(c);
            markDirty();
          }}
        />
      </Card>

      <Button label="Guardar ajustes" icon="save-outline" onPress={handleSave} />
      {savedMessage ? <Text style={styles.saved}>{savedMessage}</Text> : null}

      <SectionHeader title="Copia de seguridad" />
      <Card>
        <Text style={styles.body}>
          Los datos se guardan en la base de datos en la nube (Cloudflare D1) y se ven desde cualquier dispositivo con tu
          cuenta. Si quieres una copia propia, descárgala aquí (en el móvil puedes enviarla a Archivos, Drive o al correo).
        </Text>
        <Button variant="secondary" label="Guardar copia (.json)" icon="download-outline" onPress={handleBackup} />
      </Card>

      <SectionHeader title="Sesión" />
      <Card>
        <Text style={styles.body}>La sesión dura 30 días en este dispositivo. Ciérrala si usas un ordenador compartido.</Text>
        <Button variant="secondary" label="Cerrar sesión" icon="log-out-outline" onPress={handleLogout} />
      </Card>
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { ...typography.callout, color: theme.colors.textSecondary },
    saved: { ...typography.callout, color: theme.payment.pagado.fg, fontWeight: '600' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: MIN_TOUCH },
    switchLabel: { ...typography.body, color: theme.colors.text, flex: 1 },
  });
