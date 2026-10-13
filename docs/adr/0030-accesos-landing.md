# ADR-0030 - Accesos desde la landing al control plane y a la app tenant

Estado: aceptado (2026-10-12, evidencia: `src/data/business.ts:299`). Fecha: 2026-10-11. Fuente: auditoría panel 3 workers vs `consultoria/web`, `consultoria/modoops_admin`, `consultoria/docs/modoops-control-plane-spec.md`; PRD-LP-03, PRD-AU-02. Restringido por ADR-0010, ADR-0011, ADR-0022, ADR-0031, `docs/02-identidad-onboarding/autenticacion.md`.

## Decisión

La landing expone dos accesos que pasan por login Google OIDC (sin password local):

- `Mi comercio` → `GET /api/auth/login?next=/panel` (kiosquero/tenant).
- `Admin` → `GET /api/auth/login?next=/admin` (superadmin, control plane).

El callback redirige al `next` validado; si el `google_sub` está en la allowlist admin y no hay `next` explícito, termina en `/admin`. Variable canónica del panel: `ADMIN_ALLOWLIST_SUBS` (por `google_sub`, nunca email), documentada en `.env.example`.

## Qué se adopta de ModoOps

De `modoops_core/views/login_templates.xml:79-80`: preservar el destino en el login vía parámetro (`redirect` allá, `next` acá). De `mo_app_tile.py:318-338`: el destino post-login distingue admin de operativo (allá por DB + `action_id`; acá por allowlist + `next`, sin callback que adivine por rol solo). De `ir.model.access.csv:2`: el corte admin es explícito y único; acá el corte único es `exigirAdmin` (`src/pages/api/admin/_guard.ts:21-33`).

## Qué cambia

- ADR-0022 E10 (nav sin `/panel`/`/venta`) se acota, no se rompe: el `nav` de anclas sigue intacto (SEO, solo `/` indexable); los accesos son CTAs a `/api/auth/login` (ruta API, no indexable), así E10 y E4 (`noindex` en `/panel`, `/venta`, `/admin`) siguen vigentes.
- `login.ts` acepta `next` con allowlist de paths locales (`startsWith("/")`, sin `//` ni `http`), espejando el guard de `continuar` de `reauth.ts:37`. `pendingAuth` suma campo `destino` (`store.ts:361`); `callback.ts:177` deja de ser hardcodeado.
- `ADMIN_ALLOWLIST_SUBS` pasa a `.env.example` con formato y nota de rotación separada de `SUPERADMIN_SUBS` (intención ya declarada en `guard.ts:3-4`). `SUPERADMIN_SUBS` queda para el legacy (`tenants.ts:24`, `admin/onboarding/embudo.ts:13`) hasta su migración a `exigirAdmin` (PRD-AU-02).
- `alta/estado.astro:46` (`Entrar a mi comercio` con `href="/"`) apunta a `/panel`.

## Alternativas descartadas

- Links directos a `/admin` y `/panel` sin login: se descarta porque ambas páginas son públicas y sus APIs devuelven 403 sin contexto; el usuario llega a una pantalla con badges `demo` o `Sin permiso` sin saber qué hacer. El login primero da sesión y destino correcto en un paso.
- Password local para tenants: se descarta porque `docs/02-identidad-onboarding/autenticacion.md:11` fija identidad única Google OIDC, sin password local. Las "credenciales de su cuenta" son su cuenta de Google vinculada al membership.
- Reutilizar `SUPERADMIN_SUBS` para el panel: se descarta porque `guard.ts:3-4` exige rotación separada; mezclarlas impide rotar el acceso plataforma sin tocar tenants.

## Contrato business.ts (tipado, única fuente)

```ts
export interface Acceso { label: string; href: string; }
export interface Accesos { comercio: Acceso; admin: Acceso; }
export const accesos: Accesos = {
  comercio: { label: "Mi comercio", href: "/api/auth/login?next=/panel" },
  admin: { label: "Admin", href: "/api/auth/login?next=/admin" },
};
```

Reglas: ningún componente hardcodea labels ni destinos de acceso; `Button` siempre renderiza `<a>` (ADR-0010); los `href` de acceso nunca entran al `nav` de anclas.

## Contratos API

- `GET /api/auth/login?next=/panel|/admin` (opcional; sin `next` o inválido se ignora y vale el defecto actual). `next` válido = path local absoluto.
- `GET /api/auth/callback` mantiene su contrato y solo cambia el destino del 302: `next` validado → allowlist admin sin `next` → `/admin` → defecto actual (`tenantId ? "/" : "/?alta=pendiente"`).

## Eventos

Sin eventos nuevos. Los actos de admin siguen auditados por `exigirAdmin`/`auditar` (`_guard.ts:35-59`); el login fallido por `next` inválido no audita (se ignora silenciosamente como query desconocida).

## Errores E1-E4

- E1 `next` con URL absoluta, `//` o path fuera de allowlist: se ignora, sigue el defecto; nunca redirect abierto.
- E2 sesión ausente en `/admin` o `/panel`: las páginas muestran su estado actual (`Sin permiso` / demo); el acceso arranca en el login, no en deep-link.
- E3 `ADMIN_ALLOWLIST_SUBS` vacía: todo `/api/admin/*` 403 (comportamiento actual `_guard.ts:24-31`); el botón Admin lleva al login igual, el guard niega después con mensaje.
- E4 copy de accesos fuera de `business.ts`: se rechaza en revisión, fuente única obligatoria.

## Fuera de corte

Protección de páginas con redirect (`middleware.ts` redirigiendo `GET /admin` sin sesión), PIN de mostrador como acceso, migración de `tenants.ts`/`embudo.ts` a `exigirAdmin` (queda como historia PRD-AU-02), impersonación y drill-down (prohibidos por ADR-0011).
