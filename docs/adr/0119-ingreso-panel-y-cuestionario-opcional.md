---
id: ADR-0119
tipo: adr
estado: aceptado
modulos: [onboarding, auth, admin]
depende_de: [ADR-0115, PRD-ON-01, PRD-AU-02]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Fija ADR-0115 y PRD-ON-01 como fuente de verdad del ingreso post-login: Dueño y Empleado entran a /panel.
  El cuestionario de configuración pasa a ser una ruta opcional del Dueño, nunca la puerta de entrada.
  La regla «wizard incompleto → /onboarding» de PRD-AU-02 queda resuelta como divergencia superada.
---
# ADR-0119 - Ingreso por panel y cuestionario opcional

Estado: aceptado (2026-11-21). Fecha: 2026-11-21. Fuentes: especificación local `onboarding-fixes`, ADR-0115, PRD-ON-01, PRD-AU-02, revisión del diff `a6b5bd5...HEAD`.

## Decisión

Después del login manda la precedencia: destino `next` válido → allowlist admin → decisión por rol y estado. Sin `next`, un sub de `ADMIN_ALLOWLIST_SUBS` va a `/admin` aunque tenga comercio y el cuestionario incompleto. El Dueño y el Empleado con comercio van a `/panel`; sin comercio se va al alta.

El cuestionario de configuración deja de decidir el destino del login. Sigue existiendo como ruta opcional abierta desde `/panel`, exclusiva del Dueño, con guard de rol en servidor. Ningún usuario es enviado ahí como consecuencia de entrar.

Cuando el documento aceptado (`ADR-0115`, `PRD-ON-01`) y el documento en curso (`PRD-AU-02`) se contradicen, gana el aceptado. La regla de `PRD-AU-02` que enviaba el wizard incompleto a `/onboarding` se registra como divergencia resuelta, no como comportamiento pendiente.

## Por qué

`ADR-0115` y `PRD-ON-01` están aceptados y describen el diálogo de bienvenida dentro de `/panel`. Si el login envía los comercios nuevos a `/onboarding`, ese diálogo nunca se alcanza en el flujo normal. Además, la allowlist admin perdía contra el estado del wizard y un Empleado recibía preguntas de Dueño. Es una decisión difícil de revertir (cambia la entrada de todos los comercios), sorprendente sin contexto (dos documentos dicen cosas contrarias) y resultado de un trade-off real (se conserva el cuestionario ya construido como ruta opcional en vez de borrarlo).

## Qué cambia

- `src/pages/api/auth/callback.ts`: precedencia explícita `next` → allowlist → rol; se elimina el destino `/onboarding`.
- `src/pages/panel.astro`: enlace «Configurar comercio» sólo para Dueño, con el comercio resuelto.
- `src/pages/onboarding.astro`: guard de Dueño en servidor, salida al panel y progreso retomable.
- `docs/diseno/PRD-AU-02-login-con-destino.md`: línea `> Estado al` actualizada con la divergencia resuelta.

## Pendientes

- La migración que agregó las columnas del wizard queda intacta: las respuestas nuevas viven en el espejo en memoria, no en una columna nueva.
- No se reabren las decisiones de landing, planes ni WhatsApp.
