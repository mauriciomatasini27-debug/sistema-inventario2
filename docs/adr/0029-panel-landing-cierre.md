---
id: ADR-0029
tipo: adr
estado: aceptado
modulos: [admin, landing, tenant]
depende_de: [ADR-0006, PRD-OP-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Cerrar admin (tenants, suspender|reactivar, rollouts/reintentar, audit, tablas
  platformadmins/migrationrollouts/infrahosts/tenantdailyusage), panel comercio (adiós n-tickets=91 fijo y
  Próximamente P1) y landing E13 (placeholders, site prod, OG PNG, PDF espejo, dominio, Formspree).
---
# ADR-0029 - Cierre paneles y landing

Estado: aceptado (2026-10-12, evidencia: `src/pages/api/admin/tenants.ts`). Fecha: 2026-10-11. Fuentes: ADR-0006/0020/0022, `src/pages/admin.astro:4-6`, `src/pages/panel.astro:204-230`, `src/data/business.ts:36-39`.

## Decisión

Cerrar admin (`tenants`, `suspender|reactivar`, `rollouts/reintentar`, `audit`, tablas `platform_admins/migration_rollouts/infra_hosts/tenant_daily_usage`), panel comercio (adiós `n-tickets=91` fijo y `Próximamente P1`) y landing E13 (placeholders, `site` prod, OG PNG, PDF espejo, dominio, Formspree). PRD: `diseno/PRD-OP-01-panel-cierre-landing.md`.

## Por qué

Hoy admin declara `resto es demo`, panel hardcodea KPIs y landing bloquea ship por E13-R1.

## Qué cambia

Endpoints admin reales + 403 no-admin auditado; `/panel` desde API; `business.ts` sin `0000`/example.

## Alternativa descartada

Mantener demos: se descarta porque viola "cero 404" funcional (placeholder explícito ≠ funcional).

## Pendientes

OP-S1→S4 + regla build falla con placeholder.
