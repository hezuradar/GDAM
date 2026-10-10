import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { countActiveFilters, ORDER_SORTS, type OrderFilterCriteria, type OrderSort } from '@/domain/orderFilters';
import { CURRENCIES, ORDER_STATUSES, PAYMENT_STATUSES, type Currency, type Supplier } from '@/domain/types';
import {
  ORDER_STATUS_ICON,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_ICON,
  PAYMENT_STATUS_LABEL,
  SORT_LABEL,
} from '@/i18n/es';
import { spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';
import { Button, ButtonRow } from '../ui/Button';
import { ChipGroup, MultiChipGroup } from '../ui/ChipGroup';

type FilterSheetProps = {
  isVisible: boolean;
  criteria: OrderFilterCriteria;
  suppliers: readonly Supplier[];
  onChange: (criteria: OrderFilterCriteria) => void;
  onClose: () => void;
};

const ALL = -1;
const ALL_CURRENCIES = 'todas';

export function FilterSheet({ isVisible, criteria, suppliers, onChange, onClose }: FilterSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const update = (patch: Partial<OrderFilterCriteria>) => onChange({ ...criteria, ...patch });
  const activeCount = countActiveFilters(criteria);

  return (
    <Modal visible={isVisible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Filtrar y ordenar
          </Text>
          <Button variant="plain" label="Listo" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <ChipGroup<OrderSort>
            label="Ordenar por"
            value={criteria.sort ?? 'fecha_desc'}
            options={ORDER_SORTS.map((s) => ({ value: s, label: SORT_LABEL[s] }))}
            onChange={(sort) => update({ sort })}
          />
          <MultiChipGroup
            label="Estado del pedido"
            values={criteria.statuses ?? []}
            options={ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s], icon: ORDER_STATUS_ICON[s] }))}
            onChange={(statuses) => update({ statuses })}
          />
          <MultiChipGroup
            label="Estado del pago"
            values={criteria.paymentStatuses ?? []}
            options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s], icon: PAYMENT_STATUS_ICON[s] }))}
            onChange={(paymentStatuses) => update({ paymentStatuses })}
          />
          <ChipGroup<Currency | typeof ALL_CURRENCIES>
            label="Moneda"
            value={criteria.currency ?? ALL_CURRENCIES}
            options={[{ value: ALL_CURRENCIES, label: 'Todas' }, ...CURRENCIES.map((c) => ({ value: c, label: c }))]}
            onChange={(value) => update({ currency: value === ALL_CURRENCIES ? null : value })}
          />
          <ChipGroup<number>
            label="Proveedor"
            value={criteria.supplierId ?? ALL}
            options={[{ value: ALL, label: 'Todos' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
            onChange={(value) => update({ supplierId: value === ALL ? null : value })}
          />
          <ButtonRow>
            <Button
              variant="secondary"
              icon="refresh"
              label={activeCount > 0 ? `Quitar filtros (${activeCount})` : 'Sin filtros activos'}
              isDisabled={activeCount === 0}
              onPress={() => onChange({ query: criteria.query, sort: criteria.sort })}
            />
          </ButtonRow>
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    sheet: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    title: { ...typography.title, color: theme.colors.text, flexShrink: 1 },
    content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl * 2 },
  });
