---
id: ADR-0117
tipo: adr
estado: propuesto
modulos: [tenant, tenant-context]
depende_de: [ADR-0051, ADR-0052, ADR-0065, ADR-0116]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Unificar tenant-mode + tenant-scope en un módulo tenant.ts con modo inyectable; ocultar flags tras comportamiento; mantener tenant-context (HTTP/jobs) como adapter; shim temporal para back-compat.
---

# ADR-0117 - Módulo de resolución de tenant

Estado: propuesto. Fecha: 2026-11-18. Fuentes: improve-codebase-architecture candidate 1, grilling.

## Decisión

1. Unificar `tenant-mode.ts` y `tenant-scope.ts` en un solo módulo `src/lib/tenant.ts`. `tenant-context.ts` permanece separado (adapter HTTP/jobs) porque importa `control`/`store` y existe riesgo de ciclo.
2. El módulo oculta los flags de modo (`esModoMulti`, `esModoShared`, `esModoAisladoPorTenant`, `esSingle`) y expone solo comportamiento: `tenantIdAlSellar`, `dondeTenant`, `filaConTenant`, `tenantIdShared`, `tenantUuidMulti`, `conTenant`, `tenantActual`, `tenantPorDefecto`.
3. El modo se inyecta vía un tipo `ModoTenant = { esModoMulti, esModoShared, tenantPorDefecto }` con default `leerVarEntorno(process.env)`, para que los tests no muten `process.env`.
4. AsyncLocalStorage se mantiene interno (hidden); no se propaga el tenant por parámetro a los ~40 repos.
5. `PREFIJOS_DATOS`, `gateTenantDatos`, `gateJob`, `esRutaDatos` se quedan en `tenant-context.ts`; `esSingle()` delega al core.
6. Back-compat: `tenant-mode.ts` y `tenant-scope.ts` quedan como shim (`export * from "./tenant.js"`) en este PR; su eliminación va en un PR posterior.
7. Tests unitarios en `tests/tenant.test.ts` cubren los 3 modos por inyección, sin mutar env.
8. Glosario: se agrega el término "Tenant (Comercio)".

## Por qué

- El concepto "tenant" no tiene un dueño: entenderlo requiere saltar entre 3 módulos shallow cuyas interfaces son casi tan complejas como su implementación.
- ~40 repos importan funciones de resolución directamente; la lógica de modo queda dispersa en cómo se llaman.
- No hay tests unitarios del tenant; solo integration tests que mutan `process.env`.
- El bug más caro en un sistema multi-tenant es mezclar datos entre comercios; concentrar la lógica reduce ese riesgo.
- Hacer el contrato compiler-enforced (interface clara) en vez de convención es el mayor salto de calidad para agentes (ADR-0065).

## Qué cambia

- Nuevo `src/lib/tenant.ts` (módulo deep).
- `tenant-mode.ts` y `tenant-scope.ts` pasan a shim (`export *`).
- `tenant-context.ts` consume el core (sin cambios de interface pública).
- Nuevo `tests/tenant.test.ts`.
- `GLOSSARY.md` gana "Tenant (Comercio)".
- ADR-0117 (este).

## Pendientes

- Eliminar los shims en un PR posterior una vez que todos los callers importen de `tenant.ts`.
- Evaluar migración a tenant explícito por parámetro (fuera de scope de este ADR).