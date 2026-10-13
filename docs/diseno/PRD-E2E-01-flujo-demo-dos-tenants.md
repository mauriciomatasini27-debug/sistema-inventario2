# PRD-E2E-01 - Flujo demo con dos tenants: kiosco del dueño y almacén de ejemplo

Fuente: auditoría e2e 2026-10-12 sobre `src/pages/api/onboarding/alta.ts:24` (alta pide sesión, plan demo, 1 comercio por usuario), `src/pages/api/tenants.ts:21-26` (alta admin pide superadmin), `src/lib/control.ts:49-55` (`esSuperadmin` por allowlist), `src/modules/tenants/aprovisionar.ts:74-75` (`decidirAlta` reusa si el dueño ya tiene comercio), `src/lib/env.ts` (fallback `import.meta.env` en dev), `tests/e2e/venta.spec.ts:6` (e2e sin login real). Restringido por ADR-0001, ADR-0030, ADR-0031, `docs/02-identidad-onboarding/autenticacion.md` (OIDC único, sin password).

## Épica E2E-E1. Andamio de entorno en dev

Requisito E2E-1: el dev lee el `.env` también por `process.env`.

- Historia E2E-S1. `src/lib/env.ts` con `leerVarEntorno`: prefiere `process.env`, fallback a `import.meta.env`. AC: Given `.env` con claves y entorno vacío When leo la var Then vuelve la del `.env`; Given var en entorno real When leo Then gana la del entorno. ADR: 0001. Talla XS. Depende de: nada.
- Historia E2E-S2. `leerConfigLogin` y `esSuperadmin` usan `leerVarEntorno`. AC: Given dev sin vars de entorno When pido `GET /api/auth/login` con `.env` completo Then 302 a Google; Given `SUPERADMIN_SUBS` solo en `.env` When chequeo al dueño Then pasa. ADR: 0030. Talla XS. Depende de: E2E-S1.

## Épica E2E-E2. Tenant kiosco del dueño

Requisito E2E-2: el dueño crea su comercio por autoservicio tras el login.

- Historia E2E-S3. `POST /api/onboarding/alta` con sesión `{nombre_comercio: "Kiosco Lo de Mauri", rubro: "kiosco", request_key: "demo-e2e-t1"}`. AC: Given sesión válida sin comercio When doy de alta Then 201 con `tenant_id`, estado `activo` y membership `dueno`; Given reintento con misma key Then 409 con el mismo `tenant_id`. ADR: 0001. Talla S. Depende de: E2E-E1.

## Épica E2E-E3. Tenant almacén de ejemplo

Requisito E2E-3: el segundo comercio nace por vía admin con dueño demo.

- Historia E2E-S4. `POST /api/tenants` como superadmin `{nombre_comercio: "Almacén Don Pepe", plan: "demo", moneda: "ARS", owner_google_sub: "demo-almacen-01", request_key: "demo-e2e-t2"}`. AC: Given sesión superadmin When creo Then 201 con `membership_dueno` rol `dueno`; Given sesión común When creo Then 403. ADR: 0001. Talla S. Depende de: E2E-E1.
- Historia E2E-S5. Endpoint temporal `GET /api/demo/quien-soy` que devuelve el `googleSub` propio, se usa una vez y se borra. AC: Given existe el archivo When pido con sesión Then 200 con el sub; Given borrado Then 404. ADR: 0001. Talla XS. Depende de: nada.

## Épica E2E-E4. Verificación punta a punta

Requisito E2E-4: landing, login y kiosco responden para los dos tenants.

- Historia E2E-S6. Script `scripts/demo-dos-tenants.mjs` idempotente que crea ambos y chequea. AC: Given dev limpio y sesión válida When corro dos veces Then ambas corren 201 la primera y 409 reusando la segunda, sin duplicar. ADR: 0001. Talla S. Depende de: E2E-S3, E2E-S4.

## Dependencias externas

E2E-S2 espera a E2E-S1. E2E-S6 espera a E2E-S3 y E2E-S4. E2E-S5 no bloquea a nadie. Sin segundo usuario Google: el tenant almacén usa dueño demo y no hace login. Sin este PRD no hay forma documentada de poblar dos tenants en dev.

## Fuera de corte

Vincular WhatsApp, invitación y login de empleado, UI nueva, ADR nuevo, persistencia en Postgres más allá del best-effort actual.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Alta kiosco | `POST /api/onboarding/alta` demo | 201, `activo`, membership `dueno` |
| Feliz | Alta almacén | `POST /api/tenants` superadmin | 201, `membership_dueno` presente |
| Feliz | Login dueño | `/api/auth/login?next=/panel` | 302 Google, luego `sesion-actual` `logueado:true` |
| Feliz | Kiosco loop | `/`, `/panel`, `/venta`, `/api/sales` | 200, 200, 200, 201 |
| Fallo | Segundo comercio mismo dueño | alta dos veces | 409 reusando `tenant_id` |
| Fallo | Alta admin sin permiso | `POST /api/tenants` común | 403 |
| Regresión | `tsc` y e2e venta | `npx tsc --noEmit`, `playwright test venta` | Sin errores nuevos, spec verde |
