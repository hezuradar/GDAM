import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { useMemo } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { useTheme } from '@/theme/theme';

/** Data lives in the cloud database behind the /api Worker; screens load it through @/api/data. */
export default function RootLayout() {
  const theme = useTheme();
  const navigationTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, primary: theme.colors.primary, background: theme.colors.background, card: theme.colors.surface },
    };
  }, [theme]);

  return (
    <ThemeProvider value={navigationTheme}>
      <AuthGate>
      <Stack screenOptions={{ headerBackTitle: 'Atrás', contentStyle: { backgroundColor: theme.colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Inicio' }} />
        <Stack.Screen name="pedido/[id]" options={{ title: 'Pedido' }} />
        <Stack.Screen name="proveedor/[id]" options={{ title: 'Proveedor' }} />
        <Stack.Screen name="pedido/editar" options={{ presentation: 'modal', title: 'Pedido' }} />
        <Stack.Screen name="pedido/importar" options={{ presentation: 'modal', title: 'Pegar de WhatsApp' }} />
        <Stack.Screen name="pedido/linea" options={{ presentation: 'modal', title: 'Línea' }} />
        <Stack.Screen name="pedido/repartir" options={{ presentation: 'modal', title: 'Repartir importe total' }} />
        <Stack.Screen name="pedido/pago" options={{ presentation: 'modal', title: 'Pago' }} />
        <Stack.Screen name="proveedor/editar" options={{ presentation: 'modal', title: 'Proveedor' }} />
        <Stack.Screen name="producto/[id]" options={{ presentation: 'modal', title: 'Precio de venta' }} />
      </Stack>
      </AuthGate>
    </ThemeProvider>
  );
}
