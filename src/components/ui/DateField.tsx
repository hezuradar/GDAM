import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing, typography, useTheme } from '@/theme/theme';

type DateFieldProps = { label: string; value: string; onChange: (iso: string) => void; error?: string };

/** The browser's native date input: opens the phone's own date wheel/calendar, accessible and keyboard friendly. */
export function DateField({ label, value, onChange, error }: DateFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <View style={styles.control}>
        <input
          type="date"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          value={value}
          // Clearing the field must reach the form; an invalid (partial) date is left to
          // the browser's own state and validated on save.
          onChange={(event) => onChange(event.target.value)}
          style={{
            minHeight: 44,
            padding: `0 ${spacing.md}px`,
            borderRadius: radius.sm,
            border: `1px solid ${error ? theme.colors.warning.fg : theme.colors.border}`,
            background: theme.colors.surface,
            color: theme.colors.text,
            fontSize: typography.body.fontSize,
            colorScheme: theme.dark ? 'dark' : 'light',
          }}
        />
        {error ? <Text style={[styles.error, { color: theme.colors.warning.fg }]}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  label: { ...typography.callout, fontWeight: '600' },
  control: { alignItems: 'flex-start' },
  error: { ...typography.footnote, fontWeight: '600', marginTop: spacing.xs },
});
