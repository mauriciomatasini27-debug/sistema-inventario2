---
id: ADR-0031
tipo: adr
estado: aceptado
modulos: [auth]
depende_de: [PRD-AU-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Adjuntar los Set-Cookie de OAuth al redirect de login con el patrón ya probado de reauth.ts:56-59, dar a
  pendingAuth la misma expiración de 10 min que pendingReauth, y cubrir el flujo con test punta a punta sin
  mockear redirect más test de regresión anti-return redirect(...) pelado.
---
# ADR-0031 - Login: cookies en el redirect y expiración de pendingAuth

Estado: aceptado (2026-10-12, evidencia: `src/pages/api/auth/login.ts:47`). Fecha: 2026-10-11. Fuente: PRD-AU-01, auditoría pstack 3 workers (worker A: `login.ts:33-56`).

## Decisión

Adjuntar los `Set-Cookie` de OAuth al `redirect` de login con el patrón ya probado de `reauth.ts:56-59`, dar a `pendingAuth` la misma expiración de 10 min que `pendingReauth`, y cubrir el flujo con test punta a punta sin mockear `redirect` más test de regresión anti-`return redirect(...)` pelado.

## Evidencia del bug

`login.ts:33-47` construye `headers` con `__Host-oauth-state`, `__Host-oauth-nonce` y `__Host-oauth-pkce`, pero `login.ts:56` retorna `redirect(destino, 302)` sin ellos: Astro no los propaga, el navegador nunca guarda state/PKCE y `callback.ts:35-40` responde 403 ("Sesión de ingreso inválida o vencida") en producción. Los tests actuales mockean `redirect` (ver `auth-cambio-usuario.test.ts:34-35`) y nunca leen `Set-Cookie`, por eso están verdes con el bug presente. Además `pendingAuth` no guarda vencimiento ni se chequea en el callback, a diferencia de `pendingReauth` (`reauth/callback.ts:46-49`).

## Qué cambia

- `login.ts`: `const r = redirect(destino, 302); r.headers.append(...)` x3; se borra el `headers` muerto. Sin cambiar nombres, valores ni `Max-Age=600`.
- `reauth.ts:55`: se borra `void headers;` muerto (comportamiento intacto).
- `store.ts` + `login.ts:32` + `callback.ts:38-42`: `pendingAuth` guarda `expiraEnMs`, el callback responde 403 vencida y hace `delete` en todos los caminos (éxito, fallo, vencido).
- Cookie `__Host-oauth-nonce`: se elimina (el callback valida `pendiente.nonce` del mapa contra el ID token; la cookie nunca se lee).
- Tests nuevos `tests/auth-login-e2e.test.ts`: S5 punta a punta con `redirect` real y OIDC mockeado solo en borde (`intercambiarCodigo`/`verificarIdToken`); S6 regresión que exige `Set-Cookie` en ambos redirects.

## Alternativas descartadas

- Confiar en que Astro propaga `headers` implícitos: se descarta porque el código nunca los pasa al `redirect` y `reauth.ts` demuestra que hay que adjuntarlos a mano.
- Guardar state/nonce en query o `localStorage`: se descarta porque el propio comentario (`login.ts:34-35`) fija no dejarlos en historial/logs; las cookies HttpOnly de un solo uso ya son la decisión vigente.
- Migrar `pendingAuth` a Postgres o alargar la ventana: se descarta por fuera de corte (PRD-AU-01); 10 min iguala reauth y alcanza para el round-trip a Google.
- Reescribir el callback o agregar segundo factor: fuera de corte, no toca este fix.

## Pendientes

Heredados del panel (no entran acá): `callback.ts:89-134` auto-acepta primera invitación pendiente por email sin token; `memberships.ts:41-46` alta directa sin ligar token a `google_sub`; `control.ts:29` `creadoAt: s.expiraAt` (typo aparente); cookie de sesión con `Max-Age=30d` fijo en vez del calculado.

DoD: PRD-AU-01 S1-S6 en verde, `tsc --noEmit` 0 errores, suite auth completa en verde, sin archivos fuera de `auth/*`, `devices/*`, `store.ts` y el test nuevo.
