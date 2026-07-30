# BlackHouse OS Web — guía para trabajar en este repo

Sitio en Vercel: **https://blackhouse-os-web.vercel.app** · repo `rafitox32-source/blackhouse-os-web`.
Vercel auto-despliega `main`: cada push va a producción, sin staging.

Las reglas generales de la máquina (rutas, shell, secretos, backups) están en
`C:/Users/BLACK HOUSE/.claude/CLAUDE.md`.

## 0. Qué es esto y qué NO es

Este repo es la **cara pública y móvil** del sistema. La app de escritorio (Electron) es un repo
aparte: `C:/Users/BLACK HOUSE/Desktop/app de rafitox`, con su propio `CLAUDE.md`. Los dos comparten
la **misma base de datos Supabase** (`flfhpffslhjcuvhxsnjz`), que es **producción real**: 4 empresas,
12 usuarios, ~800 productos, facturas emitidas.

Si el pedido menciona "la web", "el tracking", "el cliente", "la vendedora", "el QR" o "la cámara
del celular", el cambio va acá. Si menciona el taller, el inventario, las órdenes o el laboratorio,
va en el repo de escritorio.

| Página | Para quién | Notas |
|---|---|---|
| `index.html` | público | landing |
| `caracteristicas.html` | público | features + capturas |
| `tracking.html` | cliente final | seguimiento de su orden por código/QR |
| `panel-vendedor.html` | la vendedora | **el POS real.** La APK abre esta página |
| `panel-tecnico.html` / `panel.html` | técnico / dueño | paneles por rol |
| `camara-celular.html` | técnico | usa el celular como cámara del Estudio y manda la foto de IMEI a la PC |
| `actualizar-password.html` | usuarios | recuperación |
| `api/` | servidor | `db.js`, `login.js`, config y descarga |

## 1. Cómo habla con la base — y por qué importa

**El navegador nunca toca Supabase directo.** Todo pasa por `api/db.js`, que corre en el servidor
con la `service_role` y tiene una **allowlist**: qué tablas se pueden leer, qué RPC se pueden llamar
y con qué roles (`registrar_venta_movil`, `generar_boleta_movil`, etc.).

- Para permitir una operación nueva, hay que agregarla a esa allowlist. No hay atajo, y está bien
  que sea así.
- **`api/db.js` es el punto donde se apoya el aislamiento entre empresas.** Si un cambio quita o
  relaja un filtro por usuario/empresa, mostralo y esperá confirmación: ya fue bloqueado tres veces
  por debilitar seguridad, con razón.
- Las ventas van por RPC (nunca `insert` directo) para que el descuento de stock y el movimiento
  queden en la misma transacción de Postgres.

## 2. Probar localmente antes de pushear

Existe `dev-server.js`: sirve los archivos estáticos **y emula las funciones de Vercel**
(`/api/login`, `/api/db`, `/api/config`, `/api/download`), con recarga automática al guardar.

```bash
node dev-server.js
# http://localhost:3999/panel-vendedor.html
```

Usalo. Es mucho más barato que pushear a producción para ver si funcionó — y acá cada push ES
producción.

**No pelees con Playwright acá.** En una sesión se quemaron 6 comandos y 2 tareas de fondo
instalando Chromium (con un lock colgado en `ms-playwright/__dirlock`) solo para ver un HTML. Los
navegadores ya están cacheados en `C:/Users/BLACK HOUSE/AppData/Local/ms-playwright`; y para mirar
una página alcanza `dev-server.js` + el navegador, o `preview_start`.

## 3. El POS de la vendedora (`panel-vendedor.html`)

Es de donde sale la plata, así que es lo más delicado del repo.

- Vende llamando a `registrar_venta_movil` **una vez por producto** (atómico: valida stock, lo
  descuenta y registra el movimiento en una transacción).
- Después llama **una vez** a `generar_boleta_movil` con el método de pago, que crea la factura.
- Su **Cierre de Caja lee `facturas`**, no `ventas_pos` — por eso su desglose por método de pago es
  correcto.
- **Limitación conocida:** `registrar_venta_movil` no recibe el método de pago, así que las filas de
  `ventas_pos` quedan como `'efectivo'`. Los totales son correctos; solo el desglose por método de
  las ventas móviles queda incompleto en el Excel del escritorio. Arreglarlo requiere DROP+CREATE
  del RPC y desplegar acá — se decidió no tocar el camino de cobro por una columna de reporte.
- Si la venta falla a mitad del carrito, los productos ya procesados se quitan del carrito para no
  venderlos dos veces. No rompas esa lógica.

## 4. La foto de IMEI (`camara-celular.html`)

Manda una foto al escritorio por el canal de emparejamiento, en trozos de 48 KB. Esa foto **no se
mira: se le pasa a un OCR**, así que se captura con `ImageCapture.takePhoto()` (resolución del
sensor), se baja a 2000 px de lado máximo y se comprime a **JPEG 0.92**.

No bajes esa calidad para "ahorrar". A 0.82 el JPEG dejaba halos alrededor de los dígitos finos y el
lector confundía 8/6/0 — fue una causa real de que el escaneo de IMEI no funcionara.

## 5. Publicar

`/subir` (en `.claude/commands/`) hace: `node --check` → `fetch`+`rebase` → commit de una línea →
push → y **espera a que Vercel sirva el cambio** antes de decir que está listo.

- Mensajes de commit de **una sola línea** con `-m`. Los heredocs rompen en PowerShell.
- **`sleep N && ...` está bloqueado** por el clasificador. Para esperar el deploy: `until curl ...`.
- `gh` **no está instalado** en esta máquina.
- No subas descargas ni pruebas que queden en la carpeta: ya había un instalador de Java de 2,3 MB,
  un `.zip` y capturas sueltas sin trackear. Están en el `.gitignore` — que sigan afuera. Un binario
  pesado en el historial de git no se saca más.

## 6. Secretos

Nunca imprimas el contenido de `.env` ni valores de claves, ni truncados — ni siquiera para
"verificar". Comprobá presencia y formato. La `anon key` es pública por diseño; la `service_role`
vive solo en las variables de entorno de Vercel y **nunca** va al cliente.
