import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconName } from '@/i18n/es';
import { MIN_TOUCH, radius, spacing, typography, useTheme, type Theme } from '@/theme/theme';

type Variant = 'primary' | 'secondary' | 'destructive' | 'plain';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  isDisabled?: boolean;
  accessibilityHint?: string;
};

function colorsFor(variant: Variant, theme: Theme) {
  const c = theme.colors;
  switch (variant) {
    case 'primary':
      return { bg: c.primary, fg: c.onPrimary, border: c.primary };
    case 'destructive':
      return { bg: c.danger, fg: c.onDanger, border: c.danger };
    case 'secondary':
      return { bg: c.surface, fg: c.primary, border: c.border };
    case 'plain':
      return { bg: 'transparent', fg: c.primary, border: 'transparent' };
  }
}

export function Button({ label, onPress, variant = 'primary', icon, isDisabled = false, accessibilityHint }: ButtonProps) {
  const theme = useTheme();
  const palette = colorsFor(variant, theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        (pressed || isDisabled) && styles.dimmed,
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={palette.fg} /> : null}
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
};

/** Icon-only button with a mandatory VoiceOver label and a 44pt target. */
export function IconButton({ icon, label, onPress, color }: IconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={spacing.sm}
      style={({ pressed }) => [styles.iconButton, pressed && styles.dimmed]}
    >
      <Ionicons name={icon} size={24} color={color ?? theme.colors.primary} />
    </Pressable>
  );
}

type ButtonRowProps = { children: React.ReactNode };

export function ButtonRow({ children }: ButtonRowProps) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexGrow: 1,
  },
  label: { ...typography.headline, textAlign: 'center', flexShrink: 1 },
  dimmed: { opacity: 0.55 },
  iconButton: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
