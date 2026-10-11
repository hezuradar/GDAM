import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatMoney } from '@/domain/money';
import type { AmountShare } from '@/domain/stats';
import type { Currency } from '@/domain/types';
import { radius, spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';

const percentOf = (part: number, total: number) => (total > 0 ? Math.round((part * 100) / total) : 0);

/**
 * Horizontal bars, one hue, value always written as text (never colour alone).
 * Bar length is relative to the largest item; `total` adds the share of the total to the text.
 */
export function BarList({ items, currency, total }: { items: readonly AmountShare[]; currency: Currency; total?: number }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const max = Math.max(0, ...items.map((i) => i.cents));
  return (
    <View style={styles.list}>
      {items.map((item) => {
        const width = max > 0 ? Math.max(item.cents > 0 ? 2 : 0, Math.round((item.cents * 100) / max)) : 0;
        const value = `${formatMoney(item.cents, currency)}${total !== undefined ? ` · ${percentOf(item.cents, total)} %` : ''}`;
        return (
          <View key={item.key} style={styles.barRow} accessible accessibilityLabel={`${item.label}: ${value}`}>
            <View style={styles.barHeader}>
              <Text style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={styles.value}>{value}</Text>
            </View>
            <View style={styles.track}>
              {width > 0 ? <View style={[styles.fill, { width: `${width}%`, backgroundColor: theme.colors.primary }]} /> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export interface RankItem {
  readonly key: number;
  readonly title: string;
  readonly subtitle: string;
  readonly value: string;
  readonly isNegative?: boolean;
}

/** Numbered ranking; each row opens the product. */
export function RankList({ items, onPress }: { items: readonly RankItem[]; onPress: (key: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.list}>
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          onPress={() => onPress(item.key)}
          accessibilityRole="button"
          accessibilityLabel={`${index + 1}. ${item.title}, ${item.subtitle}: ${item.value}`}
          accessibilityHint="Abrir el precio de venta del producto"
          style={({ pressed }) => [styles.rankRow, pressed && styles.pressed]}
        >
          <Text style={styles.rank}>{index + 1}</Text>
          <View style={styles.flex}>
            <Text style={styles.label} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>
          <View style={styles.rankValue}>
            {item.isNegative ? <Ionicons name="trending-down" size={16} color={theme.colors.danger} /> : null}
            <Text style={[styles.value, item.isNegative && { color: theme.colors.danger }]}>{item.value}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    list: { gap: spacing.md },
    barRow: { gap: spacing.xs },
    barHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
    label: { ...typography.body, color: theme.colors.text, flexShrink: 1 },
    value: { ...typography.body, color: theme.colors.text, fontWeight: '600', fontVariant: ['tabular-nums'] },
    meta: { ...typography.footnote, color: theme.colors.textSecondary },
    track: { height: 8, borderRadius: radius.sm, backgroundColor: theme.colors.surfaceAlt, overflow: 'hidden' },
    fill: { height: 8, borderRadius: radius.sm },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
    rank: { ...typography.headline, color: theme.colors.primary, width: 24, textAlign: 'center' },
    rankValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    pressed: { opacity: 0.6 },
  });
