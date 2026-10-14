# ADR-0066 - Dueño real en rutas sensibles y correlativo único de tickets

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-SEC-01-dueno-real-y-correlativo-unico.md`, `diseno/PLAN-COM-01-poda-comentarios.md`, ADR-0064, ADR-0051, ADR-0031 (AU10), ADR-0024.

## Decisión

Las rutas que se declaran "solo Dueño" verifican sesión y membership dueño del tenant que resuelve el servidor (`tenantDeRequest`), con los helpers existentes de `src/lib/control.ts`. La configuración fiscal suma reauth reciente (`exigirReauthReciente`). El ajuste de precios deriva `online` de la puerta offline (`exigirOnlineParaSensible`). La promoción de sync numera con `ticket_counters` dentro de la transacción, igual que las ventas.

## Qué cambia

- `payment-orders/confirm-paid` y `cancel`: 403 sin sesión o sin rol dueño; el rol que llega al repositorio sale de la membership verificada.
- `fiscal/settings`: POST exige dueño + reauth (401 `reauth_requerida` si es vieja); el tenant ya no sale de un header con `demo` por defecto; en multi falla cerrado con 403.
- `prices/adjustments`: el repositorio recibe `online` del request; con marcas offline responde 403.
- `sync/promote`: en DB, lock `FOR UPDATE` sobre `ticket_counters` (`mostrador`) y escritura de `id_mappings` + `outbox` en la misma transacción; en memoria y single, el contador compartido con ventas.
- Se borran o corrigen los comentarios falsos tocados (ADR-0064).

## Alternativa descartada

Borrar solo los comentarios y dejar el comportamiento. Se descarta porque los cuatro casos son controles de seguridad o de integridad que el resto del sistema da por hechos.

## Consecuencias

Clientes que llamaban a estas rutas sin sesión de dueño pasan a recibir 403 (o 401 por reauth en fiscal). La numeración de sync en DB deja de depender del proceso.

## Pendientes

- `/api/payment-orders` no está en `PREFIJOS_DATOS`: en multi la ruta resuelve el tenant con `tenantDeRequest` pero el middleware no la envuelve en `conTenant`.
- `fiscal_settings` en base no guarda tenant (la tabla vive en la base de cada tenant).
- Carrera preexistente entre archivos de test que comparten la base B de Postgres local (`pers2-jobs` inserta facturas de servicio que `pers2-servicios-fiado` puede ver si corren a la vez).

## Evidencia de aceptación (2026-10-13)

- Commits: 475c82c.
- `tests/sec01-dueno-correlativo.test.ts`: 17/17 con Postgres local (`PG_TEST_URL_A/B`), handlers reales con `Request` reales: sin sesión 403, empleado 403, dueño 200/201 en pagos; fiscal 401 `reauth_requerida` con reauth vieja y 403 en multi sin membership; ajuste con `x-offline-grant` o `x-cuarentena: 1` 403; ventas y promotes intercalados sin números repetidos en memoria y en PG.
- `npm test`: 874 passed, 3 failed (antes 857 passed, 3 failed). Fallan los 2 de caja-c11 y el de `tests/vencimientos.test.ts` (preexistentes). En 2 de 5 corridas falló además `pers2-servicios-fiado` por la carrera de la base B descrita arriba; pasa solo y sin cambios de este ADR en esa ruta.
- `tsc --noEmit`: 1 error preexistente (`tests/nivel5-admin.test.ts`). `npm run build`: OK.
