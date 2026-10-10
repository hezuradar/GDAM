import { StyleSheet, Text, View } from 'react-native';
import { isValidIsoDate } from '@/domain/dates';
import { radius, spacing, typography, useTheme } from '@/theme/theme';

type DateFieldProps = { label: string; value: string; onChange: (iso: string) => void };

/** The browser's native date input: opens the phone's own date wheel/calendar, accessible and keyboard friendly. */
export function DateField({ label, value, onChange }: DateFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <input
        type="date"
        aria-label={label}
        value={value}
        onChange={(event) => {
          if (isValidIsoDate(event.target.value)) onChange(event.target.value);
        }}
        style={{
          minHeight: 44,
          padding: `0 ${spacing.md}px`,
          borderRadius: radius.sm,
          border: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          color: theme.colors.text,
          fontSize: typography.body.fontSize,
          colorScheme: theme.dark ? 'dark' : 'light',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  label: { ...typography.callout, fontWeight: '600' },
});
