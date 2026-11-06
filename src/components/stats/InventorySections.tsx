import { StyleSheet, Text, View } from 'react-native';
import { Card, InfoRow, SectionHeader } from '@/components/ui/Layout';
import { StatTile } from '@/components/ui/Visuals';
import { BarList, RankList, type RankItem } from '@/components/stats/StatsParts';
import { formatDate, formatQuantity, plural } from '@/domain/exportText';
import type { OverheadStats, PriceChange, PriceChanges, WarehouseStats } from '@/domain/inventory';
import { formatMargin } from '@/domain/landedCost';
import { formatMoney } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

/** "+12,5 %" / "−8 %": the sign always written, never colour alone. */
export const signedPercent = (bp: number | null): string => {
  if (bp === null) return '—';
  const text = formatMargin(Math.abs(bp));
  return bp > 0 ? `+${text}` : bp < 0 ? `−${text}` : text;
};

type Common = { currency: Currency; onOpenProduct: (lineId: number) => void };

export function WarehouseSection({ warehouse, currency, onOpenProduct }: Common & { warehouse: WarehouseStats }) {
  const styles = useThemedStyles(makeStyles);
  const money = (cents: number) => formatMoney(cents, currency);
  const potentialProfit = warehouse.stockSaleCents - warehouse.stockSaleCostCents;
  return (
    <>
      <SectionHeader title="Valor del almacén" icon="cube-outline" />
      <View style={styles.tiles}>
        <StatTile icon="cube-outline" label="En almacén" value={money(warehouse.stockCents)} detail={`${formatQuantity(warehouse.stockPieces)} piezas`} />
        <StatTile icon="airplane-outline" label="En camino" value={money(warehouse.transitCents)} detail={`${formatQuantity(warehouse.transitPieces)} piezas`} />
        {warehouse.stockSaleCents > 0 ? (
          <StatTile
            icon="cash-outline"
            label="Venta prevista del stock"
            value={money(warehouse.stockSaleCents)}
            detail={`Beneficio ${money(potentialProfit)}`}
          />
        ) : null}
      </View>
      <Text style={styles.note}>
        Valorado a coste final: precio del proveedor + envío y aduanas + manipulación. La app aún no registra ventas, así que cuenta
        todo lo recibido. «En camino» son los pedidos confirmados o enviados.
        {warehouse.unknownCostPieces > 0 ? ` ${formatQuantity(warehouse.unknownCostPieces)} piezas sin precio no están valoradas.` : ''}
      </Text>
      {warehouse.topByValue.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>Lo que más vale en el almacén</Text>
          <RankList
            items={warehouse.topByValue.map((i) => ({
              key: i.lineId,
              title: i.label || 'Sin descripción',
              subtitle: `${formatQuantity(i.pieces)} uds · ${i.supplierName || 'Sin proveedor'}`,
              value: money(i.valueCents),
            }))}
            onPress={onOpenProduct}
          />
        </Card>
      ) : null}
    </>
  );
}

export function OverheadSection({ overhead, currency, onOpenProduct }: Common & { overhead: OverheadStats }) {
  const styles = useThemedStyles(makeStyles);
  if (overhead.goodsCents === 0) return null;
  const money = (cents: number) => formatMoney(cents, currency);
  return (
    <>
      <SectionHeader title="Coste final frente a precio del proveedor" icon="layers-outline" />
      <View style={styles.tiles}>
        <StatTile icon="receipt-outline" label="Precio del proveedor" value={money(overhead.goodsCents)} />
        <StatTile
          icon="calculator-outline"
          label="Coste final"
          value={money(overhead.landedCents)}
          detail={`${signedPercent(overhead.totalOverheadBp)} sobre el proveedor`}
        />
      </View>
      <Card>
        <BarList
          currency={currency}
          total={overhead.landedCents}
          items={[
            { key: 'goods', label: 'Precio del proveedor', cents: overhead.goodsCents },
            { key: 'extra', label: 'Envío + aduanas', cents: overhead.shippingCustomsCents },
            { key: 'handling', label: 'Manipulación', cents: overhead.handlingCents },
          ]}
        />
        <Text style={styles.note}>
          Envío y aduanas suman de media un {signedPercent(overhead.shippingCustomsBp)} al precio del proveedor.
        </Text>
      </Card>
      {overhead.bySupplier.length > 1 ? (
        <Card>
          <Text style={styles.cardTitle}>Envío + aduanas por proveedor</Text>
          {overhead.bySupplier.map((s) => (
            <InfoRow
              key={s.key}
              icon="business-outline"
              label={s.label}
              value={signedPercent(s.overheadBp)}
              detail={`${money(s.shippingCustomsCents)} sobre ${money(s.goodsCents)} de mercancía`}
            />
          ))}
        </Card>
      ) : null}
      {overhead.topProducts.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>Los que más se encarecen</Text>
          <RankList
            items={overhead.topProducts.map((p) => ({
              key: p.lineId,
              title: p.label || 'Sin descripción',
              subtitle: `${money(p.supplierUnitCents)} → ${money(p.landedUnitCents)}/ud · ${p.supplierName || 'Sin proveedor'}`,
              value: signedPercent(p.overheadBp),
            }))}
            onPress={onOpenProduct}
          />
        </Card>
      ) : null}
    </>
  );
}

const changeItem = (c: PriceChange, money: (cents: number) => string): RankItem => ({
  key: c.lineId,
  title: c.label || 'Sin descripción',
  subtitle: `${money(c.previousCents)} (${formatDate(c.previousDate)}) → ${money(c.latestCents)} (${formatDate(c.latestDate)}) · ${c.supplierName || 'Sin proveedor'}`,
  value: signedPercent(c.changeBp),
  // A dearer supplier price is the bad news.
  isNegative: c.changeBp > 0,
});

export function PriceChangesSection({ changes, currency, onOpenProduct }: Common & { changes: PriceChanges }) {
  const styles = useThemedStyles(makeStyles);
  const money = (cents: number) => formatMoney(cents, currency);
  return (
    <>
      <SectionHeader title="Evolución del precio del proveedor" icon="pulse-outline" />
      {changes.rises.length === 0 && changes.drops.length === 0 ? (
        <Text style={styles.note}>
          Ningún producto ha cambiado de precio entre sus dos últimas compras. Toca un producto para ver todo su historial.
        </Text>
      ) : (
        <Text style={styles.note}>
          Último precio por unidad frente a la compra anterior del mismo producto ({plural(changes.riseCount, 'subida', 'subidas')},{' '}
          {plural(changes.dropCount, 'bajada', 'bajadas')}; se muestran las mayores).
        </Text>
      )}
      {changes.rises.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>Han subido</Text>
          <RankList items={changes.rises.map((c) => changeItem(c, money))} onPress={onOpenProduct} />
        </Card>
      ) : null}
      {changes.drops.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>Han bajado</Text>
          <RankList items={changes.drops.map((c) => changeItem(c, money))} onPress={onOpenProduct} />
        </Card>
      ) : null}
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    note: { ...typography.footnote, color: theme.colors.textSecondary },
    cardTitle: { ...typography.headline, color: theme.colors.text },
  });
