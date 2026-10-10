import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string | null;
  hint?: string;
};

export function TextField({ label, error, hint, multiline, ...inputProps }: TextFieldProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const description = error ?? hint;
  return (
    <View style={styles.container}>
      {/* Visual label only: the input itself carries label + error for VoiceOver (no double reading). */}
      <Text style={styles.label} accessibilityElementsHidden importantForAccessibility="no">
        {label}
      </Text>
      <TextInput
        {...inputProps}
        multiline={multiline}
        accessibilityLabel={error ? `${label}, error: ${error}` : label}
        accessibilityHint={hint}
        placeholderTextColor={theme.colors.textSecondary}
        style={[styles.input, multiline && styles.multiline, error ? styles.inputError : null]}
      />
      {description ? (
        <Text style={[styles.hint, error ? styles.error : null]} accessibilityElementsHidden importantForAccessibility="no">
          {description}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    label: { ...typography.callout, fontWeight: '600', color: theme.colors.text },
    input: {
      ...typography.body,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      color: theme.colors.text,
    },
    multiline: { minHeight: 140, textAlignVertical: 'top', paddingTop: spacing.md },
    inputError: { borderColor: theme.colors.danger, borderWidth: 2 },
    hint: { ...typography.footnote, color: theme.colors.textSecondary },
    error: { color: theme.colors.danger, fontWeight: '600' },
  });
