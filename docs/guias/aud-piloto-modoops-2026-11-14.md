---
id: AUD-PILOTO-2026-11-14
tipo: spec
estado: aceptado
modulos: [tenant, persistencia, onboarding]
depende_de: [ADR-0116, GUIA-DEPLOY-PILOTO]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Auditoría 2026-11-14 de pendientes del piloto ModoOps contra main: afirmaciones
  verificadas, propuesta de migración 0044 y huecos de aislamiento en TENANT_MODE=shared.
---
# Auditoría piloto ModoOps (2026-11-14)

## Verificación de afirmaciones

| # | Afirmación | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Tablas en schema sin `CREATE` en `drizzle/*.sql`; slot 0043 = `0043_shared_tenant_nucleo`; `db:migrate:kit` falla en `inventory_counts`; P1-69 saltea | **Confirmada** | `platform_feedback_reports` solo en `src/db/schema-admin.ts:134`; `inventory_counts` en `src/db/schema.ts:40` sin `CREATE` en ningún `.sql` (solo `ALTER` en `drizzle/0043_shared_tenant_nucleo.sql:9`); `fiscal_customers` en `src/db/schema-fiscal.ts:25` sin migración; `product_flags` / `report_exports` en `src/db/schema-analytics.ts:20-41` (0038 las excluye explícitamente); test `tests/db-migrate.test.ts:59-75` documenta el skip |
| 2 | `deploy-piloto.md` sigue `estado: propuesto` | **Confirmada** | `docs/guias/deploy-piloto.md:3` (how-to no corrido punta a punta en host real; precondiciones actualizadas en el PR de esta auditoría) |
| 3 | ADR-0116 propuesto con C0–C6 mergeados; repos sin filtro `tenant_id`; faltan NOT NULL y uniques | **Matizada** | C0–C6 en código y avance `0116.md`; ADR `aceptado` en el PR. Huecos de aislamiento listados abajo. ADR-0116 «Pendientes» ya nombra NOT NULL + uniques |
| 4 | Rubro del alta no persiste (`tenants` sin columna) | **Confirmada** | `src/db/schema.ts:168-180` sin `rubro`; `src/pages/api/onboarding/alta.ts:124` usa rubro en memoria; `src/lib/control-db.ts:271-282` insert sin rubro |
| 5 | Avances P10-14, P10-9, … y TB con `estado: pendiente` en roadmap | **Matizada** | Front-matter de avances ya `estado: hecho` (p. ej. `P10-14.md:3`, `STOCK-E4.md:3`, `TB-158.md:3`). `docs/ROADMAP.md` y `docs/ESTADO.md` en `main` desactualizados (se regeneran en `main`, no en rama) |
| 6 | `ESTADO.md` termina 2026-10-21, última migración 0036 | **Confirmada** | `docs/ESTADO.md` generado; registros JSON llegan a `0043` con fechas 2026-11-14 en el PR de auditoría |

## Propuesta tag `0044` (documentación; sin `drizzle/*.sql` hasta aprobación)

Crear migración aprobada por Mauri que incluya al menos:

- `CREATE TABLE platform_feedback_reports` (control plane, TB-164).
- `CREATE TABLE inventory_counts` (o alinear con `stock_counts` de `0017` — hoy son dos nombres en schema vs SQL).
- `CREATE TABLE fiscal_customers`, `product_flags`, `report_exports` si el producto las activa en piloto.
- Wave posterior: `tenant_id` en tablas de pricing (`src/db/schema-precios.ts`, sin columna hoy) y cierre NOT NULL/uniques del ADR-0116.

## Pendientes priorizados

### Bloqueante para piloto

| Pendiente | Por qué | Evidencia |
|---|---|---|
| Migración `0044_*` con `platform_feedback_reports` | TB-164 en Vercel sin tabla → 503 | `src/lib/reportes-comercio-db.ts:57`; avance TB-164 |
| Backfill / sellar `tenant_id` en filas legacy del núcleo | Nullable permite mezcla si un repo no filtra | `drizzle/0043_shared_tenant_nucleo.sql:1-3`; repos listados abajo |
| Aislamiento shared en repos de stock/OCR que leen sin `dondeTenant` | Dos comercios en una base ven datos cruzados | `src/lib/repos/lotes.ts:27`; `ocr.ts:109`; `importaciones.ts:122-179`; `stock-inicial.ts:72-78` |

### Importante

| Pendiente | Por qué | Evidencia |
|---|---|---|
| Pricing lane sin `tenant_id` en schema | Ajustes y cost history mezclan tenants | `src/db/schema-precios.ts:21-64`; `src/lib/repos/precios.ts:67-98` |
| `deploy-piloto` corrido E2E en host real | Sigue `propuesto` hasta comprobación | `deploy-piloto.md` § final |
| Issue #93 persistir rubro | Onboarding no re-lee rubro tras reinicio | schema `tenants` |
| NOT NULL + uniques `(tenant_id, …)` cierre ADR-0116 | SKUs/códigos globales entre tenants | ADR-0116 pendientes |

### Después

| Pendiente | Notas |
|---|---|
| `fiscal_customers` / ARCA | Fuera del corte piloto (`deploy-piloto.md` §7) |
| `product_flags`, `report_exports` | Schema sin uso productivo obligatorio en piloto |
| `rotation_settings` / analytics sin `tenant_id` | 0038; P10-19 acotó alcance |
| Issues #158–#164 cierre en GitHub | Implementación TB hecha en avances |

## Huecos de aislamiento reales (`TENANT_MODE=shared`)

Tablas del núcleo con columna `tenant_id` (0043) pero repos que no filtran ni sellan al escribir:

| Repo | Lectura / escritura | Tablas |
|---|---|---|
| `lotes.ts` | `select().from(stockLots)`; `insert` sin `tenantId` | `stock_lots` |
| `importaciones.ts` | queries/inserts sin `tenant_id` | `products`, `stock_imports`, `stock_lots`, `stock_movements` |
| `stock-inicial.ts` | `from(products)` sin scope | `products`, `stock_movements` |
| `ocr.ts` | `from(ocrJobs)` sin filtro; insert sin tenant | `ocr_jobs`, `ocr_eventos` |
| `precios.ts` | tablas sin columna `tenant_id` en schema | `price_adjustments`, `pricing_audit_log`, etc. |
| `mp-webhooks.ts` | insert sin `tenantId` | `mp_webhook_events` (webhook de plataforma; riesgo menor) |

Contraste: `catalogo.ts` usa `dondeTenant` / `tenantIdShared()` (`src/lib/repos/catalogo.ts:189-405`).

## Issues cerrables (no cerrados en el PR de documentación)

- #93 — rubro no persistido en `tenants`
- #158–#164 — tablero B / Modo / feedback (avances TB-* en `hecho`)