import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { formatDate } from '@/domain/exportText';
import { formatMoney } from '@/domain/money';
import type { OrderListItem } from '@/domain/orderFilters';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/i18n/es';
import { radius, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';
import { PaymentBadge, PendingPriceBadge, StatusBadge } from '../ui/Badges';

type OrderCardProps = { item: OrderListItem; onPress: (id: number) => void };

function describe(item: OrderListItem): string {
  const parts = [
    `Pedido ${item.id} de ${item.supplierName}`,
    formatDate(item.orderDate),
    ORDER_STATUS_LABEL[item.status],
    `Total ${formatMoney(item.totalCents, item.currency)}`,
    PAYMENT_STATUS_LABEL[item.paymentStatus],
    item.pendingCents > 0 ? `Pendiente ${formatMoney(item.pendingCents, item.currency)}` : null,
    item.pendingPriceCount > 0 ? `${item.pendingPriceCount} precios pendientes` : null,
    item.trackingNumber ? `Seguimiento ${item.trackingNumber}` : null,
  ];
  return parts.filter(Boolean).join('. ');
}

function OrderCardBase({ item, onPress }: OrderCardProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={describe(item)}
      accessibilityHint="Abre el detalle del pedido"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.supplier} numberOfLines={2}>
          {item.supplierName}
        </Text>
        <Text style={styles.total}>{formatMoney(item.totalCents, item.currency)}</Text>
      </View>
      <Text style={styles.meta}>
        #{item.id} · {formatDate(item.orderDate)} · {item.lineCount} {item.lineCount === 1 ? 'línea' : 'líneas'}
      </Text>
      <View style={styles.badges}>
        <StatusBadge status={item.status} />
        <PaymentBadge status={item.paymentStatus} />
        {item.pendingPriceCount > 0 ? <PendingPriceBadge count={item.pendingPriceCount} /> : null}
      </View>
      {item.pendingCents > 0 && item.paymentStatus !== 'sin_pagar' ? (
        <Text style={styles.pending}>Pendiente: {formatMoney(item.pendingCents, item.currency)}</Text>
      ) : null}
      {item.trackingNumber ? (
        <View style={styles.tracking}>
          <Ionicons name="navigate-outline" size={16} color={theme.colors.textSecondary} />
          <Text style={styles.meta} numberOfLines={2}>
            {item.trackingNumber}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export const OrderCard = memo(OrderCardBase);

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      borderWidth: theme.dark ? 1 : 0,
      borderColor: theme.colors.border,
      shadowColor: '#000',
      shadowOpacity: theme.dark ? 0 : 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    pressed: { opacity: 0.7 },
    header: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, alignItems: 'flex-start' },
    supplier: { ...typography.headline, color: theme.colors.text, flex: 1 },
    total: { ...typography.headline, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    meta: { ...typography.footnote, color: theme.colors.textSecondary },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    pending: { ...typography.callout, color: theme.payment.parcial.fg, fontWeight: '600' },
    tracking: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  });
