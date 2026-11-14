---
id: GUIA-DEPLOY-PILOTO
tipo: spec
estado: propuesto
modulos: [auth, onboarding]
depende_de: [ADR-0003, ADR-0017, ADR-0048, ADR-0049, ADR-0116]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  How-to para poner en producción el corte piloto (login Google HTTPS, TENANT_MODE=shared,
  una Postgres, Vercel, altas reales y recorrido de mostrador). No despliega por vos.
---
# Cómo desplegar el piloto (1–2 comercios)

Goal: un host HTTPS donde cada dueño entra con Google, da de alta su comercio, carga stock y vende con carrito online u offline. Dos comercios comparten **una** Postgres y se aíslan por `tenant_id` (`TENANT_MODE=shared`, ADR-0116).

Inventario de variables: [destrabe-credenciales.md](destrabe-credenciales.md) y `npm run credenciales`. Postgres: [migracion-supabase.md](../migracion-supabase.md). Verificación local sin Google: skill `control-app`.

Fuera de este corte: factura ARCA, bot WhatsApp, OCR real, Mercado Pago automático, alertas Resend. La app no ejecuta `CREATE DATABASE`.

El runbook P1-68 (`TENANT_MODE=multi` + `TENANT_DATABASE_URL_piloto1/2`) quedó histórico. No creés un segundo proyecto Free solo para aislar dos comercios.

## 0. Precondiciones

1. Confirmá que `main` trae el carrito (P1-56), ADR-0116 aceptado (C0–C6 en código) y las migraciones `0042_proveedores_durable` y `0043_shared_tenant_nucleo` aplicadas en la base del piloto (registro 2026-11-14, confirmación de Mauri). Las tablas solo en schema (`platform_feedback_reports`, `inventory_counts`, `fiscal_customers`, `product_flags`, `report_exports`) siguen sin `CREATE` en `drizzle/*.sql`; ver propuesta de tag `0044_*` en [aud-piloto-modoops-2026-11-14.md](aud-piloto-modoops-2026-11-14.md).
2. Tené a mano el dominio HTTPS del deploy (ejemplo `https://tu-app.vercel.app`). Las cookies de sesión usan el prefijo `__Host-` con `Secure`. Sin HTTPS el login no cierra.
3. No uses solo el botón de laboratorio “2 comercios piloto”. El segundo comercio lleva `owner_google_sub: "piloto-basico-t2"` y no puede loguearse. Cada dueño real entra con Google y hace su propia alta.
4. Un proyecto Supabase Free alcanza para control + negocio de todos los comercios del piloto.

## 1. Google Login en producción

1. En Google Cloud Console, abrí la app OAuth de login (solo scopes `openid email profile`).
2. En Authorized redirect URIs agregá exactamente:
   `https://<tu-host>/api/auth/callback`
3. Copiá client id y secret.
4. Definí estas tres variables (local `.env` o panel de Vercel):

   ```env
   GOOGLE_LOGIN_CLIENT_ID=...
   GOOGLE_LOGIN_CLIENT_SECRET=...
   GOOGLE_LOGIN_REDIRECT=https://<tu-host>/api/auth/callback
   ```

5. Dejá vacías las de Gmail/Photos/Meta/ARCA/OCR. El piloto no las necesita.

Comprobación: `npm run credenciales` marca “Google login: presente”.

## 2. Postgres: una base compartida

Aislamiento = filas con `tenant_id` + sesión (ADR-0116). No hace falta una URL por comercio.

1. Creá **un** proyecto Supabase Free en `ca-central-1`. Seguí [migracion-supabase.md](../migracion-supabase.md) para el Session pooler `:5432`.
2. Migrá con la URL del Session pooler:

   ```bash
   TENANT_DATABASE_URL='postgresql://postgres.<ref>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require' npm run db:migrate
   ```

   Nunca migres por Transaction pooler (`:6543`). El journal aplica control + negocio en la misma base, incluidas `0042` y `0043` (`tenant_id` nullable en el núcleo). Usá `npm run db:migrate` (P1-69): saltea statements cuya tabla no existe (p. ej. `inventory_counts` si aún no hay `0044`); no uses `db:migrate:kit` crudo en una base sin todas las tablas del schema.

