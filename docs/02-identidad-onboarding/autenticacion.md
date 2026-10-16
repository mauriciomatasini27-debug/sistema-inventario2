---
id: MOD-02-AUTENTICACION
tipo: spec
estado: propuesto
modulos: [auth, onboarding]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  Identidad única: cuenta de Google vía OIDC. No hay password local. Roles por comercio: dueno / empleado, con
  matriz cerrada de permisos.
---
# Autenticación y Gestión de Usuarios — referencia técnica

> Generado por auditoría de panel sobre el código (commits `0c920ec`, `d6d16eb`).
> El PRD original en `.docx` no está disponible en el disco; este documento
> describe lo que el código hace, no lo que el PRD pedía. Donde el código
> cita un AU, se indica. **AU14 no existe en el código**: queda pendiente
> contra el PRD. Fecha: 2026-10-11.

## 1. Modelo en una página

- Identidad única: cuenta de Google vía OIDC. No hay password local.
- Roles por comercio: `dueno` / `empleado`, con matriz cerrada de permisos.
- Sesión server-side: cookie `__Host-sesion` con ID plano aleatorio (256 bit);
  en base solo vive su hash SHA-256. Inactividad 30 días, absoluta 90 días.
- Acciones sensibles del Dueño exigen reautenticación Google reciente (10 min).
- Bot de WhatsApp vinculado por número (código de 6 dígitos), con roles
  leídos de la membership en cada mensaje, nunca copiados al vínculo.
- Auditoría append-only (`auth_events`), sin secretos, con vista por comercio.
- PIN de mostrador: bloqueo local por dispositivo, no sustituye OIDC.

## 2. Mapa AU → código

| AU | Tema | Dónde |
|----|------|-------|
| AU1 | Login OIDC + PKCE, sub estable | `modules/auth/oidc.ts`, `api/auth/login.ts`, `api/auth/callback.ts` |
| AU2.2 | ID token se valida y descarta | `oidc.ts:139` |
| AU3 | Scopes mínimos `openid email profile` | `oidc.ts:12` |
| AU4 | Matriz de permisos, defaults | `modules/auth/modelo.ts`, `lib/validation.ts` |
| AU5 | Aprovisionamiento (con onboarding) | `modules/tenants/aprovisionar.ts`, `jobs/aprovisionar.ts` |
| AU6 | Invitaciones (hash, cupo, genéricos) | `modules/tenants/invitaciones.ts`, `api/invitations/accept.ts` |
| AU7 | Revocación en cascada | `modules/tenants/invitaciones.ts:136`, `middleware.ts` |
| AU8 | Sesiones, throttle 1h, rotación | `modules/auth/sesiones.ts` |
| AU9 | Dispositivos, cierre remoto, nombrar | `modules/auth/dispositivos.ts`, `api/auth/sesiones.ts`, `api/tenants/[id]/sesiones.ts`, `api/devices/nombrar.ts` |
| AU10 | Reauth + acciones sensibles | `modules/auth/reautenticacion.ts`, `api/auth/reauth*.ts`, `lib/control.ts:84` |
| AU11 | Bot WhatsApp, vínculo, costos, avisos | `modules/auth/bot.ts`, `modules/whatsapp/*`, `api/whatsapp/*` |
| AU12 | Auditoría append-only, Actividad | `modules/auth/auditoria.ts`, `api/tenants/[id]/actividad.ts` |
| AU13 | Cambiar de usuario, `Atendiendo:` | `api/auth/cambiar-usuario.ts`, `api/auth/sesion-actual.ts` |
| AU14 | **Desconocido (no está en el código)** | — |
| P1-1 | Alertas WA de seguridad | `modules/auth/bot.ts:64`, `jobs/whatsapp-alertas-seguridad.ts`, `lib/alertas-seguridad.ts` |
| P1-2 | 2do canal email (fallback) | `modules/auth/segundo-canal.ts`, job + adaptador arriba |
| P1-3 | PIN de mostrador | `modules/auth/pin.ts`, `api/devices/{pin,bloquear,desbloquear}.ts`, `drizzle/0005*` |

