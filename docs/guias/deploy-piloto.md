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
  How-to para poner en producción el corte piloto (login Google HTTPS, Postgres,
  Vercel, altas reales y recorrido de mostrador). El camino multi de dos bases
  quedó obsoleto como runbook piloto (ADR-0116). No despliega por vos.
---
# Cómo desplegar el piloto (1–2 comercios)

> **Obsolescencia (ADR-0116).** El cuerpo de abajo todavía describe `TENANT_MODE=multi` y dos proyectos Supabase (`piloto1` / `piloto2`, P1-68). Ese runbook **ya no es el camino piloto**. El destino es una Postgres compartida con `tenant_id` y `TENANT_MODE=shared`. La reescritura completa de esta guía llega en el PR C4 del plan. No crees un segundo proyecto Free solo para aislar dos comercios.

Goal: un host HTTPS donde cada dueño entra con Google, da de alta su comercio, carga stock y vende con carrito online u offline.

Inventario de variables: [destrabe-credenciales.md](destrabe-credenciales.md) y `npm run credenciales`. Postgres: [migracion-supabase.md](../migracion-supabase.md). Verificación local sin Google: skill `control-app`.

Fuera de este corte: factura ARCA, bot WhatsApp, OCR real, Mercado Pago automático, alertas Resend. La app no ejecuta `CREATE DATABASE`.

## 0. Precondiciones

1. Confirmá que `main` ya trae el carrito (P1-56) y el alta multi (P1-68).
2. Tené a mano el dominio HTTPS del deploy (ejemplo `https://tu-app.vercel.app`). Las cookies de sesión usan el prefijo `__Host-` con `Secure`. Sin HTTPS el login no cierra.
3. No uses solo el botón de laboratorio “2 comercios piloto”. El segundo comercio lleva `owner_google_sub: "piloto-basico-t2"` y no puede loguearse. Cada dueño real entra con Google y hace su propia alta.
4. El Free de Supabase deja 2 proyectos activos. Dos comercios aislados usan esos dos cupos.

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

## 2. Postgres: control + una base por comercio

Aislamiento = 1 Postgres de negocio por comercio (ADR-0003). Single con una sola URL mezcla stock y ventas.

1. Creá **dos** proyectos Supabase Free en `ca-central-1` (proyecto A y proyecto B). Seguí [migracion-supabase.md](../migracion-supabase.md) para el Session pooler `:5432`.
2. Elegí dos ids **sin guiones** (Vercel no acepta `-` en el nombre de la variable). Convención del corte:

   - `piloto1` → proyecto A (también hospeda el plano control)
   - `piloto2` → proyecto B

3. Migrá **cada** proyecto con la URL del Session pooler de ese proyecto:

   ```bash
   TENANT_DATABASE_URL='postgresql://postgres.<refA>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require' npm run db:migrate
   TENANT_DATABASE_URL='postgresql://postgres.<refB>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require' npm run db:migrate
   ```

   Nunca migres por Transaction pooler (`:6543`). El journal crea tablas de control y de negocio en la misma base; en B las de control quedan vacías y no se usan.

4. En Vercel Production cargá:

   ```env
   TENANT_MODE=multi
   CONTROL_DATABASE_URL=postgresql://postgres.<refA>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require
   TENANT_DATABASE_URL_piloto1=postgresql://postgres.<refA>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require
   TENANT_DATABASE_URL_piloto2=postgresql://postgres.<refB>:<PASSWORD>@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```

   No hace falta `TENANT_DATABASE_URL` compartida en multi. Redeploy después de cargar las vars: el proceso solo ve lo que había al arrancar.

5. En Supabase → Table Editor de cada proyecto tienen que aparecer tablas de negocio (`sales`, `outbox`, `cash_movements`, …) y `drizzle.__drizzle_migrations`.

Comprobación rápida (reemplazá la URL):

```bash
node -e "const p=require('postgres');const s=p(process.env.TENANT_DATABASE_URL_piloto1,{ssl:'require'});s\`select now()\`.then(r=>{console.log(r);return s.end()})"
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
   - `tieneDb: true` (en multi: control + al menos una `TENANT_DATABASE_URL_<id>`)
   - `tieneJobs: true`

Si algún flag queda en `false`, falta esa variable en el entorno de Production. No hace falta mirar valores: solo presencia.

## 5. Altas reales de dueños

1. Abrí `https://<tu-host>/api/auth/login` (o el botón de login de la landing).
2. Completá Google. Si no hay tenant, el callback deja `/?alta=pendiente` y la home redirige a `/alta`.
3. Completá el alta del comercio con ese Google. El alta reclama el primer id libre (`piloto1`, después `piloto2`). Si no queda cupo, responde 503 `sin_base_libre`.
4. Repetí con el segundo dueño en otra cuenta Google. Un mismo `google_sub` no puede crear dos comercios.
5. No dependas del seed admin “2 comercios piloto” para usuarios de campo.

Comprobación: cada dueño ve `/panel` con el nombre de su comercio y no ve productos ni ventas del otro.

## 6. Recorrido de mostrador

Hacé este camino una vez por comercio, en el host HTTPS:

1. Cargá ~20 productos (SKU o EAN) con precio y stock.
2. En `/venta`, armá un carrito de varias líneas y cobrá online. Tiene que aparecer la tarjeta de ticket.
3. Poné el dispositivo offline (DevTools → Offline), cobrá otra venta multiproducto y confirmá ticket provisorio.
4. Volvé online, sincronizá la cola y confirmá que el número provisorio pasa a definitivo cuando corresponde.
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
- Cobro de suscripción: a mano. El webhook MP del repo no valida el `x-signature` real.
- Sin `CREATE DATABASE` automático: cada comercio nuevo necesita una `TENANT_DATABASE_URL_<id>` cargada y redeploy.

## 8. Orden de fallo típico

| Síntoma | Qué mirar primero |
|---|---|
| Login vuelve con error de config | `GOOGLE_LOGIN_*` y redirect URI exacto HTTPS |
| Login “anda” pero no queda sesión | El host no es HTTPS, o falta cookie `Secure`/`__Host-` |
| `/api/health` con `tieneDb: false` | `CONTROL_DATABASE_URL` y al menos una `TENANT_DATABASE_URL_<id>` en Production |
| Alta 503 `sin_base_libre` | Falta un id libre o no redeployaste tras cargar las vars |
| 503 `base_no_disponible` en ventas | El id del tenant no coincide con el sufijo de la env, o la URL apunta mal |
| Admin 403 | `ADMIN_ALLOWLIST_SUBS` sin el `google_sub` de esa cuenta |
| Segundo comercio del botón piloto no entra | Esperado: usar alta real por Google |
| Dos dueños ven el mismo stock | Estás en single o las dos `TENANT_DATABASE_URL_*` apuntan a la misma URL |

Cuando este how-to esté corrido de punta a punta en un host real, pasá el frontmatter a `estado: aceptado` y anotá fecha y host (sin secretos) en el avance del ítem.
