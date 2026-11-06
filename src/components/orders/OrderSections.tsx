import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDate, formatQuantity } from '@/domain/exportText';
import { displayAmount, formatMoney, formatRate, type FxRates } from '@/domain/money';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { PaymentSummary } from '@/domain/payments';
import { lineTotalCents, type OrderTotals } from '@/domain/totals';
import { missingPieces } from '@/domain/reception';
import type { Currency, OrderLine, Payment } from '@/domain/types';
import { PAYMENT_METHOD_LABEL } from '@/i18n/es';
import { spacing, typography, useTheme, useThemedStyles, type Theme } from '@/theme/theme';
import { PaymentBadge, PendingPriceBadge } from '../ui/Badges';
import { Card, InfoRow, PressableRow } from '../ui/Layout';
import { PaymentMeter } from '../ui/Visuals';

type TotalsCardProps = { totals: OrderTotals; payment: PaymentSummary; currency: Currency; usesOrderRate: boolean };

export function TotalsCard({ totals, payment, currency, usesOrderRate }: TotalsCardProps) {
  const styles = useThemedStyles(makeStyles);
  const display = useDisplayCurrency();
  const shown = (cents: number) => displayAmount(cents, currency, display, totals.rates);
  const money = (cents: number) => {
    const amount = shown(cents);
    return formatMoney(amount.cents, amount.currency);
  };
  const isConverted = display !== null && display !== currency;
  const rateSource = usesOrderRate ? 'fijado en el pedido' : 'de mercado';
  /** The rate an amount was frozen with, when it is not the one used for the whole order. */
  const frozenDetail = (rates: FxRates) => {
    const parts: string[] = [];
    if (rates.usdMicros !== totals.rates.usdMicros) parts.push(`1 € = ${formatRate(rates.usdMicros)} US$`);
    if (rates.inrMicros !== totals.rates.inrMicros) parts.push(`1 € = ${formatRate(rates.inrMicros)} ₹`);
    return parts.length > 0 ? `Cambio congelado: ${parts.join(' · ')}` : undefined;
  };
  return (
    <Card>
      <InfoRow icon="cube-outline" label="Mercancía" value={money(totals.goodsCents)} />
      {totals.excludedCount > 0 ? (
        <InfoRow
          icon="remove-circle-outline"
          label={`No incluido (${totals.excludedCount === 1 ? '1 línea' : `${totals.excludedCount} líneas`})`}
          value={`− ${money(totals.excludedCents)}`}
          detail="No enviado o sustituido: ya está descontado del total y de lo pendiente"
        />
      ) : null}
      <InfoRow
        icon="airplane-outline"
        label="Envío"
        value={money(totals.shippingCents)}
        detail={frozenDetail(totals.shippingRates)}
      />
      <InfoRow
        icon="shield-checkmark-outline"
        label="Aduanas"
        value={money(totals.customsCents)}
        detail={frozenDetail(totals.customsRates)}
      />
      <View style={styles.divider} />
      <InfoRow
        icon="receipt-outline"
        label={totals.pendingPriceCount > 0 ? 'Total provisional' : 'Total'}
        value={money(totals.totalCents)}
        isStrong
      />
      {totals.totalCents > 0 ? (
        <PaymentMeter
          paidCents={shown(payment.paidCents).cents}
          totalCents={shown(totals.totalCents).cents}
          currency={shown(0).currency}
          status={payment.status}
        />
      ) : (
        <PaymentBadge status={payment.status} />
      )}
      <InfoRow icon="checkmark-circle-outline" label="Pagado" value={money(payment.paidCents)} />
      <InfoRow icon="hourglass-outline" label="Pendiente de pago" value={money(payment.pendingCents)} isStrong />
      {payment.overpaidCents > 0 ? (
        <InfoRow
          icon="alert-circle-outline"
          label="Pagado de más (a tu favor)"
          value={money(payment.overpaidCents)}
          detail="Pide al proveedor el reembolso o descuéntalo del próximo pedido"
          isStrong
        />
      ) : null}
      {totals.pendingPriceCount > 0 ? (
        <View style={styles.badges}>
          <PendingPriceBadge count={totals.pendingPriceCount} />
        </View>
      ) : null}
      <Text style={styles.note}>
        {isConverted ? `Importes convertidos de ${currency} a ${display}. ` : ''}Cambio usado: 1 € ={' '}
        {formatRate(totals.rates.usdMicros)} US$
        {currency === 'INR' || display === 'INR' ? ` · 1 € = ${formatRate(totals.rates.inrMicros)} ₹` : ''} ({rateSource})
      </Text>
    </Card>
  );
}

type LinesListProps = {
  lines: readonly OrderLine[];
  currency: Currency;
  rates: FxRates;
  onPressLine: (id: number) => void;
  /** Ticks a line in or out of the order; without it no checkbox is shown. */
  onToggleLine?: (id: number, isExcluded: boolean) => void;
};

const describeLine = (line: Pick<OrderLine, 'quantity' | 'pieceType' | 'measurements'>) =>
  [formatQuantity(line.quantity), line.pieceType, line.measurements].filter(Boolean).join(' ');

/** "Sustituye a …" / "Sustituida por …" for lines that take part in a substitution. */
function substitutionText(line: OrderLine, lines: readonly OrderLine[]): string | null {
  const original = line.substitutesLineId === null ? null : lines.find((l) => l.id === line.substitutesLineId);
  if (original) return `Sustituye a: ${describeLine(original)}`;
  const replacement = lines.find((l) => l.substitutesLineId === line.id);
  return replacement ? `Sustituida por: ${describeLine(replacement)}` : null;
}

