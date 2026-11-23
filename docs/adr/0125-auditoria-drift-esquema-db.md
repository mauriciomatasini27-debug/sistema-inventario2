---
id: ADR-0125
tipo: adr
estado: propuesto
modulos: [persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: La auditoría de esquema se hace con un chequeo automatizado que diffea la base real contra src/db/schema*.ts y drizzle/*.sql, en vez de revisión manual.
---
# ADR-0125 - Auditoría de drift de esquema automatizada

Estado: propuesto. Fecha: 2026-11-22. Fuentes: PRD-AUD-01.

## Decisión

La verificación de que la base real coincide con el esquema se hace con un script `npm run audit:db` de solo lectura, que compara la base (information_schema: tablas, columnas, tipos, defaults, índices, PK y FK) contra `src/db/schema*.ts` y `drizzle/*.sql`, y reporta drift como lista tabular con código de salida distinto de 0. No se corrige nada de forma automática.

## Por qué

La revisión manual de drift es costosa y ya falló: migraciones 0056-0059 se aplicaron tarde y tablas declaradas (P10-17/P10-19) no tienen migración. Un diff determinista de solo lectura es barato, re-corrible y no arriesga datos.

## Qué cambia

- Agrega un script de auditoría de esquema a `scripts/` (reutiliza la conexión de Supabase MCP y postgres-local).
- Los hallazgos se vuelcan en `docs/roadmap/auditorias/drift-esquema.md` y se triagean a issues.
- El script se corre en `verify` (o como paso separado) para detectar regresiones de esquema antes del merge.

## Pendientes

- Definir si el drift bloquea `verify` (fail hard) o solo avisa en la primera corrida.
- Confirmar el formato del diff y la lista de objetos comparados (incluir o no índices parciales y constraints).
