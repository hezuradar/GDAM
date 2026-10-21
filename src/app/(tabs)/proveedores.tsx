import { router } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { CONTENT_MAX_WIDTH, EmptyState, ErrorView, LoadingView, PressableRow } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { Avatar, IconText } from '@/components/ui/Visuals';
import { listSuppliers } from '@/api/data';
import { foldText } from '@/domain/orderFilters';
import { useLoader } from '@/hooks/useLoader';
import { radius, spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

type Supplier = Awaited<ReturnType<typeof listSuppliers>>[number];

const SupplierCard = memo(function SupplierCard({ supplier, onOpen }: { supplier: Supplier; onOpen: (id: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card}>
      <PressableRow
        onPress={() => onOpen(supplier.id)}
        accessibilityLabel={`${supplier.name}${supplier.whatsapp ? `, WhatsApp ${supplier.whatsapp}` : ''}`}
        accessibilityHint="Abre el proveedor y sus pedidos"
      >
        <View style={styles.row}>
          <Avatar name={supplier.name} />
          <View style={styles.info}>
            <Text style={styles.name}>{supplier.name}</Text>
            {supplier.whatsapp ? <IconText icon="logo-whatsapp">{supplier.whatsapp}</IconText> : null}
            {supplier.notes ? <IconText icon="document-text-outline">{supplier.notes}</IconText> : null}
          </View>
        </View>
      </PressableRow>
    </View>
  );
});

/** Stable separator component: an inline arrow would remount every separator on each render. */
function ListSeparator() {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.separator} />;
}

export default function SuppliersScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(listSuppliers);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const folded = foldText(query.trim());
    return (data ?? []).filter((s) => foldText(`${s.name} ${s.notes}`).includes(folded));
  }, [data, query]);
  const open = useCallback((id: number) => router.push({ pathname: '/proveedor/[id]', params: { id } }), []);
  // Stable renderItem: a new function every render would re-render every visible row on
  // each keystroke in the search box.
  const renderItem = useCallback(({ item }: { item: Supplier }) => <SupplierCard supplier={item} onOpen={open} />, [open]);

  if (error) return <ErrorView message={error} onRetry={reload} />;
  if (!data && loading) return <LoadingView />;
  if (!data) return null;
  if (data.length === 0) {
    return (
      <EmptyState
        icon="people-outline"
        title="Sin proveedores"
        message="Añade tus proveedores con su número de WhatsApp para enviarles resúmenes de pedido."
        actionLabel="Añadir proveedor"
        onAction={() => router.push('/proveedor/editar')}
      />
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={visible}
      keyExtractor={(s) => String(s.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.search}>
          <TextField label="Buscar proveedor" value={query} onChangeText={setQuery} autoCorrect={false} inputMode="search" enterKeyHint="search" />
        </View>
      }
      ItemSeparatorComponent={ListSeparator}
      renderItem={renderItem}
    />
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    list: { padding: spacing.lg, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    search: { marginBottom: spacing.md },
    separator: { height: spacing.sm },
    card: { backgroundColor: theme.colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
    name: { ...typography.headline, color: theme.colors.text },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
    info: { flex: 1, gap: spacing.xs },
    secondary: { ...typography.footnote, color: theme.colors.textSecondary },
  });
