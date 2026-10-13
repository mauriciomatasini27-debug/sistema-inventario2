# PRD-AU-01 - Login OAuth: cookies perdidas y pendingAuth sin expiración

Fuente: auditoría pstack 3 workers sobre `src/pages/api/auth/login.ts`,
`reauth.ts`, `auth/callback.ts` (commits `0c920ec`, `d6d16eb`). El PRD de
Autenticación en `.docx` no está disponible; este PRD cubre solo el fix.

## Bug confirmado en código

- `login.ts:33-47` arma `headers` con 3 `Set-Cookie`
  (`__Host-oauth-state`, `__Host-oauth-nonce`, `__Host-oauth-pkce`) pero
  `login.ts:56` retorna `redirect(destino, 302)` sin adjuntarlos: el
  navegador nunca guarda state/PKCE y `callback.ts:35-40` (exige
  `stateCookie === state`) responde 403 siempre. En producción el login
  estaría roto; los tests lo mockean (`redirect` falso) y no lo ven.
  `reauth.ts:55-59` ya tiene el patrón correcto (`r.headers.append`).
- `control.pendingAuth.set(state, ...)` (`login.ts:32`) no guarda vencimiento
  y `callback.ts:38-42` no chequea tiempo (a diferencia de `pendingReauth`
  10 min en `reauth/callback.ts:46-49`): entradas huérfanas crecen y un state
  viejo sigue canjeable mientras viva el proceso.
- Higiene: cookie `__Host-oauth-nonce` se setea (`login.ts:40-43`) pero el
  callback nunca la lee (usa `pendiente.nonce` del mapa); `void headers;`
  muerto en `reauth.ts:55`.

## Épica AU-FIX-E1. Redirect con cookies

Requisito AUF1: el login entrega state/PKCE al navegador en el redirect.

- Historia AU-FIX-S1. Adjuntar los 3 `Set-Cookie` al `redirect` de login con el patrón de `reauth.ts:56-59` y borrar el `headers` muerto. AC: Given pido `GET /api/auth/login` con `redirect` real When leo la respuesta Then es 302 a `accounts.google.com` y trae los 3 `Set-Cookie` con `Max-Age=600`. ADR: 0031. Talla S. Depende de: nada.
- Historia AU-FIX-S2. Quitar `void headers;` muerto de `reauth.ts:55`. AC: Given leo `reauth.ts` When busco `void headers` Then no aparece y el flujo reauth sigue verde. ADR: 0031. Talla XS. Depende de: nada.

## Épica AU-FIX-E2. pendingAuth con expiración

Requisito AUF2: un state de login vive 10 min como el de reauth.

- Historia AU-FIX-S3. Guardar `expiraEnMs: Date.now() + 10*60_000` en `pendingAuth`, chequearlo en `callback.ts` (403 vencido + `delete`) y borrar la entrada al consumirla aunque falle. AC: Given genero un state hace 11 min When llamo al callback con code/state/cookies válidos Then responde 403 de confirmación vencida y la entrada ya no existe. ADR: 0031. Talla S. Depende de: AU-FIX-S1.
- Historia AU-FIX-S4. Eliminar la cookie `__Host-oauth-nonce` (nunca leída) o documentar por qué queda. AC: Given completo un login feliz sin esa cookie When llega al callback Then la sesión se crea igual. ADR: 0031. Talla XS. Depende de: AU-FIX-S1.

## Épica AU-FIX-E3. Test punta a punta

Requisito AUF3: ningún cambio de este flujo entra sin probar redirect real.

- Historia AU-FIX-S5. Test `login → callback` sin mockear `redirect`: llama al `GET` real, extrae `Location` + `Set-Cookie`, sigue al callback con `intercambiarCodigo`/`verificarIdToken` mockeados en borde y verifica sesión creada + cookie `__Host-sesion` + entrada consumida. AC: Given corro el test nuevo When el login no adjunta cookies Then falla; con el fix, pasa. ADR: 0031. Talla M. Depende de: AU-FIX-S1.
- Historia AU-FIX-S6. Test de regresión: `redirect` de login y reauth siempre con `Set-Cookie` (falla si alguien vuelve al `return redirect(...)` pelado). AC: Given alguien reintroduce el return sin cookies When corre la suite Then el test lo frena. ADR: 0031. Talla S. Depende de: AU-FIX-S5.

## Dependencias externas

AU-FIX-S1 no espera a nadie. AU-FIX-S3 espera a AU-FIX-S1. AU-FIX-S5 espera a AU-FIX-S1. Resto independiente.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Login punta a punta | `GET login` real + callback con OIDC mockeado en borde | 302 con 3 cookies, sesión creada, `login` auditado |
| Fallo | State vencido 11 min | Callback con state viejo | 403 vencida, entrada borrada |
| Fallo | Sin cookie state | Callback sin `__Host-oauth-state` | 403 inválida (comportamiento actual conservado) |
| Regresión | Redirect sin cookies | Cualquier cambio futuro | Test AU-FIX-S6 en rojo |

## Fuera de corte

Cambiar PKCE/state a otro transporte (query, storage); tocar `callback.ts` más allá del chequeo de expiración; migrar `pendingAuth` a DB; tocar AU14 u otros AU.
