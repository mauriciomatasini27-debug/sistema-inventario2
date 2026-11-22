---
id: ADR-0122
tipo: adr
estado: aceptado
modulos: [dev, tenant]
depende_de: [ADR-0080, ADR-0116]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  El número de devolución `D-00000N` pasa a ser correlativo por Comercio en la Postgres compartida (ADR-0116):
  unicidad compuesta `(tenant_id, numero_devolucion)` en vez de global. Conserva formato y números ya emitidos (ADR-0080).
---
# ADR-0122 - Número de devolución correlativo por Comercio

Estado: aceptado. Fecha: 2026-11-21. Fuentes: issue #390 / ticket #393, ADR-0080, ADR-0116, migración `0054_devolucion_por_comercio`, avance P1-96. El número 0122 se usa porque ADR-0121 está reservado por la línea de venta por peso.

## Decisión

En la Postgres compartida de ADR-0116, cada Comercio numera sus devoluciones desde `D-000001` de forma independiente: dos comercios pueden emitir el mismo `D-000001` sin colisión. La tabla de devoluciones identifica al Dueño de cada fila con su Tenant (tomado de la venta vinculada) y la restricción única global del número se sustituye por una única compuesta `(tenant_id, numero_devolucion)`. La serie `devolucion` de `ticket_counters` ya era por Comercio (ADR-0080) y se siembra desde el máximo `D-*` propio de cada comercio. El formato `D-` más seis dígitos y los números ya emitidos no cambian.

## Por qué

El contador de la serie `devolucion` ya era por Comercio, pero la unicidad del número seguía siendo global. En una sola base con muchos comercios (ADR-0116), el segundo comercio chocaba al querer emitir su primer `D-000001`, ya usado por el primero. Arreglar solo el contador no resuelve el choque: hace falta mover la unicidad al mismo nivel que el contador. Correlativo y unicidad quedan así gobernados por el mismo dueño, y la operación del mostrador deja de fallar por un número ajeno.

## Alternativas descartadas

- Incrustar el identificador del Comercio en el formato (p. ej. `D-<tenant>-000001`). Cambia el comprobante impreso y rompe el formato de seis dígitos fijado en ADR-0080, sin necesidad: el dueño ya está en la fila.
- Usar una secuencia de Postgres. Deja huecos cuando la transacción revierte, mientras que ADR-0080 exige un correlativo sin huecos, además de que una secuencia global no distinguiría comercios.
- Seguir con el único global. Es el defecto actual: el primer `D-000001` de un comercio bloquea a los demás y obliga a reintentos o a números compartidos, con la consiguiente pérdida de correlación y auditabilidad por comercio.

## Consecuencias

Cada comercio tiene una serie `D-*` continua y auditable, sin huecos ni reutilización del correlativo `T-*` de ventas. Las devoluciones ya emitidas conservan su número exacto, así que no se invalidan comprobantes ni asientos anteriores. La Idempotency-Key se mantiene global (es un UUID y no está en este alcance) y el resumen del panel sigue restando solo las devoluciones del comercio. La migración es nueva, aditiva e idempotente: no se edita la que sembró originalmente la serie porque ya está aplicada. Su registro se prepara en la rama y entra en `main` solo con la autorización de Mauricio, antes del merge del PR de código.

El formato `D-` más seis dígitos lo fija ADR-0080. Su parseo aparece dos veces por diseño: la semilla SQL de `0054` (máximo por comercio con `GREATEST`) y el backfill de `src/lib/repos/ventas.ts` (cuando el comercio aún no tiene fila en `ticket_counters`). SQL y TS no comparten una abstracción de regex: son dos puntos de parseo intencionales y cambian juntos si el formato se modifica.

El Seam B ya está verificado: dos comercios emiten `D-000001` y `D-000002` sin colisión y el reenvío con la misma Idempotency-Key devuelve 409 con la original (`tests/p1-96-devolucion-api-por-comercio.test.ts`).

## Pendientes

Aplicar `0054_devolucion_por_comercio` en la base real con autorización de Mauricio y completar `aprobado_por` / `backup` en el registro.
