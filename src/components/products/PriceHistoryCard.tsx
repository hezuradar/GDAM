import { StyleSheet, Text } from 'react-native';
import { Card, InfoRow, SectionHeader } from '@/components/ui/Layout';
import { signedPercent } from '@/components/stats/InventorySections';
import { formatDate, formatQuantity } from '@/domain/exportText';
import type { PricePoint } from '@/domain/inventory';
import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { typography, useThemedStyles, type Theme } from '@/theme/theme';

type Props = { points: readonly PricePoint[]; currency: Currency; currentLineId: number };

/** Every purchase of the same product, oldest first: supplier price, change and final cost. */
export function PriceHistoryCard({ points, currency, currentLineId }: Props) {
  const styles = useThemedStyles(makeStyles);
  if (points.length < 2) return null;
  const money = (cents: number) => formatMoney(cents, currency);
  const first = points[0];
  const last = points[points.length - 1];
  const totalBp = first.unitPriceCents > 0 ? Math.round(((last.unitPriceCents - first.unitPriceCents) * 10_000) / first.unitPriceCents) : null;
  return (
    <>
      <SectionHeader title="Evolución del precio" icon="pulse-outline" />
      <Card>
        <InfoRow
          icon="swap-vertical-outline"
          label={`Desde la primera compra (${points.length} compras)`}
          value={signedPercent(totalBp)}
          detail={`${money(first.unitPriceCents)} → ${money(last.unitPriceCents)} por unidad`}
          isStrong
        />
        {points.map((p) => (
          <InfoRow
            key={p.lineId}
            icon={p.lineId === currentLineId ? 'radio-button-on-outline' : 'ellipse-outline'}
            label={`${formatDate(p.orderDate)} · ${p.supplierName || 'Sin proveedor'}${p.lineId === currentLineId ? ' (este)' : ''}`}
            value={`${money(p.unitPriceCents)}/ud`}
            detail={[
              `${formatQuantity(p.quantity)} uds · pedido #${p.orderId}`,
              p.changeBp === null ? null : `${signedPercent(p.changeBp)} vs anterior`,
              p.landedUnitCents === null ? null : `coste final ${money(p.landedUnitCents)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </Card>
      <Text style={styles.note}>Precio del proveedor por unidad en cada pedido del mismo producto; las reposiciones a 0 no cuentan.</Text>
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    note: { ...typography.footnote, color: theme.colors.textSecondary },
  });
