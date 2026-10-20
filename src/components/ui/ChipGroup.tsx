import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconName } from '@/i18n/es';
import { MIN_TOUCH, radius, spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

export interface ChipOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly icon?: IconName;
}

type SingleProps<T extends string | number> = {
  label: string;
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
};

type MultiProps<T extends string | number> = {
  label: string;
  options: readonly ChipOption<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
};

type ChipProps = {
  label: string;
  icon?: IconName;
  isSelected: boolean;
  role: 'radio' | 'checkbox';
  onPress: () => void;
};

function Chip({ label, icon, isSelected, role, onPress }: ChipProps) {
  const styles = useThemedStyles(makeStyles);
  const stateIcon: IconName = isSelected ? 'checkmark' : (icon ?? 'ellipse-outline');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={role === 'radio' ? { selected: isSelected } : { checked: isSelected }}
      style={({ pressed }) => [styles.chip, isSelected && styles.chipSelected, pressed && styles.pressed]}
    >
      {isSelected || icon ? (
        <Ionicons name={stateIcon} size={16} style={isSelected ? styles.textSelected : styles.text} />
      ) : null}
      <Text
        style={[styles.text, isSelected && styles.textSelected]}
        // The Pressable already exposes the label; keeping it out avoids double announcements.
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Single-choice chips (radio group). */
export function ChipGroup<T extends string | number>({ label, options, value, onChange }: SingleProps<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => (
          <Chip
            key={String(option.value)}
            label={option.label}
            icon={option.icon}
            role="radio"
            isSelected={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Multi-choice chips (checkbox group). An empty selection means "all". */
export function MultiChipGroup<T extends string | number>({ label, options, values, onChange }: MultiProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const toggle = (value: T) =>
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  return (
    <View style={styles.container}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.row}>
        {options.map((option) => (
          <Chip
            key={String(option.value)}
            label={option.label}
            icon={option.icon}
            role="checkbox"
            isSelected={values.includes(option.value)}
            onPress={() => toggle(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { gap: spacing.sm },
    groupLabel: { ...typography.callout, fontWeight: '600', color: theme.colors.text },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      minHeight: MIN_TOUCH,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    pressed: { opacity: 0.6 },
    text: { ...typography.callout, color: theme.colors.text },
    textSelected: { ...typography.callout, color: theme.colors.onPrimary, fontWeight: '600' },
  });