3. En Vercel Production cargá:

   ```env
   TENANT_MODE=shared
   CONTROL_DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require
   TENANT_DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```

   `CONTROL` y `TENANT` pueden ser la misma URL (ADR-0048). No cargues `TENANT_DATABASE_URL_piloto1` salvo que quieras el camino multi histórico. Redeploy después de cargar las vars.

4. En Supabase → Table Editor tienen que aparecer tablas de negocio (`sales`, `outbox`, `products`, …), columna `tenant_id` en el núcleo, y `drizzle.__drizzle_migrations`.

Comprobación rápida:

```bash
node -e "const p=require('postgres');const s=p(process.env.TENANT_DATABASE_URL,{ssl:'require'});s\`select now()\`.then(r=>{console.log(r);return s.end()})"
```

## 3. Secretos mínimos del host

Además de Google y las URLs de Postgres, cargá:

| Variable | Para qué |
|---|---|
| `JOBS_SECRET` | Jobs del middleware como Sistema; flag `tieneJobs` en `/api/health` |
| `ADMIN_ALLOWLIST_SUBS` | Subs de Google (nunca email) que entran a `/admin` y `POST /api/tenants` |
| `PUBLIC_SITE_URL` | Origen canónico del sitio (Astro `site`) |
| `SESSION_TTL_HOURS` | Opcional; default 720 |

Generá `JOBS_SECRET` con un valor largo al azar. Después del primer login propio, leé el `google_sub` desde la UI admin o desde `/api/auth/sesion-actual` y copialo a `ADMIN_ALLOWLIST_SUBS` si necesitás panel admin.

No hace falta `MP_WEBHOOK_SECRET`, `RESEND_API_KEY`, `WHATSAPP_*`, `ARCA_*` ni `OCR_PADDLE_ENDPOINT` para el mostrador.

## 4. Deploy en Vercel

El repo ya usa `@astrojs/vercel` en `astro.config.mjs` con `output: "server"`.

1. Creá el proyecto Vercel apuntando a este repo y a la rama `main`.
2. En Environment Variables (Production) cargá las variables de los pasos 1–3. Marcá Production.
3. Si el host definitivo no es el preview de Vercel, actualizá `GOOGLE_LOGIN_REDIRECT` y el redirect URI de Google al dominio final **antes** de probar el login.
4. Dispará un deploy. Esperá el build verde.
5. Abrí `https://<tu-host>/api/health`. Tiene que responder JSON con `ok: true` y:

   - `tieneGoogle: true`
   - `tieneDb: true` (en shared: `CONTROL_DATABASE_URL` + `TENANT_DATABASE_URL`)
   - `tieneJobs: true`

Si algún flag queda en `false`, falta esa variable en el entorno de Production. No hace falta mirar valores: solo presencia.

## 5. Altas reales de dueños

1. Abrí `https://<tu-host>/api/auth/login` (o el botón de login de la landing).
2. Completá Google. Si no hay tenant, el callback deja `/?alta=pendiente` y la home redirige a `/alta`.
3. Completá el alta del comercio. En shared el id es un UUID nuevo (no hay cupo `sin_base_libre`).
4. Repetí con el segundo dueño en otra cuenta Google. Un mismo `google_sub` no puede crear dos comercios.
5. No dependas del seed admin “2 comercios piloto” para usuarios de campo.

Comprobación: cada dueño ve `/panel` con el nombre de su comercio y no ve productos ni ventas del otro (mismo SKU permitido en ambos).

## 6. Recorrido de mostrador

Hacé este camino una vez por comercio, en el host HTTPS:

