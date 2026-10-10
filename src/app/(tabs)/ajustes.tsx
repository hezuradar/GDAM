import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { todayIso } from '@/domain/dates';
import { saveTextFile } from '@/lib/share';
import { announce, announceErrors, showError } from '@/components/ui/alerts';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Card, ErrorView, FormScroll, LoadingView, SectionHeader } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { exportBackupJson } from '@/db/backup';
import { getSettings, saveSettings } from '@/db/settingsRepo';
import { formatRate, parseRate } from '@/domain/money';
import { CURRENCIES, type Currency } from '@/domain/types';
import { useLoader } from '@/hooks/useLoader';
import { CURRENCY_LABEL } from '@/i18n/es';
import { typography, useThemedStyles, type Theme } from '@/theme/theme';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(getSettings);
  const [rateText, setRateText] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [rateError, setRateError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Seed the form once: later focus reloads must not discard unsaved edits.
  const isSeeded = useRef(false);
  useEffect(() => {
    if (!data || isSeeded.current) return;
    isSeeded.current = true;
    setRateText(formatRate(data.fxRateMicros));
    setCurrency(data.defaultCurrency);
  }, [data]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data && loading) return <LoadingView />;

  const handleSave = async () => {
    const fxRateMicros = parseRate(rateText);
    if (fxRateMicros === null) {
      const message = 'Introduce un número mayor que 0, por ejemplo 1,08';
      setRateError(message);
      announceErrors({ rate: message });
      return;
    }
    setRateError(null);
    try {
      await saveSettings(db, { fxRateMicros, defaultCurrency: currency });
      setSavedMessage('Ajustes guardados');
      announce('Ajustes guardados');
    } catch (e: unknown) {
      showError('No se pudieron guardar los ajustes', e);
    }
  };

  const handleBackup = async () => {
    try {
      const json = await exportBackupJson(db);
      await saveTextFile(json, `compras-copia-${todayIso()}.json`, 'Copia de seguridad de compras');
    } catch (e: unknown) {
      showError('No se pudo exportar la copia', e);
    }
  };

  return (
    <FormScroll>
      <SectionHeader title="Monedas" />
      <Card>
        <TextField
          label="Tipo de cambio: 1 € equivale a … US$"
          value={rateText}
          onChangeText={(t) => {
            setRateText(t);
            setSavedMessage(null);
          }}
          keyboardType="decimal-pad"
          error={rateError}
          hint="Se usa en pedidos y pagos que no tengan un cambio propio."
        />
        <ChipGroup<Currency>
          label="Moneda por defecto de pedidos nuevos"
          value={currency}
          options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
          onChange={(c) => {
            setCurrency(c);
            setSavedMessage(null);
          }}
        />
        <Button label="Guardar ajustes" icon="save-outline" onPress={handleSave} />
        {savedMessage ? (
          <Text style={styles.saved} accessibilityLiveRegion="polite" accessibilityRole="alert">
            {savedMessage}
          </Text>
        ) : null}
      </Card>

      <SectionHeader title="Copia de seguridad" />
      <Card>
        <Text style={styles.body}>
          Los datos se guardan solo en este navegador y en este dispositivo. Si borras los datos del sitio o cambias de
          navegador se pierden: guarda una copia de vez en cuando (en el móvil puedes enviarla a Archivos, Drive o al correo).
        </Text>
        <Button variant="secondary" label="Guardar copia (.json)" icon="download-outline" onPress={handleBackup} />
      </Card>
    </FormScroll>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { ...typography.callout, color: theme.colors.textSecondary },
    saved: { ...typography.callout, color: theme.payment.pagado.fg, fontWeight: '600' },
  });
