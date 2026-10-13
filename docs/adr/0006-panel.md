# ADR-0006 - Panel Multi-Kiosco

Estado: aceptado. Fecha: 2026-10-10. Rigen Partes 1-3. Doc suelto descartado.

## Decisión

Panel en `admin.<dominio>` solo datos de gestión. Ley 25.326. Sin ver ni tocar negocio tenant.

PA1 acceso Google + allowlist `platform_admins` por `google_sub`. PA2 auditoría inmutable con denegados. PA3 base legal recorte. PA4 solo contadores técnicos sin contenido. PA5 directorio clientes. PA6 cuenta y cobranza suscripción. PA7 mora 14 días demora/gracia/suspendido. PA8 uso y costo WA por kiosco. PA9 alertas técnicas backup/migración/capacidad/calidad número. PA10 alta/baja/reactivación tenant. PA11 infra vista + re-ejecutar migración, P1 restaurar/mover. PA12 flags por tenant/plan. PA13 errores por tenant. PA14 deploys estado + rollout, P1 disparar/rollback.

## Prohibido

Productos, stock, movimientos, ventas, precios, promos, lotes, caja, tickets, facturas, pagos, conteos, diferencias turno, clientes finales, empleados, consumos, saldos fiado. Sin drill-down. Sin impersonación. Sin leer filas de bases comercio. Sin agregar métricas negocio.

La versión vieja PA5 tablero ventas, PA9 deudas operación, PA10 consumos, PA13 drill-down, PA19 soporte quedan eliminadas por decisión dueño 9/10/2026.

## Datos

Solo control: `platform_admins`, `admin_audit_log`, tenants, billing/mora, WA usage, `infra_hosts`, backups, colas, `migration_rollouts`, flags, errores, alertas, contadores. Negocio tenant nunca entra. Agregación vía `ops_signals_outbox`, no jobs leyendo bases.

## Flujos

Revisión mañana, anomalía sin ver datos, mora 14 días, costo WA fin mes, soporte sin ver datos, alta/baja asistida, bugfix con rollout, mover tenants P1.

## Consecuencias

- Soporte con señales, no con datos.
- Auditoría total para defensa legal.
- Doc suelto se archiva como histórico, no se implementa.

## Contratos API (REST, no server actions)

- `GET /api/admin/tenants` con sesión Google más allowlist `platform_admins` por `google_sub`. Responde 200 con lista de gestión: `slug, state, vencimiento, backup, uso_wa`. Solo contadores técnicos, sin contenido de negocio. 403 si `google_sub` fuera de allowlist, con registro en auditoría incluyendo denegados.
- `POST /api/admin/tenants/:id/suspender` con body `motivo`. Responde 200 con `state suspendido`, 422 si la gracia de 14 días no se cumplió, 409 si ya estaba suspendido.
- `POST /api/admin/tenants/:id/reactivar` sin body. Responde 200 con `state activo`, 409 si ya estaba activo.
- `POST /api/admin/rollouts/:id/reintentar` reejecuta migración. Responde 202 con `rollout_id`, 409 si hay un rollout en curso.
- `GET /api/admin/audit?tenant=&desde=&hasta=` lee `admin_audit_log` con fecha, acción, usuario y resultado. Responde 200. Sin filtros devuelve página con orden por fecha.

## Eventos

- `tenant_suspendido {tenant_slug, state, motivo, actor}`.
- `tenant_reactivado {tenant_slug, actor}`.
- `mora_dia14 {tenant_slug, vencimiento, estado}` para aviso y pase a solo lectura el día 15.
- `deploy_rollout {rollout_id, estado}` para PA14.
- Agregación vía `ops_signals_outbox`, sin jobs que lean bases de comercio. Panel nunca lee negocio.

## Errores E1-E5

- E1 sin permiso: 403 más registro en auditoría con denegado (PA2).
- E2 tenant inexistente: 404 sin revelar datos.
- E3 módulo fuera de catálogo: 422, instalar o quitar solo desde catálogo con validación de dependencias.
- E4 rollout en curso: 409, un reintento por vez.
- E5 suspensión sin gracia: 422, exige avisos y día 15 según PA7.

## Fuera de corte

- Restaurar y mover tenants P1, disparar y rollback de deploys P1, billing automático, editor runtime, self-service, drill-down, impersonación y cualquier lectura de negocio tenant. Prohibidos por Ley 25.326 según sección Prohibido.
