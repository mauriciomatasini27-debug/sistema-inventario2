---
item: BOT2-S1
estado: parcial
adr: ADR-0026
prd: PRD-BOT-02
fecha: 2026-10-23
---
BOT2-S1 parcial: la consulta de stock ya lee `product_aliases` (`alias_norm` filtrado por el tenant: uuid del comercio o `tenant_id` null en single) en `listarProductosConsulta` y `listarCatalogoVivo` (`src/lib/repos/whatsapp.ts`); `GET /api/whatsapp/consult` suma el alias al armado de candidatos (score 1 si coincide exacto) y el webhook lo usa vía `ItemVivo.alias` en `buscar_en_catalogo`; `decidir_respuesta` no cambia (1 directo, 2 a 5 lista, más de 5 precisar, 0 sugerencia); `tests/bot2-alias-consulta.test.ts` con PG: un alias resuelve al sku correcto y un alias de otro tenant en la misma base no aparece; sin CREATE EXTENSION, sin índice GIN ni archivo SQL; queda pendiente el match `pg_trgm` real.
