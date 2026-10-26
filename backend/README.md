# Blend · panel y API

Servicio de Railway que sirve el panel de administración (`admin.<dominio>`) y la API (`api.<dominio>`). La web pública sigue en Vercel (raíz del repo).

## Desarrollo local

```sh
cd backend
npm install
cp .env.example .env        # y completar BETTER_AUTH_SECRET
npm run db:up               # Postgres en Docker (puerto 5433)
npm run db:migrate
npm run create-owner -- --email tu@correo.com --name "Tu nombre"
npm run seed:catalog        # pasa las bebidas, fotos y e-books de la web a la base
npm run dev                 # http://localhost:4400/admin
```

Sin `S3_BUCKET`, las fotos y los PDF se guardan en `./storage`.

Sin `RESEND_API_KEY`, los correos (invitaciones, avisos de inicio de sesión) se imprimen en la consola.

Para cambiar el esquema: editar `src/db/schema.ts`, correr `npm run db:generate` y hacer commit de la migración nueva en `drizzle/`.

## Seguridad del acceso

- Solo se entra por invitación (enlace de un solo uso, 24 h) o con `create-owner` desde la consola.
- Contraseña de 12+ caracteres (argon2) **y** código TOTP obligatorio; o passkey. El 2FA no se puede desactivar.
- 5 contraseñas fallidas bloquean la cuenta 15 min (se duplica con cada fallo extra) y hay rate limit por IP.
- La sesión vence tras 30 min sin actividad y nunca dura más de 12 h. Desactivar a alguien cierra sus sesiones al instante.
- Aviso por correo al entrar desde un dispositivo nuevo. Todo cambio queda en **Actividad**.
- Roles: `owner` (todo), `admin` (productos, pedidos, inventario), `operador` (pedidos).
- Cada host responde solo sus rutas; las cookies del panel nunca llegan a la API. CSP con hashes, HSTS, `noindex`.

## Catálogo, pedidos y pagos

- **Productos** (bebidas y e-books): textos, fotos con punto de recorte, variantes con precio y stock, PDF privado del e-book. Los combos (six pack) se arman con los sabores elegibles.
- **Domicilio**: tarifa fija para todo el Quindío y municipios activos (los 12 del departamento). No se aceptan entregas fuera del Quindío. Mientras no tenga precio, las bebidas no se pueden pagar en línea.
- **Inventario**: el stock se aparta al iniciar el pago y vuelve solo si el pago falla o vence (60 min; 48 h si está en proceso, como PSE). Cada movimiento queda registrado.
- **Pedidos**: estado del pago, entrega (por preparar → preparando → en camino → entregado), notas, cancelación, reembolso total y reenvío de e-books.
- **Pagos**: Mercado Pago Checkout Pro con la API de Orders. El total lo calcula el servidor; el webhook solo avisa y el estado se confirma con `GET /v1/orders/{id}`. Una tarea cada 5 min vence reservas, concilia pagos en proceso y reintenta correos.
- **E-books**: al pagar llega un correo con un enlace por libro (5 descargas, 7 días) que redirige a una URL firmada del bucket de 2 minutos.
- **Publicar en la web**: los cambios de catálogo se ven en la web al usar el botón (dispara un build de Vercel). El stock se consulta en vivo.

### Activar Mercado Pago (cuando estén las llaves)

1. En [Tus integraciones](https://www.mercadopago.com.co/developers/panel/app) crea la aplicación (Checkout Pro, API de Orders).
2. Railway → variables: `MP_ACCESS_TOKEN` (empieza con `APP_USR-`; primero las de prueba).
3. Webhooks → URL `https://api.<dominio>/api/webhooks/mercadopago`, evento **Order**. Copia la *clave secreta* a `MP_WEBHOOK_SECRET`.
4. Prueba con usuarios y tarjetas de prueba de Colombia (titular `APRO` aprobado, `OTHE` rechazado, `CONT` pendiente).
5. En Vercel: `BLEND_API_URL=https://api.<dominio>` y `BLEND_CHECKOUT=on`, y vuelve a desplegar.

## Despliegue en Railway

1. Proyecto nuevo con **Postgres** y un servicio desde este repo:
   - Root Directory: `/backend`
   - Config file: `/backend/railway.json`
2. Variables del servicio:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (red privada) |
   | `ADMIN_ORIGIN` | `https://admin.<dominio>` |
   | `API_ORIGIN` | `https://api.<dominio>` |
   | `SITE_ORIGIN` | `https://<dominio>` |
   | `BETTER_AUTH_SECRET` | 32+ bytes aleatorios |
   | `HOST` | `0.0.0.0` |
   | `RESEND_API_KEY`, `MAIL_FROM` | De Resend |
   | `ORDERS_NOTIFY_EMAIL` | Correo que recibe cada pedido pagado |
   | `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Referencias al Bucket de Railway |
   | `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` | De Mercado Pago (al final) |
   | `VERCEL_DEPLOY_HOOK_URL` | Deploy Hook del proyecto en Vercel |

3. Dominios propios `admin.<dominio>` y `api.<dominio>` en el servicio (CNAME en el DNS).
4. En Postgres: sin dominio público y con backups activados.
5. Primer owner: `railway ssh` en el servicio y luego `npm run create-owner -- --email … --name "…"`.
6. Catálogo inicial: `npm run seed:catalog` lee los Markdown y las fotos de la web (`../src`), que no viajan al servicio. Se corre una vez desde tu máquina con `DATABASE_URL` y las variables `S3_*` de Railway (activando un rato el TCP Proxy de Postgres), o se cargan los productos a mano desde el panel.
7. En Vercel: variable `BLEND_API_URL=https://api.<dominio>` para que la web lea el catálogo del panel.

Las migraciones corren solas antes de cada despliegue (`preDeployCommand`).
