import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import type { OrderStatus, PaymentStatus } from '@/domain/types';
import {
  ORDER_STATUS_ICON,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_ICON,
  PAYMENT_STATUS_LABEL,
  type IconName,
} from '@/i18n/es';
import { radius, spacing, typography, useTheme } from '@/theme/theme';

type BadgeProps = { label: string; icon: IconName; fg: string; bg: string };

/** Color is never the only signal: every badge has an icon and text. */
export function Badge({ label, icon, fg, bg }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessible accessibilityLabel={label}>
      <Ionicons name={icon} size={14} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = useTheme().status[status];
  return <Badge label={ORDER_STATUS_LABEL[status]} icon={ORDER_STATUS_ICON[status]} fg={tone.fg} bg={tone.bg} />;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone = useTheme().payment[status];
  return (
    <Badge label={PAYMENT_STATUS_LABEL[status]} icon={PAYMENT_STATUS_ICON[status]} fg={tone.fg} bg={tone.bg} />
  );
}

export function PendingPriceBadge({ count }: { count: number }) {
  const tone = useTheme().colors.warning;
  const label = count === 1 ? '1 precio pendiente' : `${count} precios pendientes`;
  return <Badge label={label} icon="pricetag-outline" fg={tone.fg} bg={tone.bg} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  text: { ...typography.footnote, fontWeight: '600' },
});
