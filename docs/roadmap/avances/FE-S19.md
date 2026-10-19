---
item: FE-S19
estado: hecho
adr: ADR-0018
prd: PRD-FE-01
fecha: 2026-10-19
---
FE-S19 hecho: `POST /api/jobs/fiscal-reconciliacion` drena los comprobantes varados de cada comercio con `X-Job-Secret` y fan-out por tenant, sin esperar a una venta nueva. Llama a `rehidratar_fiscal`, que para `respuesta_incierta` consulta `FECompConsultar` antes de reenviar y reusa el mismo número, y deja retenidos los `difiere` para revisión humana. Después compara cada secuencia local contra `FECompUltimoAutorizado` y reporta en `fuera_del_sistema` los comprobantes que salieron por fuera, con `puntoVenta`, `cbteTipo`, `local`, `remoto` y `faltantes`; el próximo número de emisión ya salta ese hueco, pero el Dueño ve el desvío. `resolverProvider` sale a `src/lib/fiscal-provider.ts` y lo comparten la ruta de emisión y el job, con ARCA real si hay cert y clave o `homo-fake` en desarrollo y tests. Tests en `tests/fiscal-reconciliacion-job.test.ts`: concilia una incierta, retiene un `difiere`, no toca un autorizado, reporta un hueco contra el remoto y la ruta exige el secreto.
