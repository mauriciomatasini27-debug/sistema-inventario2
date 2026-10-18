---
item: PLAN-S4
estado: hecho
adr: ADR-0047
prd: PRD-PLAN-01
fecha: 2026-10-18
---
PLAN-S4 hecho: `POST /api/plan/cambiar` (solo Dueño) programa la baja a fin de período en `plan_programado` sin reintegro y fija `hasta` con la fecha en que rige (`hasta` vigente o el próximo aniversario mensual de `desde` en fecha AR, `src/modules/planes/ciclo.ts`); decisión: el cambio se ancla en `hasta` al programarlo para que `leerSuscripcionActiva` ruede el plan vigente al llegar esa fecha aunque nadie lea ese día (sin job; persistencia best-effort, el ciclo nuevo arranca ese día), el mismo plan cancela el programado, subir responde 409 `requiere_cobro` hasta que PLAN-S3 defina el cobro (P9-5) y `/panel/plan` muestra "Tu plan pasa a … el DD/MM/AAAA".