function LineCheckbox({ line, onToggle }: { line: OrderLine; onToggle: (id: number, isExcluded: boolean) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isIncluded = !line.isExcluded;
  return (
    <Pressable
      onPress={() => onToggle(line.id, isIncluded)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isIncluded }}
      accessibilityLabel={`Incluir ${describeLine(line)} en el pedido`}
      accessibilityHint={isIncluded ? 'Desmarca si el proveedor no la envía' : 'Marca para volver a contarla'}
      hitSlop={spacing.sm}
      style={({ pressed }) => [styles.checkbox, pressed && styles.dimmed]}
    >
      <Ionicons name={isIncluded ? 'checkbox' : 'square-outline'} size={26} color={isIncluded ? theme.colors.primary : theme.colors.textSecondary} />
    </Pressable>
  );
}

/** "✓ Recibida" or "Faltan 2 de 20" once the reception has been checked; null before. */
function receptionText(line: OrderLine): string | null {
  const missing = missingPieces(line);
  if (missing === null) return null;
  return missing === 0 ? '✓ Recibida' : `Faltan ${formatQuantity(missing)} de ${formatQuantity(line.quantity)}`;
}

export function LinesList({ lines, currency, rates, onPressLine, onToggleLine }: LinesListProps) {
  const styles = useThemedStyles(makeStyles);
  const display = useDisplayCurrency();
  const money = (cents: number) => {
    const amount = displayAmount(cents, currency, display, rates);
    return formatMoney(amount.cents, amount.currency);
  };
  return (
    <Card>
      {lines.map((line, index) => {
        const total = lineTotalCents(line);
        const description = describeLine(line);
        const priceText =
          line.unitPriceCents === null || total === null
            ? 'Precio pendiente'
            : `${money(line.unitPriceCents)}/ud · ${money(total)}`;
        const substitution = substitutionText(line, lines);
        const reception = line.isExcluded ? null : receptionText(line);
        const notes = [line.isExcluded ? 'No incluida: no cuenta en el total ni en los pagos' : null, substitution, reception].filter(Boolean);
        return (
          <View key={line.id} style={[styles.lineRow, index > 0 && styles.separated]}>
            {onToggleLine ? <LineCheckbox line={line} onToggle={onToggleLine} /> : null}
            <View style={styles.lineBody}>
              <PressableRow
                onPress={() => onPressLine(line.id)}
                accessibilityLabel={[description, priceText, ...notes].join('. ')}
                accessibilityHint="Editar línea, cambiar precio o sustituir"
              >
                <Text style={[styles.lineTitle, line.isExcluded && styles.excluded]}>{description}</Text>
                <Text style={line.isExcluded ? [styles.secondary, styles.excluded] : line.unitPriceCents === null ? styles.pendingPrice : styles.secondary}>
                  {priceText}
                </Text>
                {line.isExcluded ? <Text style={styles.secondary}>No incluida: no cuenta en el total ni en los pagos</Text> : null}
                {substitution ? <Text style={styles.substitution}>{substitution}</Text> : null}
                {reception ? <Text style={missingPieces(line) ? styles.pendingPrice : styles.secondary}>{reception}</Text> : null}
              </PressableRow>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

type PaymentsListProps = {
  payments: readonly Payment[];
  /** Customs of the order, already paid when entered (null when there are none). */
  customs?: { cents: number; currency: Currency } | null;
  onPressPayment: (id: number) => void;
};

export function PaymentsList({ payments, customs = null, onPressPayment }: PaymentsListProps) {
  const styles = useThemedStyles(makeStyles);
  const customsAmount = customs ? formatMoney(customs.cents, customs.currency) : null;
  return (
    <Card>
      {customsAmount ? (
        // Customs are paid when entered: shown as a payment, edited from the order itself.
        <View accessible accessibilityLabel={`Aduanas ${customsAmount}, pagadas al introducirlas en el pedido`}>
          <Text style={styles.lineTitle}>Aduanas · {customsAmount}</Text>
          <Text style={styles.secondary}>Pagadas al introducirlas en el pedido</Text>
        </View>
      ) : null}
      {payments.map((p, index) => {
        const amount = formatMoney(p.amountCents, p.currency);
        const detail = [formatDate(p.paidOn), PAYMENT_METHOD_LABEL[p.method], p.note].filter(Boolean).join(' · ');
        return (
          <View key={p.id} style={index > 0 || customsAmount ? styles.separated : undefined}>
            <PressableRow onPress={() => onPressPayment(p.id)} accessibilityLabel={`Pago de ${amount}. ${detail}`} accessibilityHint="Editar pago">
              <Text style={styles.lineTitle}>{amount}</Text>
              <Text style={styles.secondary}>{detail}</Text>
            </PressableRow>
          </View>
        );
      })}
    </Card>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.divider },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    note: { ...typography.footnote, color: theme.colors.textSecondary },
    separated: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.divider },
    lineTitle: { ...typography.body, color: theme.colors.text },
    secondary: { ...typography.footnote, color: theme.colors.textSecondary },
    pendingPrice: { ...typography.footnote, color: theme.colors.warning.fg, fontWeight: '700' },
    lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    lineBody: { flex: 1 },
    checkbox: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    dimmed: { opacity: 0.6 },
    excluded: { textDecorationLine: 'line-through', color: theme.colors.textSecondary },
    substitution: { ...typography.footnote, color: theme.colors.primary, fontWeight: '600' },
  });
