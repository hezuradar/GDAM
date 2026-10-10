import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { IconButton } from '@/components/ui/Button';
import { useTheme } from '@/theme/theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: { backgroundColor: theme.colors.surface },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />,
          headerRight: () => (
            <IconButton icon="add-circle" label="Nuevo pedido" onPress={() => router.push('/pedido/editar')} />
          ),
        }}
      />
      <Tabs.Screen
        name="proveedores"
        options={{
          title: 'Proveedores',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} />,
          headerRight: () => (
            <IconButton icon="person-add" label="Nuevo proveedor" onPress={() => router.push('/proveedor/editar')} />
          ),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
