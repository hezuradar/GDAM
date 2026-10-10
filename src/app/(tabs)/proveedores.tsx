import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { CONTENT_MAX_WIDTH, EmptyState, ErrorView, LoadingView, PressableRow } from '@/components/ui/Layout';
import { TextField } from '@/components/ui/TextField';
import { listSuppliers } from '@/api/data';
import { foldText } from '@/domain/orderFilters';
import { useLoader } from '@/hooks/useLoader';
import { radius, spacing, typography, useThemedStyles, type Theme } from '@/theme/theme';

export default function SuppliersScreen() {
  const styles = useThemedStyles(makeStyles);
  const { data, error, loading, reload } = useLoader(listSuppliers);
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const folded = foldText(query.trim());
    return (data ?? []).filter((s) => foldText(`${s.name} ${s.notes}`).includes(folded));
  }, [data, query]);

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
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <PressableRow
            onPress={() => router.push({ pathname: '/proveedor/[id]', params: { id: item.id } })}
            accessibilityLabel={`${item.name}${item.whatsapp ? `, WhatsApp ${item.whatsapp}` : ''}`}
            accessibilityHint="Abre el proveedor y sus pedidos"
          >
            <Text style={styles.name}>{item.name}</Text>
            {item.whatsapp ? <Text style={styles.secondary}>WhatsApp {item.whatsapp}</Text> : null}
            {item.notes ? (
              <Text style={styles.secondary} numberOfLines={2}>
                {item.notes}
              </Text>
            ) : null}
          </PressableRow>
        </View>
      )}
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
    secondary: { ...typography.footnote, color: theme.colors.textSecondary },
  });
