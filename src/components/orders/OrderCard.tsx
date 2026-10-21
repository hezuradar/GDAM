import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate, plural } from '@/domain/exportText';
import { displayAmount, formatMoney } from '@/domain/money';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { OrderListItem } from '@/domain/orderFilters';
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@/i18n/es';
import { radius, spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';
import { PendingPriceBadge, StatusBadge } from '../ui/Badges';
import { Avatar, IconText, PaymentMeter } from '../ui/Visuals';

type OrderCardProps = { item: OrderListItem; onPress: (id: number) => void };

function describe(item: OrderListItem): string {
  const parts = [
    `Pedido ${item.id} de ${item.supplierName}`,
    formatDate(item.orderDate),
    ORDER_STATUS_LABEL[item.status],
    `Total ${formatMoney(item.totalCents, item.currency)}`,
    PAYMENT_STATUS_LABEL[item.paymentStatus],
    item.pendingCents > 0 ? `Pendiente ${formatMoney(item.pendingCents, item.currency)}` : null,
    item.pendingPriceCount > 0 ? plural(item.pendingPriceCount, 'precio pendiente', 'precios pendientes') : null,
    item.trackingNumber ? `Seguimiento ${item.trackingNumber}` : null,
  ];
  return parts.filter(Boolean).join('. ');
}

function OrderCardBase({ item, onPress }: OrderCardProps) {
  const styles = useThemedStyles(makeStyles);
  const display = useDisplayCurrency();
  const total = displayAmount(item.totalCents, item.currency, display, item.rates);
  const paid = displayAmount(item.totalCents - item.pendingCents, item.currency, display, item.rates);
  return (
    <Pressable
      onPress={() => onPress(item.id)}
      accessibilityRole="button"
      accessibilityLabel={describe(item)}
      accessibilityHint="Abre el detalle del pedido"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Avatar name={item.supplierName} />
        <View style={styles.titleBlock}>
          <Text style={styles.supplier} numberOfLines={2}>
            {item.supplierName}
          </Text>
          <View style={styles.metaRow}>
            <IconText icon="pricetag-outline">#{item.id}</IconText>
            <IconText icon="calendar-outline">{formatDate(item.orderDate)}</IconText>
            <IconText icon="cube-outline">{plural(item.lineCount, 'línea', 'líneas')}</IconText>
          </View>
        </View>
        <Text style={styles.total}>{formatMoney(total.cents, total.currency)}</Text>
      </View>

      <View style={styles.badges}>
        <StatusBadge status={item.status} />
        {item.pendingPriceCount > 0 ? <PendingPriceBadge count={item.pendingPriceCount} /> : null}
      </View>

      {item.totalCents > 0 ? (
        <PaymentMeter paidCents={paid.cents} totalCents={total.cents} currency={total.currency} status={item.paymentStatus} />
      ) : null}

      {item.trackingNumber ? <IconText icon="airplane-outline">{item.trackingNumber}</IconText> : null}
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
      gap: spacing.md,
      borderWidth: theme.dark ? 1 : 0,
      borderColor: theme.colors.divider,
      // CSS box-shadow syntax (React Native 0.76+ / react-native-web): the legacy
      // shadow* props are ignored on web.
      boxShadow: theme.dark ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.06)',
    },
    pressed: { opacity: 0.7 },
    header: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    titleBlock: { flex: 1, gap: spacing.xs },
    supplier: { ...typography.headline, color: theme.colors.text },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: spacing.xs },
    total: { ...typography.headline, color: theme.colors.text, fontVariant: ['tabular-nums'] },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  });