1. Cargá ~20 productos (SKU o EAN) con precio y stock.
2. En `/venta`, armá un carrito de varias líneas y cobrá online. Tiene que aparecer la tarjeta de ticket.
3. Poné el dispositivo offline (DevTools → Offline), cobrá otra venta multiproducto y confirmá ticket provisorio.
4. Volvé online, sincronizá la cola y confirmá que el provisorio pasa a un `T-*`. Promote completa `tickets.definitivo` con ese número. El provisorio sigue buscable por el mismo ticket.
5. En `/panel/caja`, cerrá o conciliá la jornada según el flujo vigente.
6. Si algo de la cola falla al sync, revisá ventas pendientes; no borres la outbox a mano.

Atajo local sin Google (laboratorio, no piloto real):

```bash
node scripts/control-app/control-app.mjs levantar
node scripts/control-app/control-app.mjs seed
node scripts/control-app/control-app.mjs login --rol duenio
node scripts/control-app/control-app.mjs ir /panel
node scripts/control-app/control-app.mjs login --rol empleado
node scripts/control-app/control-app.mjs ir /venta
node scripts/control-app/control-app.mjs apagar
```

`control-app` limpia URLs de producción a propósito. No lo apuntes al Postgres de Supabase ni al deploy Vercel.

## 7. Límites a decirle al piloto

- Sin factura electrónica.
- Sin bot WhatsApp ni alertas de email reales.
- Offline fuerte en **venta**. No prometas caja, stock ni carga de mercadería offline completa.
- FEFO en el cobro es agregado sobre stock visible, no descuento fila a fila de `stock_lots`.
- Mercado Pago QR: registrá el medio a mano. No hay conciliación automática del webhook.
- Cobro de suscripción: requiere `MP_WEBHOOK_SECRET` en producción; el webhook valida `x-signature` (manifest oficial `id` / `request-id` / `ts`, `ts` en segundos). **No** configures `MP_WEBHOOK_ALLOW_TEST` en producción ni en Vercel Production (solo laboratorio local junto con `x-test: true` y sin secreto).
- `tenant_id` en el núcleo aún es nullable (C1). El cierre `NOT NULL` + uniques compuestos es trabajo posterior. Catálogo/stock/sync de venta filtran en shared (C3); precios, lotes, importaciones, stock inicial, OCR y tablas de pricing sin columna `tenant_id` aún mezclan filas si dos tenants usan la misma base (ver [aud-piloto-modoops-2026-11-14.md](aud-piloto-modoops-2026-11-14.md)).
- El rubro elegido en `/alta` no persiste en `tenants` (solo módulos/ubicaciones sembradas; issue #93).
- Canal Problemas/sugerencias (TB-164) requiere `platform_feedback_reports` en Postgres control; sin migración `CREATE` la API responde 503 en serverless.

## 8. Orden de fallo típico

| Síntoma | Qué mirar primero |
|---|---|
| Login vuelve con error de config | `GOOGLE_LOGIN_*` y redirect URI exacto HTTPS |
| Login “anda” pero no queda sesión | El host no es HTTPS, o falta cookie `Secure`/`__Host-` |
| `/api/health` con `tieneDb: false` | `CONTROL_DATABASE_URL` y `TENANT_DATABASE_URL` en Production |
| Alta 503 `sin_base_libre` | Estás en `multi` sin cupo de URLs; en shared no aplica |
| 503 `base_no_disponible` en ventas | Falta `TENANT_DATABASE_URL` o el proceso no redeployó |
| Admin 403 | `ADMIN_ALLOWLIST_SUBS` sin el `google_sub` de esa cuenta |
| Segundo comercio del botón piloto no entra | Esperado: usar alta real por Google |
| Dos dueños ven el mismo stock | `TENANT_MODE` no es `shared`, o una query sin filtro `tenant_id` |

Cuando este how-to esté corrido de punta a punta en un host real, pasá el frontmatter a `estado: aceptado` y anotá fecha y host (sin secretos) en el avance del ítem.
