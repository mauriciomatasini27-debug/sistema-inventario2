---
id: PRD-AU-02
tipo: prd
estado: en curso
modulos: [admin, auth, tenant]
depende_de: [ADR-0030, ADR-0031, PRD-AU-01, PRD-LP-03]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: auditoría panel 3 workers sobre src/pages/api/auth/login.ts (sin next, solo invitationtoken + prompt),
  src/pages/api/auth/callback.ts:177 (redirect hardcodeado tenantId ?
---
# PRD-AU-02 - Login con destino: `next` y bifurcación admin/tenant (R2)

Fuente: auditoría panel 3 workers sobre `src/pages/api/auth/login.ts` (sin `next`, solo `invitation_token` + `prompt`), `src/pages/api/auth/callback.ts:177` (redirect hardcodeado `tenantId ? "/" : "/?alta=pendiente"`), `src/lib/store.ts:361` (`pendingAuth` sin destino), `src/modules/admin/guard.ts` + `_guard.ts` (allowlist `ADMIN_ALLOWLIST_SUBS` sin presencia en `.env`/`.env.example`), `src/pages/api/tenants.ts:24` y `admin/onboarding/embudo.ts:13` (usan `SUPERADMIN_SUBS` en vez de `exigirAdmin`). Patrón a copiar: `continuar` de reauth (`reauth.ts:27,37`, `store.ts:363`, `reauth/callback.ts:133`). Restringido por ADR-0030, ADR-0031, PRD-AU-01 (fix login, no solapar), `docs/02-identidad-onboarding/autenticacion.md` (OIDC único, sin password).

> Estado al 2026-10-20: en curso. `next` se acepta y se valida, pero con una allowlist de tres valores (`/panel`, `/admin`, `/`) en vez de cualquier path local como pide AU2-S1. AU2-S2 a AU2-S5 están hechos; AU2-S6 (allowlist dual de `POST /api/tenants`) sigue pendiente.

## Épica AU2-E1. `next` en el login

Requisito AU2-1: `GET /api/auth/login` preserva el destino pedido con el mismo cuidado que `continuar` de reauth.

- Historia AU2-S1. Aceptar `?next=` en `login.ts` con allowlist de paths locales: `startsWith("/")`, sin `//`, sin esquema/host; inválido se ignora (vale el defecto actual). AC: Given pido `GET /api/auth/login?next=/panel` When leo el estado guardado Then el destino es `/panel`; Given pido `?next=https://evil.example` When leo el estado Then no hay destino (defecto actual). ADR: 0030. Talla S. Depende de: nada.
- Historia AU2-S2. Campo `destino/next?: string` en `pendingAuth` (`store.ts:361`), set en `login.ts:32`, con la misma expiración de PRD-AU-01. AC: Given genero un state con `next=/admin` When leo `pendingAuth` Then el destino está y expira con el state. ADR: 0030. Talla S. Depende de: AU2-S1.

## Épica AU2-E2. Callback con bifurcación

Requisito AU2-2: tras autenticar, cada uno termina en su pantalla (kiosquero → `/panel`, superadmin → `/admin`).

- Historia AU2-S3. `callback.ts` consume el destino: si hay `next` validado redirige ahí; si no, y el `google_sub` está en la allowlist admin (`esAdminAllowlist`), redirige a `/admin`; si no, defecto actual intacto (`tenantId ? "/" : "/?alta=pendiente"`). AC: Given login con `next=/panel` como tenant When completa el callback Then 302 a `/panel`; Given login sin `next` como sub en allowlist When completa Then 302 a `/admin`; Given login sin `next` como tenant común Then 302 al defecto actual. ADR: 0030. Talla M. Depende de: AU2-S2.
- Historia AU2-S4. Sin guard open-redirect: ningún `next` llega al `redirect` sin pasar la validación de AU2-S1 (test con `//evil`, `https:`, `/\evil`). AC: Given completo logins con `next` hostil When reviso los 302 Then ninguno apunta fuera del origen. ADR: 0030. Talla S. Depende de: AU2-S3.

## Épica AU2-E3. Allowlist admin documentada y alineada

Requisito AU2-3: `ADMIN_ALLOWLIST_SUBS` deja de ser una variable fantasma.

- Historia AU2-S5. `ADMIN_ALLOWLIST_SUBS=` en `.env.example` con comentario (subs de Google separados por coma, por `google_sub` nunca email, rotación separada de `SUPERADMIN_SUBS`). AC: Given leo `.env.example` When busco `ADMIN_ALLOWLIST_SUBS` Then existe documentada junto a `SUPERADMIN_SUBS`. ADR: 0030. Talla XS. Depende de: nada.
- Historia AU2-S6. Decidir el dual `SUPERADMIN_SUBS` vs `ADMIN_ALLOWLIST_SUBS`: migrar `tenants.ts:24` y `admin/onboarding/embudo.ts:13` a `exigirAdmin`, o justificar la doble allowlist en `guard.ts` + `docs/08-operacion-admin-analytics/panel-admin-parte-1.md`. AC: Given audito las rutas `/api/admin/*` When listo sus guards Then todas usan `exigirAdmin` o el documento explica la excepción. ADR: 0030, 0011. Talla S. Depende de: AU2-S5.
- Historia AU2-S7. Test con `ADMIN_ALLOWLIST_SUBS` (hoy `auth-onboarding.test.ts:86` solo setea `SUPERADMIN_SUBS`): cubrir `exigirAdmin` 200/403 por `google_sub`. AC: Given seteo la allowlist con un sub When llamo al guard con ese sub y con otro Then el primero pasa y el segundo 403 auditado. ADR: 0030. Talla S. Depende de: AU2-S5.

## Dependencias externas

AU2-S2 espera a AU2-S1. AU2-S3 espera a AU2-S2. AU2-S4 espera a AU2-S3. AU2-S6 y AU2-S7 esperan a AU2-S5. PRD-LP-03 (botones) espera a AU2-E1+E2; sin este PRD los botones llegan al destino equivocado. No solapa PRD-AU-01 (cookies/expiración): lo usa como base.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Tenant a su panel | Login `?next=/panel` | 302 a `/panel` con sesión válida |
| Feliz | Admin a control plane | Login `?next=/admin` + sub en allowlist | 302 a `/admin`, APIs admin 200 |
| Feliz | Admin sin next | Login sin `next` + sub en allowlist | 302 a `/admin` |
| Fallo | `next` hostil | `?next=https://evil.example` o `//evil` | Se ignora, vale el defecto; ningún 302 externo |
| Fallo | No admin a `/admin` | Login `?next=/admin` sin allowlist | 302 a `/admin` igual, pero APIs 403 `No tenés permiso` (el corte es el guard, no el redirect) |
| Regresión | Defecto intacto | Login sin `next`, tenant común | `tenantId ? "/" : "/?alta=pendiente"` como hoy |

Arch-tests: AT1 ningún `redirect(` en `callback.ts` recibe string derivado de query sin pasar la validación (test estático o casos `//`, `https:`, `/\`). AT2 `pendingAuth` siempre con expiración (heredado PRD-AU-01). AT3 toda ruta bajo `/api/admin/` usa `exigirAdmin` salvo excepción documentada (tras AU2-S6).
