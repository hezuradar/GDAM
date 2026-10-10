import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { DATABASE_NAME, migrateDb } from '@/db/schema';
import { spacing, typography, useTheme } from '@/theme/theme';

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  title: { ...typography.title, textAlign: 'center' },
  text: { ...typography.body, textAlign: 'center', maxWidth: 480 },
  // Row wrapper: Button grows along the main axis, so in a column it would stretch vertically.
  action: { flexDirection: 'row', minWidth: 200 },
});

export default function RootLayout() {
  const theme = useTheme();
  const [dbError, setDbError] = useState<string | null>(null);
  const navigationTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: theme.colors.primary, background: theme.colors.background, card: theme.colors.surface },
    };
  }, [theme]);

  if (dbError) {
    // The browser database (OPFS) can only be open in one tab/window at a time.
    const isLockedByOtherTab = /NoModificationAllowed|createSyncAccessHandle|locked/i.test(dbError);
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]} accessibilityRole="alert">
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {isLockedByOtherTab ? 'La app ya está abierta en otra pestaña' : 'No se pudo abrir la base de datos'}
        </Text>
        <Text style={[styles.text, { color: theme.colors.textSecondary }]}>
          {isLockedByOtherTab
            ? 'Solo puede usarse en una pestaña o ventana a la vez. Cierra las demás (o la app instalada) y pulsa Reintentar.'
            : dbError}
        </Text>
        <View style={styles.action}>
          <Button label="Reintentar" icon="refresh" onPress={() => window.location.reload()} />
        </View>
      </View>
    );
  }

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDb} onError={(e) => setDbError(e.message)}>
      <ThemeProvider value={navigationTheme}>
        <Stack screenOptions={{ headerBackTitle: 'Atrás', contentStyle: { backgroundColor: theme.colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Inicio' }} />
          <Stack.Screen name="pedido/[id]" options={{ title: 'Pedido' }} />
          <Stack.Screen name="proveedor/[id]" options={{ title: 'Proveedor' }} />
          <Stack.Screen name="pedido/editar" options={{ presentation: 'modal', title: 'Pedido' }} />
          <Stack.Screen name="pedido/importar" options={{ presentation: 'modal', title: 'Pegar de WhatsApp' }} />
          <Stack.Screen name="pedido/linea" options={{ presentation: 'modal', title: 'Línea' }} />
          <Stack.Screen name="pedido/pago" options={{ presentation: 'modal', title: 'Pago' }} />
          <Stack.Screen name="proveedor/editar" options={{ presentation: 'modal', title: 'Proveedor' }} />
        </Stack>
      </ThemeProvider>
    </SQLiteProvider>
  );
}