## 3. Arquitectura: núcleo puro + adaptadores

Regla del lane: `src/modules/auth/*` y `src/modules/whatsapp/*` deciden
(sin IO, sin Drizzle, sin fetch, sin env). Las rutas (`src/pages/api/*`),
`src/lib/*` y `src/jobs/*` hacen IO. Consecuencias:

- El núcleo se prueba sin base ni red (74 tests auth en ~2 s).
- Los adaptadores son best-effort donde el fallo no puede romper el flujo
  (alertas, persistencia control) y estrictos donde sí (sesión, reauth).
- Fuente de verdad en monoproceso: `control` en memoria (`lib/store.ts`);
  Postgres es copia durable vía write-through que nunca lanza
  (`lib/control-db.ts:22`).

## 4. Rutas API

### Auth OIDC y sesión

| Método + ruta | Auth | Hace |
|---|---|---|
| `GET /api/auth/login` | no | state/nonce/PKCE + redirect a Google (`prompt=select_account` opcional) |
| `GET /api/auth/callback` | OIDC | canjea code, upsertea user, auto-acepta invitación/membership, crea sesión + cookie, audita `login` |
| `POST /api/auth/cambiar-usuario` | sesión | revoca actual, audita `cambio_usuario`, devuelve `login_url` con selector |
| `GET /api/auth/sesion-actual` | sesión | `Atendiendo: <nombre>` + ayuda cuentas para la barra superior |
| `POST /api/auth/logout` | sesión | revoca actual, borra cookie, audita `logout` |
| `GET /api/auth/sesiones` | sesión | mis sesiones activas (hash, dispositivo, última actividad) |
| `POST /api/auth/sesiones` | sesión | cierre propio (una o todas-menos-actual, 409 si ya cerrada) |
| `GET /api/auth/reauth` | sesión | inicia reauth (`prompt=select_account` + `login_hint`, expira 10 min) |
| `GET /api/auth/reauth/callback` | OIDC | valida mismo sub + nonce + iat<2min, rota sesión, redirige a `continuar` (solo path local) |

### Tenants e invitaciones (Dueño donde se indica)

| Método + ruta | Auth | Hace |
|---|---|---|
| `GET /api/tenants/:id/sesiones?google_sub=` | Dueño | sesiones activas de un miembro |
| `POST /api/tenants/:id/sesiones` | Dueño + reauth | cierre remoto (sin revocar acceso) + alerta `sesion_cerrada_remota` |
| `POST/PATCH /api/tenants/:id/memberships` | Dueño + reauth | alta directa / flag `puede_usar_bot` |
| `GET /api/tenants/:id/actividad` | Dueño (+ reauth para CSV) | eventos del comercio en texto legible o CSV |
| `POST /api/invitations/accept` | sesión Google | acepta invitación, rota sesión al tenant |

### WhatsApp / bot

| Método + ruta | Auth | Hace |
|---|---|---|
| `GET /api/whatsapp/webhook` | `verify_token` | verificación de suscripción Meta |
| `POST /api/whatsapp/webhook` | firma HMAC | `VINCULAR <6 dígitos>`, opt-in/out, consultas (costo solo Dueño, sensibles → web) |
| `POST /api/whatsapp/vincular-code` | miembro + flag bot | genera código (guarda hash, TTL 10 min, 409 si número ocupado) |
| `POST /api/whatsapp/desvincular` | titular o Dueño | revoca vínculo + alerta |

### Dispositivos y PIN (Dueño; desbloquear: miembro + PIN)

| Método + ruta | Auth | Hace |
|---|---|---|
| `POST /api/devices/nombrar` | Dueño + reauth | nombra `device_code` ("PC del mostrador") |
| `POST /api/devices/pin` | Dueño + reauth | define PIN (guarda solo hash scrypt) |
| `POST /api/devices/bloquear` | Dueño + reauth | marca bloqueo local (exige PIN previo) |
| `POST /api/devices/desbloquear` | miembro + PIN | verifica con rate-limit 5/5min, limpia fallos |

