# ADR-0011 - Control plane a Panel Inventario

Estado: aceptado. Fecha: 2026-10-10. Fuente: PRD-CP-01. Respeta ADR-0006.

## Decisión

Copiar modelo Tenant, historias MVP, mora y logs de ModoOps al Panel PA solo-datos-gestión.

## Qué se adopta

Tenant con `name`, `db_name`, `slug`, `vertical`, `state activo/suspendido/baja`, vencimiento, módulos, backup y notas. Una DB aislada por cliente. Lista con vencimiento y backup. Instalar o quitar solo de catálogo con dependencias y log. Suspender con bloqueo login y reactivar. Logs con fecha, acción, usuario y resultado.

Mora con gracia 14 días según ADR-0006 PA7. Día 15 solo-lectura sin borrar (0000 F8). Precios por planes SaaS, no abono $45 (regla ModoOps). Manual en MVP y en contrato.

## Mapeo PA

Tenants a kioscos. `db_name/slug/vertical` a ficha. `state` a habilitado/bloqueado. Módulos a features. Vencimiento y backup a columnas. Acciones a botones. Logs a auditoría.

## Qué no se trae

Billing auto, editor runtime y self-service. Tampoco drill-down ni impersonación ni lectura de negocio según Ley 25.326.

## Alternativa descartada

Panel nuevo sin modelo Tenant. Se descarta porque pierde estados, mora y logs ya definidos en spec y ADR 0006/0007.
