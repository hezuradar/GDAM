import { StyleSheet, Text, View } from 'react-native';
import { formatDate, formatQuantity } from '@/domain/exportText';
import { displayAmount, formatMoney, formatRate, type FxRates } from '@/domain/money';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';
import type { PaymentSummary } from '@/domain/payments';
import { lineTotalCents, type OrderTotals } from '@/domain/totals';
import { missingPieces } from '@/domain/reception';
import type { Currency, OrderLine, Payment } from '@/domain/types';
import { PAYMENT_METHOD_LABEL } from '@/i18n/es';
import { spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';
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
  return (
    <Card>
      <InfoRow icon="cube-outline" label="Mercancía" value={money(totals.goodsCents)} />
      <InfoRow icon="airplane-outline" label="Envío" value={money(totals.shippingCents)} />
      <InfoRow icon="shield-checkmark-outline" label="Aduanas" value={money(totals.customsCents)} />
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
      {payment.overpaidCents > 0 ? <InfoRow icon="alert-circle-outline" label="Pagado de más" value={money(payment.overpaidCents)} /> : null}
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
};

/** "✓ Recibida" or "Faltan 2 de 20" once the reception has been checked; null before. */
function receptionText(line: OrderLine): string | null {
  const missing = missingPieces(line);
  if (missing === null) return null;
  return missing === 0 ? '✓ Recibida' : `Faltan ${formatQuantity(missing)} de ${formatQuantity(line.quantity)}`;
}

export function LinesList({ lines, currency, rates, onPressLine }: LinesListProps) {
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
        const description = [formatQuantity(line.quantity), line.pieceType, line.measurements].filter(Boolean).join(' ');
        const priceText =
          line.unitPriceCents === null || total === null
            ? 'Precio pendiente'
            : `${money(line.unitPriceCents)}/ud · ${money(total)}`;
        return (
          <View key={line.id} style={index > 0 ? styles.separated : undefined}>
            <PressableRow
              onPress={() => onPressLine(line.id)}
              accessibilityLabel={`${description}. ${priceText}${receptionText(line) ? `. ${receptionText(line)}` : ''}`}
              accessibilityHint="Editar línea o añadir precio"
            >
              <Text style={styles.lineTitle}>{description}</Text>
              <Text style={line.unitPriceCents === null ? styles.pendingPrice : styles.secondary}>{priceText}</Text>
              {receptionText(line) ? (
                <Text style={missingPieces(line) ? styles.pendingPrice : styles.secondary}>{receptionText(line)}</Text>
              ) : null}
            </PressableRow>
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
  });