## 5. Modelo de datos

`src/db/schema.ts`: `users`, `tenants`, `tenant_databases`, `memberships`
(+`puede_usar_bot`), `invitations`, `sessions` (+`reauth_at`),
`auth_events`, `whatsapp_identities`, `devices`, `device_pins`.

Migraciones: `drizzle/0004_auth_append_only.sql` (`reauth_at`,
`puede_usar_bot`, `auth_events` append-only vía REVOKE + trigger);
`drizzle/0005_pin_mostrador.sql` (tabla `device_pins`, sin REVOKE:
mutable con `actualizado_en`).

## 6. Propiedades de seguridad (verificadas en código)

- PKCE S256 + state/nonce 128–256 bit; issuer allowlist + `aud` + `email_verified` + nonce (`oidc.ts:30`, `oidc.ts:97`).
- En base solo hashes: sesión SHA-256, invitación SHA-256, código vincular SHA-256, PIN scrypt+salt; comparaciones `timingSafeEqual`.
- Rotación de sesión en login/reauth/cambio de tenant; rolling con throttle 1h capado por absoluta.
- Reauth: ventana 10 min, mismo sub, nonce, `iat`<2 min, 5 fallos → bloqueo 5 min por sub.
- Cierre remoto no revoca membership; Dueño no auto-revocable; 403 genéricos que no revelan existencia.
- Bot: un número = un usuario; código 6 dígitos TTL 10 min + 5 intentos; firma Meta obligatoria; dedup wamid 24 h; tenant del número, nunca del mensaje; revocado = sin datos al siguiente mensaje.
- Alertas: solo a vinculados habilitados (titular + Dueño); textos y eventos enmascarados (`+…1234`, `j…@dominio`); fallo de canal nunca bloquea el flujo; idempotencia por `eventId` con claves independientes por canal.
- Auditoría: lista cerrada de tipos, subset de comercio, `sanitizarDetalle` elimina token/código/sesión/password/secret/verifier/nonce; CSV exige reauth.
- PIN: formato 4–6 dígitos, rate-limit por dispositivo, definir/bloquear exigen reauth, desbloquear no (el PIN es la prueba); el bloqueo es flag informativo, **ninguna ruta lo enforcea todavía**.

## 7. Tests

8 archivos `tests/auth-*.test.ts`, 74 tests: alertas-seguridad 10, auditoría 8,
reauth 7, dispositivos 8, cambio-usuario 4, bot 15, onboarding 16, pin 6.
Cobertura: núcleo puro + rutas contra `control` en memoria. No cubren:
verify/firma/dedup del webhook, persistencia opt-in, jobs matutino/resumen,
adaptador `lib/alertas-seguridad.ts`, ni `pendingAuth` expirado.

## 8. Deuda y pendientes honestos (salida del panel)

1. **AU14 sin fuente**: no existe en código ni docs; el `.docx` del PRD no está en disco.
2. **PIN sin enforcement**: `deviceLocks` es informativo; falta gate en middleware/ventas (P1b).
3. **Email real pendiente**: fallback usa Resend solo si hay `RESEND_API_KEY`; si no, no-op silencioso.
4. **`login.ts` no adjunta las cookies** de state/PKCE al redirect (código muerto aparente); `__Host-oauth-nonce` nunca se lee; `pendingAuth` sin expiración.
5. **Divergencia memoria↔DB silenciosa**: write-through traga errores; multi-instancia pierde dedup/idempotencia en memoria.
6. **`BAJA` por chat no persiste**: responde cese que no ejecuta (riesgo de cumplimiento).
7. **Cobertura AU10.1 parcial**: varias acciones de `ACCIONES_SENSIBLES` no tienen ruta con `exigirReauthReciente` en este corte.
8. **Detalles menores**: `pin_fallido` invisible para el Dueño (fuera del subset comercio); `device_code` global sin tenant; redefinir PIN resetea rate-limit; `desvincular` sin reauth; verify GET sin comparación constant-time.
