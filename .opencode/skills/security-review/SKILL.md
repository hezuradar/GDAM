---
name: Security Review (este proyecto)
description: Revisión de seguridad aplicada a compras-proveedores (Expo + Cloudflare Worker + D1). Usar al añadir endpoints, tocar src/worker, autenticación, validate.ts, datos sensibles, dependencias o antes de un deploy con eas/wrangler.
---

# Security Review en compras-proveedores

Arquitectura: SPA Expo (web-first) + Cloudflare Worker (D1, cookie de sesión HttpOnly, APP_PASSWORD). **Todos los secretos viven en el Worker**; el bundle web no debe contener ninguno.

## Reglas duras

1. **Nunca commitear `.dev.vars`** (está en `.gitignore`). No leerlo ni pegar su contenido en respuestas, commits ni issues.
2. **SQL solo parametrizado** en `src/worker/repo.ts`. Cero concatenación de valores en queries; las identidades tabulares van contra listas fijas.
3. **Validar server-side siempre**: cualquier endpoint nuevo pasa por `src/worker/validate.ts`. La validación del cliente (`src/lib/validate.ts`) es UX, no seguridad.
4. Sin secretos ni `console.log` con datos en el bundle de la app; el Worker solo usa `console.error`/`console.warn` y nunca loguea cookies, contraseñas o cuerpos completos.
5. Sesión: cookie HttpOnly con `Secure`+`SameSite=Lax`; `SameSite=Strict` solo en `/api/auth/logout` (patrón anti-login-CSRF). No tocar sin revisar el flujo de 401 (`sessionExpired` en `src/api/client.ts`).

## Checklist al tocar el backend

- [ ] Endpoint nuevo: método correcto, valida con `validate.ts`, respeta rate-limit (`checkRateLimit` en login) y auth (`requireSession`).
- [ ] Input numérico saneado en servidor: enteros en céntimos vía helpers, división por cero protegida, timestamps no destructivos.
- [ ] Escrituras atómicas con `db.batch` cuando hay múltiples tablas (líneas + envío de un pedido).
- [ ] Sin URLs construidas con input sin escapar en `fetch` (ya hay `buildRateUrl` con `URL`; no duplicar ese patrón a mano).
- [ ] `npm audit --audit-level=high` limpio; nuevas dependencias justificadas.

## Checklist al tocar el cliente

- [ ] Nada de credenciales, tokens ni APP_PASSWORD en `src/` fuera del Worker.
- [ ] `parseIdParam`/`safeReturnPath` para params y rutas de retorno (no abrir rutas arbitrarias).
- [ ] Teléfonos/URLs de terceros sanitizados (`whatsappDigits`, `whatsappUrl` en `src/lib/params.ts`).
- [ ] `dangerouslySetInnerHTML` no existe en React Native — no introducir markup HTML crudo.

## Pre-deploy

```bash
git status --short                # nada raro staged
git grep -n -E "sk-[A-Za-z0-9]|api[_-]?key\s*=\s*['\"]" -- src
npm audit --audit-level=high
```

Después: `npx wrangler deploy` solo si `src/worker/validate.ts` + tests están verdes, y `eas deploy`/build desde la rama verde.
