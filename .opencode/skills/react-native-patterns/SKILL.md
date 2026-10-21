---
name: React Native / Expo Patterns (este proyecto)
description: Patrones React Native y Expo aplicados a compras-proveedores. Usar al crear o editar pantallas (src/app), componentes (src/components), navegación Expo Router, hooks de datos, estilos o listas en este repositorio.
---

# React Native / Expo en compras-proveedores

App Expo SDK 57 + React Native 0.86 (New Architecture) + React Native Web, Expo Router, TypeScript. La app es **web-first**: no hay `ios/` ni `android/` (Continuous Native Generation).

## Estructura y navegación

- Rutas en `src/app/`; cada archivo es una pantalla, `_layout.tsx` define navegadores. Todo lo no-ruta (componentes, hooks, dominio) vive fuera de `src/app/`.
- Los route files son delgados: leen params con `parseIdParam` (de `@/lib/params`) y delegan en hooks/pantallas. **Nunca** usar `useLocalSearchParams` sin validar: un param inválido da `null` y la pantalla muestra `EmptyState`; jamás `?? 0` que dispare peticiones a la API con id 0.
- Para volver atrás: `goBack()` de `@/lib/params`. Entre flujo de pantalla intermedia (ej. crear proveedor desde un pedido) se pasa `returnTo` validado con `safeReturnPath`.

## Datos y estado

- **No** usar TanStack Query ni stores globales: el patrón del proyecto es `useLoader` (hook local con `loading/error/data/reload` + `useFocusEffect`) y sus derivaciones `useOrderDetail`, `useOrderList`.
- El estado de servidor vive en la API (`@/api/data` → Worker). No copiar datos del servidor a un store de cliente.
- Formularios: `useState` por campo + `validate()` que devuelve errores + `announceErrors()` (de `@/components/ui/alerts`) + guard `isSaving`/`savingRef` contra doble envío.
- `useDisplayCurrency` es el único estado compartido (useSyncExternalStore + localStorage).

## Listas y render

- Listas dentro de `FormScroll` (ScrollView): son listas de detalle con `keyExtractor`-equivalente (`key={item.id}`). Si una lista puede crecer sin límite (líneas de pedido, historial), revisar que no se renderice en frío sin virtualizar; ante crecimiento real, migrar a `FlatList`.
- `StyleSheet.create` en el módulo + `useThemedStyles(makeStyles)` para temas. No crear objetos de estilo inline en rutas calientes.

## Efectos y hooks

- Hooks siempre al nivel superior; los early-returns **después** de todos los hooks (patrón: guard de `orderId === null` tras el `useEffect`).
- Todo `useEffect` que hace una petición cancela/invalida en el cleanup (`requestId`) y resetea su estado al cambiar de pantalla (ver `pago.tsx`).
- `StrictMode` ejecuta los efectos dos veces: el seed de formularios va protegido con ref (`seededFor` en `pedido/editar.tsx`).

## UI móvil y web

- Targets táctiles ≥ `MIN_TOUCH`; usar los tokens de `@/theme/theme` (`spacing`, `typography`, `radius`).
- Accesibilidad: `accessibilityRole`, `accessibilityLabel`, live region vía `announce()`/`announceErrors()`. El texto decorativo duplicado se oculta (`accessibilityElementsHidden`).
- Nunca secretos en el bundle: todo lo sensible (sesión, APP_PASSWORD) vive en el Worker.
