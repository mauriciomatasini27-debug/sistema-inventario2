---
item: PLAN-S3
estado: hecho
adr: ADR-0047
prd: PRD-PLAN-01
fecha: 2026-10-24
---
PLAN-S3 hecho: `POST /api/plan/cambiar` sube el plan al instante solo si el BillingProvider devuelve cobro `confirmado` (falso en tests, pendiente por defecto); el prorrateo es la diferencia de precio por los días restantes de un ciclo de 30 anclado en `desde` (Básico a Plus el día 10 de 30 son 1333 centavos USD, 20/30), `planIncluye` enciende los módulos del destino y se limpia `plan_programado`. Sin confirmación, tampoco un campo `cobro` en el body, sigue 409 `requiere_cobro` y la suscripción no cambia; empleado 403; otro tenant intacto. No llama a Mercado Pago.
