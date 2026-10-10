# Compras a proveedores (app web para móvil)

Aplicación web, pensada para el móvil, para gestionar los pedidos que haces a tus proveedores por WhatsApp. Se puede
**instalar en la pantalla de inicio** (PWA) y funciona **sin conexión**: los datos se guardan en el propio navegador
(SQLite sobre OPFS) y no se envían a ningún servidor.

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
- **Envío y aduanas**, cada uno en su moneda (EUR/USD). La app los convierte a la moneda del pedido con el cambio de
  Ajustes, o con un cambio fijo para ese pedido. Si cambias la moneda de un pedido, también se convierten los precios de
  sus líneas.
- **Número de seguimiento y transportista** por pedido, con botones para copiarlo y rastrearlo.
- **Pagos parciales o totales** en cualquier moneda, cada uno con su propio cambio. El pedido muestra si está *sin pagar*,
  con *pago parcial* o *pagado*, y cuánto falta.
- **Filtros y búsqueda**: proveedor, estado del pedido, estado del pago y moneda. Búsqueda por pieza, medidas, proveedor
  o seguimiento, y orden por fecha o por importe pendiente.
- **Resumen por WhatsApp** y **copia de seguridad** en JSON, que en el móvil se puede enviar a Archivos, Drive o al correo.

## Pensada para el móvil

- **Instalable**: `manifest.webmanifest`, iconos propios y modo pantalla completa (`standalone`). El service worker
  permite abrirla sin conexión.
- **Zonas seguras**: respeta el notch y la barra de inicio (`viewport-fit=cover`). La altura sigue la barra de direcciones
  del navegador (`100dvh`).
- **Teclados adecuados**: el decimal para importes, el de teléfono para WhatsApp y el de búsqueda en los buscadores.
  También usa el selector de fecha del propio móvil.
- **Sin zoom involuntario**: los textos de los campos son de 16 px o más, así que iOS no amplía al tocarlos. El zoom manual
  sigue permitido.
- **Áreas táctiles** de 44 px o más, sin retraso al tocar y sin el resaltado gris al pulsar.
- **Modo claro y oscuro** automáticos, con contraste AA.
- **Lectores de pantalla**: etiquetas para cada control, anuncios por `aria-live` y foco visible con teclado.

## Uso

```bash
npm install
npm run build    # genera la web estática en dist/
npm run serve    # la sirve en http://127.0.0.1:8080 con las cabeceras necesarias
```

Para abrirla desde el móvil en la misma red Wi‑Fi, usa `HOST=0.0.0.0 npm run serve` y entra a la IP del ordenador. Fuera
de `localhost` el navegador exige **HTTPS** para guardar datos y para instalar la app, así que para el uso diario
publícala en un hosting con HTTPS.

### Publicarla (Cloudflare Pages)

El código está en <https://github.com/hezuradar/GDAM>. Cloudflare Pages lo compila y publica solo en cada `git push`.

1. En <https://dash.cloudflare.com>, ve a **Workers y Pages → Crear → Pages → Conectar con Git** y elige
   `hezuradar/GDAM`.
2. Configuración de compilación:
   - **Framework**: *Ninguno*
   - **Comando de compilación**: `npm run build`
   - **Directorio de salida**: `dist`
   - La versión de Node la toma de `.node-version`.
3. Pulsa **Guardar e implementar**. La web queda en `https://<nombre>.pages.dev`, con HTTPS. Las cabeceras de
   `public/_headers` se aplican solas.

Cualquier otro hosting también vale, porque `dist/` es una web estática. Cualquier hosting con HTTPS sirve, siempre que envíe estas dos cabeceras (sin ellas la base
de datos no puede abrirse):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

- **Netlify y Cloudflare Pages** las aplican solos con `dist/_headers`.
- **Otros servidores** (nginx, IIS, Apache…) necesitan que se añadan a mano.
- Se usa `require-corp` y no `credentialless` porque Safari en iPhone solo admite `require-corp`.

Después, en el móvil:

- **iPhone (Safari)**: Compartir → «Añadir a pantalla de inicio».
- **Android (Chrome)**: menú ⋮ → «Instalar aplicación».

### Desarrollo

```bash
npm start            # servidor de desarrollo con recarga en caliente (web)
npm test             # tests unitarios (Jest)
npm run test:coverage
npm run typecheck    # TypeScript
```

| Carpeta | Contenido |
|---|---|
| `src/domain/` | Lógica pura y probada: analizador de WhatsApp, importes y cambio, totales, estado de pago, filtros, resumen |
| `src/db/` | Esquema SQLite con migraciones y repositorios (consultas parametrizadas) |
| `src/hooks/` | Carga de datos al entrar en cada pantalla |
| `src/components/` | Componentes de interfaz accesibles |
| `src/app/` | Pantallas (Expo Router) |
| `public/` | `index.html`, manifest, service worker, iconos y cabeceras para el hosting |
| `scripts/serve-web.mjs` | Servidor estático local con las cabeceras necesarias |

Los importes se guardan en céntimos enteros y el cambio como «1 € = X US$» × 10⁶, para no arrastrar errores de redondeo.

## Datos

Cada navegador guarda sus propios datos y no se sincronizan entre dispositivos. Si se borran los datos del sitio, se
pierden: haz copias desde Ajustes → «Guardar copia (.json)».
