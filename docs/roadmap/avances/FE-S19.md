---
item: FE-S19
estado: parcial
adr: ADR-0018
prd: PRD-FE-01
fecha: 2026-10-19
---
FE-S19 parcial: `POST /api/jobs/fiscal-reconciliacion` drena los comprobantes varados de cada comercio con `X-Job-Secret` y fan-out por tenant, sin esperar a una venta nueva. Llama a `rehidratar_fiscal`, que para `respuesta_incierta` consulta `FECompConsultar` antes de reenviar y reusa el mismo número, y deja retenidos los `difiere` para revisión humana. `resolverProvider` sale a `src/lib/fiscal-provider.ts` y lo comparten la ruta de emisión y el job, con ARCA real si hay cert y clave o `homo-fake` en desarrollo y tests. Falta para cerrar FE-S19 la comparación diaria de la secuencia local contra `FECompUltimoAutorizado` para detectar comprobantes emitidos fuera del sistema y el resync por 10016 con alerta. Tests en `tests/fiscal-reconciliacion-job.test.ts`: concilia una incierta, retiene un `difiere`, no toca un autorizado y la ruta exige el secreto.
