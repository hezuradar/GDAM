import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@/domain/money';
import type { Currency, OrderStatus, PaymentStatus } from '@/domain/types';
import { ORDER_STATUS_ICON, ORDER_STATUS_LABEL, PAYMENT_STATUS_ICON, PAYMENT_STATUS_LABEL, type IconName } from '@/i18n/es';
import { MIN_TOUCH, radius, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

/** Small icon + text pair for metadata rows (date, lines, tracking…). */
export function IconText({ icon, children }: { icon: IconName; children: ReactNode }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.iconText}>
      <Ionicons name={icon} size={15} color={theme.colors.textSecondary} />
      <Text style={styles.meta}>{children}</Text>
    </View>
  );
}

/** Supplier initials in a neutral circle (identity aid, not a data colour). */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const styles = useThemedStyles(makeStyles);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      // Spread first: an astral character (emoji, some scripts) is not one UTF-16 unit,
      // and a lone surrogate would render as a broken glyph.
      .map((word) => [...word][0]?.toUpperCase())
      .join('') || '?';
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

type StatTileProps = {
  icon: IconName;
  label: string;
  value: string;
  detail?: string;
  isActive?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
};

/** Headline number with its label; tappable tiles act as quick filters. */
export function StatTile({ icon, label, value, detail, isActive = false, onPress, accessibilityHint }: StatTileProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const content = (
    <>
      <View style={styles.tileHeader}>
        <View style={[styles.tileIcon, isActive && styles.tileIconActive]}>
          <Ionicons name={icon} size={18} color={isActive ? theme.colors.onPrimary : theme.colors.primary} />
        </View>
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      {detail ? <Text style={styles.meta}>{detail}</Text> : null}
    </>
  );
  const a11yLabel = `${label}: ${value}${detail ? `, ${detail}` : ''}`;
  if (!onPress) {
    return (
      <View style={styles.tile} accessible accessibilityLabel={a11yLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: isActive }}
      style={({ pressed }) => [styles.tile, isActive && styles.tileActive, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

type PaymentMeterProps = {
  paidCents: number;
  totalCents: number;
  currency: Currency;
  status: PaymentStatus;
  isCompact?: boolean;
};

/** Paid vs total as a thin progress bar, always with icon + text (never colour alone). */
export function PaymentMeter({ paidCents, totalCents, currency, status, isCompact = false }: PaymentMeterProps) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tone = theme.payment[status];
  const ratio = totalCents > 0 ? Math.min(1, Math.max(0, paidCents / totalCents)) : 0;
  const percent = Math.round(ratio * 100);
  const summary = `${formatMoney(paidCents, currency)} de ${formatMoney(totalCents, currency)}`;
  return (
    <View
      style={styles.meter}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${PAYMENT_STATUS_LABEL[status]}: ${percent} por ciento pagado, ${summary}`}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={styles.meterHeader}>
        <View style={styles.iconText}>
          <Ionicons name={PAYMENT_STATUS_ICON[status]} size={16} color={tone.fg} />
          <Text style={[styles.meterLabel, { color: tone.fg }]}>
            {PAYMENT_STATUS_LABEL[status]} · {percent} %
          </Text>
        </View>
        {isCompact ? null : <Text style={styles.meta}>{summary}</Text>}
      </View>
      <View style={styles.track}>
        {ratio > 0 ? <View style={[styles.fill, { width: `${percent}%`, backgroundColor: tone.fg }]} /> : null}
      </View>
    </View>
  );
}

const DISPLAY_OPTIONS: readonly { value: Currency | null; label: string; a11y: string }[] = [
  { value: null, label: 'Original', a11y: 'Moneda original de cada pedido' },
  { value: 'EUR', label: '€', a11y: 'Euros' },
  { value: 'USD', label: 'US$', a11y: 'Dólares' },
  { value: 'INR', label: '₹', a11y: 'Rupias' },
];

/** Segmented control to view amounts in each order's currency, in euros or in dollars. */
export function DisplayCurrencySwitch({ value, onChange }: { value: Currency | null; onChange: (value: Currency | null) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel="Ver importes en">
      <Ionicons name="swap-horizontal" size={18} color={theme.colors.textSecondary} style={styles.segmentedIcon} />
      {DISPLAY_OPTIONS.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable
            key={option.label}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={`Ver importes en: ${option.a11y}`}
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => [styles.segment, isSelected && styles.segmentSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.segmentText, isSelected && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const FLOW: readonly OrderStatus[] =['borrador', 'confirmado', 'enviado', 'recibido'];

/** Order progress: Borrador → Confirmado → Enviado → Recibido. Cancelled orders show a banner. */
export function StatusStepper({ status }: { status: OrderStatus }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (status === 'cancelado') {
    const tone = theme.status.cancelado;
    return (
      <View style={[styles.cancelled, { backgroundColor: tone.bg }]} accessible accessibilityLabel="Pedido cancelado">
        <Ionicons name={ORDER_STATUS_ICON.cancelado} size={20} color={tone.fg} />
        <Text style={[styles.meterLabel, { color: tone.fg }]}>Pedido cancelado</Text>
      </View>
    );
  }
  const current = FLOW.indexOf(status);
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={`Estado: ${ORDER_STATUS_LABEL[status]}, paso ${current + 1} de ${FLOW.length}`}
    >
      {FLOW.map((step, index) => {
        const isDone = index <= current;
        const isCurrent = index === current;
        return (
          <View key={step} style={styles.step}>
            <View style={styles.stepRow}>
              <View style={[styles.connector, index === 0 && styles.hidden, index <= current && styles.connectorDone]} />
              <View style={[styles.stepDot, isDone && styles.stepDotDone, isCurrent && styles.stepDotCurrent]}>
                <Ionicons
                  name={index < current ? 'checkmark' : ORDER_STATUS_ICON[step]}
                  size={16}
                  color={isDone ? theme.colors.onPrimary : theme.colors.textSecondary}
                />
              </View>
              <View
                style={[styles.connector, index === FLOW.length - 1 && styles.hidden, index < current && styles.connectorDone]}
              />
            </View>
            <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]} numberOfLines={1}>
              {ORDER_STATUS_LABEL[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    iconText: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    meta: { ...typography.footnote, color: theme.colors.textSecondary, flexShrink: 1 },
    avatar: { backgroundColor: theme.status.confirmado.bg, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: theme.status.confirmado.fg, fontWeight: '700' },
    tile: {
      flex: 1,
      minWidth: 140,
      minHeight: MIN_TOUCH,
      padding: spacing.md,
      gap: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.divider,
    },
    tileActive: { borderColor: theme.colors.primary, borderWidth: 2 },
    tileHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    tileIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.status.confirmado.bg,
    },
    tileIconActive: { backgroundColor: theme.colors.primary },
    tileLabel: { ...typography.footnote, color: theme.colors.textSecondary, flex: 1, fontWeight: '600' },
    tileValue: { ...typography.title, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    pressed: { opacity: 0.7 },
    meter: { gap: spacing.xs },
    meterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    meterLabel: { ...typography.footnote, fontWeight: '700' },
    track: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
    fill: { height: 8, borderRadius: 4 },
    cancelled: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
    stepper: { flexDirection: 'row' },
    step: { flex: 1, alignItems: 'center', gap: spacing.xs },
    stepRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
    connector: { flex: 1, height: 3, backgroundColor: theme.colors.divider },
    connectorDone: { backgroundColor: theme.colors.primary },
    hidden: { opacity: 0 },
    stepDot: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    stepDotDone: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    stepDotCurrent: { borderWidth: 3, borderColor: theme.status.confirmado.bg },
    stepLabel: { ...typography.footnote, color: theme.colors.textSecondary, textAlign: 'center' },
    stepLabelCurrent: { color: theme.colors.text, fontWeight: '700' },
    segmented: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      padding: 3,
      gap: 2,
      borderRadius: radius.md,
      backgroundColor: theme.colors.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    segmentedIcon: { marginHorizontal: spacing.xs },
    segment: { minHeight: 38, minWidth: 48, paddingHorizontal: spacing.md, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
    segmentSelected: { backgroundColor: theme.colors.primary },
    segmentText: { ...typography.callout, color: theme.colors.text, fontWeight: '600' },
    segmentTextSelected: { color: theme.colors.onPrimary },
  });
