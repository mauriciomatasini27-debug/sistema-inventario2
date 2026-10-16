---
id: PRD-OP-01
tipo: prd
estado: propuesto
modulos: [admin, landing]
depende_de: [ADR-0006, ADR-0020, ADR-0022]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: ADR-0006, ADR-0020, ADR-0022, src/pages/admin.astro:4-6, src/pages/panel.astro:204-230,
  src/data/business.ts:36-39. Gap: admin resto demo; panel comercio KPIs hardcodeados; landing placeholders E13.
---
# PRD-OP-01 - Cierre paneles y landing

Fuente: ADR-0006, ADR-0020, ADR-0022, `src/pages/admin.astro:4-6`, `src/pages/panel.astro:204-230`, `src/data/business.ts:36-39`. Gap: admin resto demo; panel comercio KPIs hardcodeados; landing placeholders E13.

## Épica OP-E1. Panel admin real

- OP-S1. `GET /api/admin/tenants` + `suspender|reactivar` + `rollouts/:id/reintentar` + `GET /api/admin/audit`. AC: Given admin When listo Then sin badges `demo`; Infra deja `Próximamente (PA11)` solo si ADR lo fija. Tablas: `platform_admins`, `migration_rollouts`, `infra_hosts`, `tenant_daily_usage`. Depende de: PERS-S4.
- OP-S2. Allowlist `google_sub` + `admin.<dominio>` + Ley 25.326 (solo gestión, nunca negocio). AC: Given no-admin When pide Then 403 + `admin_audit_log`. Depende de: OP-S1.

## Épica OP-E2. Panel comercio funcional

- OP-S3. Stock/Precios/Proveedores/Fiado dejan `Próximamente (P1)`. AC: Given Dueño When abre `/panel` Then tickets/stock/KPIs desde API (no `n-tickets=91` fijo). Depende de: CAT-S1, PERS-S1.

## Épica OP-E3. Higiene landing E13

- OP-S4. Reemplazar placeholders `business.ts:36-39` (`+54 11 0000 0000`, `contacto@inventario.example`), `site` prod, OG PNG <300KB, PDF espejo, dominio + Pages, `PUBLIC_FORMSPREE_FORM_ID`. AC: Given build When hay placeholder Then falla (regla E1). Depende de: nada.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Feliz | admin tenants + audit | sin demo, 403 no-admin |
| Fallo | landing con placeholder | build falla o respaldo `mailto:` |
