# Compras a proveedores (app web para móvil)

Aplicación web, pensada para el móvil, para gestionar los pedidos que haces a tus proveedores por WhatsApp. Los datos se
guardan en una **base de datos en la nube** (Cloudflare D1), así que se ven igual desde el móvil y el ordenador y no se
pierden si se borra el navegador. Se puede **instalar en la pantalla de inicio** (PWA).

- **Web:** <https://compras-gdam.compras-proveedores.workers.dev>
- **Código:** <https://github.com/hezuradar/GDAM>

## Qué hace

- **Proveedores**: nombre, número de WhatsApp y notas. Abre el chat directamente.
- **Pedidos**: fecha, estado (borrador → confirmado → enviado → recibido / cancelado) y moneda (EUR o USD).
- **Pegar de WhatsApp**: copia el mensaje del proveedor y pégalo. Cada línea se interpreta como
  `cantidad tipo-de-pieza medidas [precio]`, por ejemplo:
  ```
  10 tornillo M8x40
  5 x placa 200x300x5 3.50
  12 pcs tubo 25x2 L=1000 @ 4,20€
  ```
  Antes de guardar ves una vista previa. Las líneas dudosas se marcan para revisar y puedes desmarcar las que no quieras.
- **Precio por pieza** ahora o después: las líneas sin precio aparecen como «precio pendiente» y el total se marca como
  provisional.
- **Envío y aduanas**, cada uno en su moneda (EUR/USD), convertidos a la moneda del pedido. Si cambias la moneda de un
  pedido, también se convierten los precios de sus líneas.
- **Cambio euro/dólar de mercado**: el servidor lo descarga cada hora (open.er-api.com y, como respaldo, currency-api). Se
  puede pasar a modo manual en Ajustes, o fijar un cambio propio en un pedido. Las fuentes gratuitas publican la
  cotización una vez al día; si una fuente devuelve un salto de más del 10 %, se ignora.
- **Número de seguimiento y transportista** por pedido, con botones para copiarlo y rastrearlo.
- **Pagos parciales o totales** en cualquier moneda, cada uno con su propio cambio. El pedido muestra si está *sin pagar*,
  con *pago parcial* o *pagado*, y cuánto falta.
- **Filtros y búsqueda** por proveedor, estado, pago, moneda, pieza, medidas o seguimiento.
- **Resumen por WhatsApp** y **copia de seguridad** en JSON desde Ajustes.

## Pensada para el móvil

- **Instalable**: manifest, iconos propios y modo pantalla completa.
  - iPhone (Safari): Compartir → «Añadir a pantalla de inicio».
  - Android (Chrome): menú ⋮ → «Instalar aplicación».
- **Zonas seguras y altura dinámica**: `viewport-fit=cover` y `100dvh`.
- **Teclados adecuados** para importes, teléfono y búsqueda, y selector de fecha nativo.
- **Sin zoom involuntario** al tocar los campos (texto de 16 px o más).
- **Áreas táctiles** de 44 px o más.
- **Accesible**: modo claro y oscuro con contraste AA, etiquetas para lectores de pantalla y avisos `aria-live`.

## Arquitectura

```
Navegador (Expo Router + React Native Web)  ──/api/*──▶  Cloudflare Worker  ──▶  Cloudflare D1 (SQLite)
                         ▲                                    │  cron cada hora → cambio EUR/USD
                         └──────── archivos estáticos ◀───────┘
```

| Carpeta | Contenido |
|---|---|
| `src/domain/` | Lógica pura y probada: analizador de WhatsApp, importes y cambio, totales, pagos, filtros, resumen |
| `src/api/` | Cliente de la API (lo usan las pantallas) |
| `src/worker/` | Servidor: rutas, validación, autenticación, consultas a D1 y cambio de divisa |
| `migrations/` | Esquema de la base de datos (`wrangler d1 migrations`) |
| `src/app/`, `src/components/`, `src/hooks/` | Pantallas y componentes de interfaz |
| `public/` | `index.html`, manifest, service worker, iconos y cabeceras |

Los importes se guardan en céntimos enteros y el cambio como «1 € = X US$» × 10⁶, para no arrastrar errores de redondeo.

## Seguridad

- **Inicio de sesión con contraseña**, gratis y sin servicios externos.
  - La contraseña se guarda en el secreto del Worker `APP_PASSWORD`, nunca en el código.
  - Al entrar, el servidor crea una cookie de sesión firmada (HMAC-SHA256, `HttpOnly`, `Secure`, `SameSite=Strict`)
    que dura 30 días.
  - Cambiar la contraseña cierra todas las sesiones.
- **Protección contra ataques por fuerza bruta:** tras 10 fallos, esa conexión espera 15 minutos.
- **API cerrada por defecto:** sin `APP_PASSWORD` (o si tiene menos de 10 caracteres), no da acceso a ningún dato.
- **Consultas parametrizadas** y validación de todos los datos en el servidor.
- **Protección CSRF:** las modificaciones solo se aceptan en JSON y desde el mismo origen.

### Poner o cambiar la contraseña

En la carpeta del proyecto, ejecuta el comando y escribe la contraseña cuando la pida (mínimo 10 caracteres; no se
muestra en pantalla):

```bash
npx wrangler secret put APP_PASSWORD
```

También se puede hacer en el panel de Cloudflare: **Workers & Pages → compras-gdam → Settings → Variables and secrets →
Add**, con tipo **Secret** y nombre `APP_PASSWORD`.

## Publicación

- **Automática:** cada `git push` a `main` hace que Cloudflare (Workers Builds) ejecute `npm run build` y
  `npx wrangler deploy`. El estado se ve en el panel: Workers → compras-gdam → Deployments.
- **Cambios en la base de datos:** si se añade una migración en `migrations/`, hay que aplicarla una vez a mano con
  `npm run db:migrate` (la publicación automática no toca el esquema).

## Desarrollo

```bash
npm install
cp .dev.vars.example .dev.vars   # solo en local: salta la contraseña en localhost
npm run dev                      # compila la web, prepara la D1 local y arranca http://localhost:8787
npm test                         # tests (app + servidor)
npm run typecheck                # TypeScript (app + servidor)
npm run deploy                   # compila, aplica migraciones en la D1 remota y publica
```
