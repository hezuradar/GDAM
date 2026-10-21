---
name: React Patterns (este proyecto)
description: Patrones React 19 aplicados a compras-proveedores. Usar al escribir o revisar componentes, hooks, estado, formularios o accesibilidad en src/components, src/hooks y src/app.
---

# React en compras-proveedores

React 19.2 (function components + hooks; sin RSC ni server actions: la app es Expo/React Native Web).

## Principios que aplican aquí

- **Render puro**: derivar en render (totales, listas filtradas) con `useMemo` solo si el cálculo es caro; nada de `useEffect` que sincronice estado derivado.
- **Efectos solo para efectos reales**: peticiones (`useLoader`), suscripciones (`storage` en `useDisplayCurrency`), seeds con guard. Nunca para transformar props a estado.
- **Hooks siempre al nivel superior**; early-returns solo después de declarar todos los hooks (así `orderId === null` no rompe el orden de hooks).
- **No memorizar por defecto**: `useCallback`/`useMemo` solo donde ya existen por una cadena de dependencias o coste medido (p. ej. `[reload]` en `useLoader`).

## Ubicación del estado

| Necesidad | Dónde |
|---|---|
| Un componente | `useState` local |
| Varios hermanos | estado en el ancestro común (ver formularios de `pedido/editar`) |
| Compartido y de baja frecuencia | Context o `useSyncExternalStore` (`useDisplayCurrency`) |
| Datos del servidor | `useLoader` + `@/api/data` (no duplicar en cliente) |
| Ruta/params | Expo Router (`useLocalSearchParams` validado) |

## Formularios (patrón del proyecto)

No hay librería de formularios: `useState` por campo, `validate()` puro que devuelve `Partial<Record<campo, string>>`, `announceErrors(errors)` anuncia el primero y devuelve `false` si hay errores, guard de envío con `isSaving` (estado) + ref (reentrada). Los errores se pintan con la prop `error` de `TextField`/`DateField`.

## Accesibilidad

- Todo elemento interactivo con `accessibilityRole` + `accessibilityLabel` (el patrón `Pressable`+`accessibilityState` de `ChipGroup` es el molde).
- Errores de formulario anunciados por live region, no solo pintados.
- El nodo decorativo que repite la etiqueta se oculta (`accessibilityElementsHidden` + `importantForAccessibility="no"`).
- Estados siempre completos: loading (`LoadingView`), error (`ErrorView` con retry), vacío (`EmptyState`) — nunca solo un spinner sin salida.

## Rendimiento

- Claves por id real, nunca índice.
- Renders derivados baratos no se memoizan; el único `memo`/ref de reentrada existente (`savingRef`) es para guardas de doble envío, no para render.
