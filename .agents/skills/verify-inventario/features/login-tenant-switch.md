# Login y cambio multi-tenant

Auth lets a member sign in with Google, see who is attending, switch accounts on a shared PC, and reach the tenant panel they belong to.

## Sub-features

- `login-google` starts OAuth at `/api/auth/login` and lands on `/panel` (`Hola`).
- `login-sesion` exposes `GET /api/auth/sesion-actual` (`logueado`, `etiqueta`, `cambiar_usuario_url`).
- `login-switch` changes user via `/api/auth/cambiar-usuario` or `login?prompt=select_account`.
- `login-tenant` isolates tenants (`/api/tenants`, `/api/tenants/:id/memberships`, `sesiones?google_sub=`).

## How to get to it (user POV)

- Open `/panel` unauthenticated -> login button to `/api/auth/login?next=/panel`.
- Topbar shows `Atendiendo: <nombre>` + `Cambiar de usuario`; `POST /api/auth/logout` exits.

## Driving it with Playwright

Preconditions:

- Doctor OK; `/panel` renders `h1.hello` when authed, login redirect when not.
- Placeholder OAuth names only; never read `.env` values.

- **Sesion actual.** `GET /api/auth/sesion-actual`. Unauthed: `{logueado:false}`; authed: `etiqueta` + `cambiar_usuario_url=/api/auth/login?prompt=select_account`.
- **Login.** Goto `/api/auth/login?next=/panel`, complete Google, expect `/panel` with `h1.hello` containing `Hola`.
- **Switch.** Call `POST /api/auth/cambiar-usuario`, follow `login_url`, sign in as second user, confirm new `etiqueta`.
- **Tenant isolate.** `GET /api/tenants/:id/sesiones?google_sub=<sub>` lists only that tenant's sessions; membership POST/PATCH needs `google_sub` + `rol`.
- **Proof.** Screenshot of `/panel` topbar + `sesion-actual` JSON to `artifacts/login-tenant-switch/`.

## Gotchas

- `next` allowlist is only `/panel /admin /`; other values fall back safely.
- Identity keys on `google_sub`, never email; allowlists (`SUPERADMIN_SUBS`, `ADMIN_ALLOWLIST_SUBS`) are sub-based.
- Shared-PC switch requires `prompt=select_account`, plain `/api/auth/login` may silently reuse the session.
- No seeded users in this skill; use the run's own two Google test identities.
