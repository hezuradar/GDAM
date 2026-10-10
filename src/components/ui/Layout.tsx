import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { IconName } from '@/i18n/es';
import { MIN_TOUCH, radius, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';
import { Button } from './Button';

/** Keeps lines readable on wide screens (web/desktop); no effect on phones. */
export const CONTENT_MAX_WIDTH = 760;

export function Card({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.card}>{children}</View>;
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

type InfoRowProps = { label: string; value: string; isStrong?: boolean };

/** Label/value row; read by VoiceOver as one element. */
export function InfoRow({ label, value, isStrong = false }: InfoRowProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.infoRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.infoLabel, isStrong && styles.strong]}>{label}</Text>
      <Text style={[styles.infoValue, isStrong && styles.strong]}>{value}</Text>
    </View>
  );
}

type PressableRowProps = {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
};

export function PressableRow({ children, onPress, accessibilityLabel, accessibilityHint }: PressableRowProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.pressableRow, pressed && styles.pressed]}
    >
      <View style={styles.flex}>{children}</View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
    </Pressable>
  );
}

type EmptyStateProps = { icon: IconName; title: string; message: string; actionLabel?: string; onAction?: () => void };

export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} icon="add" /> : null}
    </View>
  );
}

export function LoadingView() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center} accessible accessibilityRole="progressbar" accessibilityLabel="Cargando">
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <EmptyState icon="warning-outline" title="Algo ha fallado" message={message} actionLabel="Reintentar" onAction={onRetry} />
  );
}

/** Scrollable form container (mobile browsers scroll the focused field above the keyboard). */
export function FormScroll({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView style={styles.flexScreen} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    flexScreen: { flex: 1, backgroundColor: theme.colors.background },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
      minHeight: MIN_TOUCH,
    },
    sectionTitle: { ...typography.title, color: theme.colors.text },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
    infoLabel: { ...typography.body, color: theme.colors.textSecondary, flexShrink: 1 },
    infoValue: { ...typography.body, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    strong: { fontWeight: '700', color: theme.colors.text },
    pressableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: MIN_TOUCH,
      paddingVertical: spacing.sm,
    },
    pressed: { opacity: 0.6 },
    empty: { alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
    emptyTitle: { ...typography.title, color: theme.colors.text, textAlign: 'center' },
    emptyMessage: { ...typography.body, color: theme.colors.textSecondary, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
    form: {
      padding: spacing.lg,
      gap: spacing.lg,
      paddingBottom: spacing.xxl * 2,
      width: '100%',
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: 'center',
    },
  });
