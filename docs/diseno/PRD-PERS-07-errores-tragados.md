---
id: PRD-PERS-07
tipo: prd
estado: hecho
modulos: [admin, bot, offline, pagos, persistencia, ventas]
depende_de: [ADR-0065, ADR-0073, ADR-0082]
reemplaza: []
reemplazado_por: ""
resumen: |
  tests/arch/sin-errores-tragados.test.ts impide errores tragados nuevos, pero deja 9 en una lista explícita
  (PERMITIDOS): el registro del service worker en src/layouts/BaseLayout.astro, la lectura de la orden rival en
  src/lib/repos/ordenes-pago.ts, dos res.json().catch(() => null) en src/modules/sales/tickettemplate.ts y
---
# PRD-PERS-07 - Errores tragados de E7 a cero

Fuente: E7 de ADR-0073 ("Errores tragados: 9 en `src` hoy"); `docs/ROADMAP.md`, Pendientes priorizados P1.5. Uso en este sistema: diagnóstico de fallas en caja, alta, pagos, WhatsApp y cola offline de cualquier comercio. Restringido por ADR-0082, ADR-0073 y ADR-0065. Tipo calidad. No cambia shapes HTTP, status codes ni comportamiento visible de la UI.

## Problema

`tests/arch/sin-errores-tragados.test.ts` impide errores tragados nuevos, pero deja 9 en una lista explícita (`PERMITIDOS`): el registro del service worker en `src/layouts/BaseLayout.astro`, la lectura de la orden rival en `src/lib/repos/ordenes-pago.ts`, dos `res.json().catch(() => null)` en `src/modules/sales/ticket_template.ts` y `src/modules/whatsapp/cliente-cloud.ts`, la cola `tail` de `transact()` en `src/offline/db.ts` y cuatro `r.json().catch(() => ({}))` en `src/pages/alta.astro`, `src/pages/alta/estado.astro` y `src/pages/venta.astro` (dos). Cuando alguno falla no queda rastro: una respuesta 2xx de Meta sin JSON se ve igual que una sin `wamid`, un error de la base al buscar la orden rival desaparece y un turno fallido de la cola offline no deja huella fuera de quien lo esperaba. No hay logger propio en `src`; el registro es `console.warn` con contexto.

## Épica PERS7-E1. Cada error tragado registra o relanza

Requisito PERS7-R1: ningún `catch {}` vacío ni `.catch(() => null | undefined | false | {} | ({}))` en `src`; `PERMITIDOS` queda vacío y su tamaño esperado es 0. Cada sitio registra con `console.warn` (prefijo del módulo entre corchetes y el error) y devuelve el mismo valor por defecto que hoy, o relanza. Sin cambio de shape HTTP, status codes ni comportamiento de la UI.

- Historia PERS7-S1. Servidor: en `ordenes-pago.ts`, si falla la lectura de la orden rival tras el conflicto del insert, se registra con la key y se relanza el error original del insert (igual que hoy cuando no hay rival: multi 503 `base_no_disponible`, single fallback en memoria); con rival, 409 como hoy. En `ticket_template.ts` y `cliente-cloud.ts`, una respuesta 2xx sin JSON válido se registra con el status y sigue devolviendo `respuesta_invalida`. AC: Given un insert que choca y una lectura rival que lanza When creo la orden Then se llama `console.warn` con la key y se propaga el error original; Given `fetchFn` 2xx cuyo `json()` rechaza When envío por WhatsApp (ambos clientes) Then `{ ok: false, codigo: "respuesta_invalida" }` y `console.warn` llamado una vez. ADR: 0082. Talla S. Depende de: nada.
- Historia PERS7-S2. Cola offline: `tail` de `transact()` en `src/offline/db.ts` registra el turno fallido y sigue resolviendo, para que la cadena no se corte; el llamador sigue recibiendo el rechazo por `run`. AC: Given un `transact` cuyo `fn` lanza When lo espero Then rechaza con ese error, `console.warn` registra el turno y el `transact` siguiente corre y resuelve. ADR: 0082. Talla S. Depende de: nada.
- Historia PERS7-S3. Navegador: el registro del service worker y los cuatro `json()` de alta, estado de alta y venta registran con `console.warn` (contexto y status cuando hay respuesta) y devuelven lo mismo que hoy (`{}` o nada), sin cambiar mensajes ni flujo de la pantalla. `tests/arch/sin-errores-tragados.test.ts` queda con `PERMITIDOS` vacío y espera tamaño 0. AC: Given el repo When corro `npm run check:arch` Then el test E7 pasa con lista vacía; Given cualquier `.catch(() => null)` nuevo en `src` Then el test falla. ADR: 0082. Talla S. Depende de: PERS7-S1 y PERS7-S2.

## Fuera de alcance

Logger estructurado o servicio de logs (Sentry, Logtail, etc.). `catch` con cuerpo no vacío que ya maneja el error (p.ej. `.catch(() => { ...textContent = "—" })` en `src/pages/panel.astro`, `catch { return { ok: false, codigo: "red" } }`). Ampliar el detector de E7 a otros patrones. Cambiar mensajes al usuario o códigos de error.

## Dependencias externas

Ninguna. Sin servicios nuevos ni Supabase.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Error | Rival que falla | Insert con conflicto y lectura rival que lanza | `console.warn` con key; se propaga el error original |
| Error | 2xx sin JSON | `fetchFn` ok con `json()` que rechaza (dos clientes) | `respuesta_invalida`; `console.warn` una vez |
| Error | Turno offline fallido | `transact(() => { throw })` y luego otro `transact` | El primero rechaza; warn; el segundo resuelve |
| Regresión | Rutas de pagos y WhatsApp | Suites existentes | Sin cambio de status ni shapes |
| Arch | E7 | `tests/arch/sin-errores-tragados.test.ts` | `PERMITIDOS` vacío, tamaño 0; trinquetes no suben |
