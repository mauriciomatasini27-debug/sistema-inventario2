---
id: PLAN-COM-01
tipo: plan
estado: propuesto
modulos: [admin, auth, bot, caja, compras, email, fiado, fiscal, inventario, offline, onboarding, pagos, persistencia, precios, tenant, ventas]
depende_de: [ADR-0001, ADR-0002, ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0017, ADR-0018, ADR-0019, ADR-0020]
reemplaza: []
reemplazado_por: ""
resumen: |
  Plan de poda de comentarios: 603 a borrar, 65 a refactor, 135 a conservar y 39 falsos verificados.
  Tres comentarios afirman un control que el código no hace y piden agregar el control.
  Solo análisis por áreas de src sin cambiar código.
---
# PLAN-COM-01 - Plan de poda de comentarios de código

Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-COM-01-poda-comentarios.md` (COM-S4), ADR-0064 (propuesto). Tipo: reference. Solo análisis: este plan no cambia código.

## Cómo se armó

- Seis sesiones de OpenCode 1.19.0 con `/poteto-mode`, `/swarm` y `/no-comments`, una por área y de a una, con tope de 250k de contexto: rutas API (`src/pages/api`), repositorios (`src/lib/repos`), `src/lib`, jobs (`src/jobs` y `src/pages/api/jobs`), UI (`src/components`, `src/layouts`, `src/pages/*.astro`) y `src/db`.
- Modelos: `opencode/muse-spark-1.3-contributor-free` en cinco áreas. En repositorios fallaron `muse-spark` y `big-pickle` (error) y `space-bunny-free` (corte a 700 s); la terminó `longcat-2.5-preview-free`.
- Revisión manual: cada cita se tomó del archivo en la línea indicada (las citas del modelo que no coincidían se reemplazaron por el texto real o se descartaron). Los comentarios marcados FALSO llevan si se verificaron a mano o solo por el modelo. Duplicados entre sesiones: gana conservar sobre refactor y refactor sobre borrar.
- Fuera de alcance de las sesiones: `src/modules`, `src/offline` y `src/middleware.ts`. Dos comentarios falsos de `src/modules/payments` entran por revisión manual.

## Resumen

| Grupo | Cantidad |
|---|---|
| (a) Borrar | 603 |
| (b) Refactor | 65 |
| (c) Conservar | 135 |
| Falsos (dentro de a y b) | 39 |

## Hallazgos de seguridad

Tres comentarios afirman un control que el código no hace. Más que borrar el comentario, falta el control:

- `src/pages/api/payment-orders/confirm-paid.ts:8` y `cancel.ts:8` dicen `solo Dueño`; la ruta no mira la sesión y el repositorio pasa `rol: "dueno"` fijo (`src/lib/repos/ordenes-pago.ts:370`, `408`, `444`, `482`).
- `src/pages/api/fiscal/settings.ts:23` dice `Dueño+reauth`; la ruta toma el tenant del header `x-tenant-id` (default `demo`) sin sesión ni reauth.
- `src/pages/api/prices/adjustments.ts:10` dice que el ajuste sensible exige online; el repositorio fija `online: true` (`src/lib/repos/precios.ts:48`).

## Refactors principales

1. Mapas en memoria con tabla ya existente: conteos (`stock_counts`, `stock_count_lines`), ubicaciones (`locations`), fotos (`product_photos`), secuencia por dispositivo (`outbox.device_seq`) e índice por message-id (`utility_bills.message_id`). Pasar cada uno a su tabla y borrar el espejo. Talla M cada uno.
2. Correlativos en memoria: `nextTicket` en la promoción de sync y en fiado ignora `ticket_counters`, y `nextReturn` ignora `sale_returns.numero_devolucion`. Numerar dentro de la tx con el contador durable. Talla M.
3. `src/lib/store.ts`, `server-db.ts`, `control-db.ts` y `admin-store.ts` todavía se describen como fuente de verdad; desde ADR-0053 a ADR-0063 manda la base. Retirar el write-through best-effort de control y admin hacia repositorios DB primero. Talla L.
4. Jobs de WhatsApp leen `control` y `store` en memoria (`src/jobs/whatsapp-adaptador.ts`) y el email de cierre se encola en un outbox en memoria. Leer por repositorios y usar `email_outbox`. Talla M.
5. Cola de aprovisionamiento y `POST /api/jobs/enqueue`: el comentario dice pg-boss y no está instalado; dejar `provision_jobs` como cola y abrir issue para pg-boss. Talla S.
6. Stubs con comentario de producción: padrón ARCA, `gmail/watch` y URL firmada de fotos. Abrir un issue por cada uno y borrar el comentario. Talla S cada uno.

## Partes

- [PLAN-COM-01-A: (a) Borrar](PLAN-COM-01/a-borrar.md)
- [PLAN-COM-01-B: (b) Refactor](PLAN-COM-01/b-refactor.md)
- [PLAN-COM-01-C: (c) Conservar](PLAN-COM-01/c-conservar.md)
