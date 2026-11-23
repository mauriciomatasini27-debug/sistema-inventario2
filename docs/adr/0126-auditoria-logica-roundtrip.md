---
id: ADR-0126
tipo: adr
estado: propuesto
modulos: [persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: La lógica se verifica con un check estático de columnas referenciadas y tests de round-trip por módulo, no con revisión a ojo del código.
---
# ADR-0126 - Auditoría de lógica por round-trip y check de columnas

Estado: propuesto. Fecha: 2026-11-22. Fuentes: PRD-AUD-02.

## Decisión

La lógica código ↔ base se verifica en dos capas: (1) un check estático que confirma que cada tabla o columna referenciada en `src/` (repos y queries) existe en `src/db/schema*.ts`; (2) tests de round-trip por módulo crítico que insertan, leen y comparan un registro sin pérdida de datos ni de tipos.

## Por qué

El código puede compilar y aun así referenciar columnas que no existen en la base, o escribir campos que después no se leen. Comparar solo el esquema (ADR-0125) no cubre qué hace el código con ese esquema. El round-trip es la evidencia mínima de que un dato sobrevive el camino completo.

## Qué cambia

- Agrega un check de referencias estático a `scripts/` y lo suma a `verify`.
- Agrega tests de round-trip para los módulos críticos (ventas, caja, inventario, fiado, fiscal) sobre Postgres de test A/B.
- Los hallazgos se triagean a issues con el módulo afectado.

## Pendientes

- Definir la lista exacta de módulos críticos de la primera pasada.
- (Resuelto en AUD-S3) El check estático falla `verify` ante una referencia inexistente; ver abajo.

## Implementación (AUD-S3)

- `npm run check:columnas` entra en `verify` (paso `columnas`, después de `arch`): **falla** ante una referencia a tabla o columna que no exista en `src/db/schema*.ts`, y nombra `archivo:línea`. Con el árbol actual da 0 hallazgos sobre 612 archivos y 126 tablas. Falta sumarlo a `.github/workflows/ci.yml`, que hoy es manual-only: el token del agente no tiene scope `workflow`.
- Alcance: SQL crudo de `src/`, no las queries de Drizzle (esas ya las valida `tsc`). Resuelve las interpolaciones `${tabla}` y `${tabla.propiedad}` a `"tabla"` y `"tabla"."columna"` contra los exports del schema, y parsea las sentencias completas: tabla de `from|join|into|update`, columnas calificadas por alias, lista de columnas del `insert`, destinos del `set` y columnas sin calificar cuando la sentencia toca una única tabla real.
- Lo que no cubre, a propósito para no dar falsos positivos: columnas sueltas dentro de un fragmento (`sql\`estado = 'pendiente'\`` armado con `sql.join`; las interpolaciones de columnas del schema en ese fragmento sí se validan), fuentes que son CTE (`from ranked`), joins con columnas sin calificar (ambiguas) y SQL armado en runtime con `sql.raw`.
- Los `sql\`` de `src/db/schema*.ts` no se escanean: ese archivo es la referencia.
- Lógica pura en `scripts/check-columnas-lib.mjs` con tests en `tests/check-columnas.test.ts`; el CLI solo recorre archivos y arma la salida.

