---
id: ADR-0123
tipo: adr
estado: aceptado
modulos: [pagos, servicios]
depende_de: [ADR-0003, ADR-0116]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Las claves de dedupe de ingesta y pago pasan de ser únicas en toda la base a únicas dentro de un Tenant (Comercio).
  Dos comercios pueden usar el mismo message_id, numero o idempotency_key; un mismo comercio no los repite.
---
# ADR-0123 - Unicidad por comercio de claves de ingesta y pago

Estado: aceptado. Fecha: 2026-11-22. Fuentes: ADR-0003, ADR-0103, ADR-0116, 0051 (GGL-P240), P1-81, ítem «Unicidad por comercio de utility_bills.message_id, payment_orders.numero, idempotency_key».

## Decisión

`utility_bills.message_id`, `payment_orders.numero` y `payment_orders.idempotency_key` dejan de ser únicos en toda la base y pasan a ser únicos dentro de un Tenant (Comercio). `siguienteNumero` calcula la secuencia `OP-####` por comercio, con el mismo formato de siempre. La respuesta ante un duplicado dentro del comercio sigue siendo 409; no cambia el contrato de las APIs.

Las filas legadas cuyo comercio no se puede resolver se backfillean cuando hay una fuente inequívoca; para el resto se mantiene la protección **entre ellas** con un índice único parcial (`WHERE tenant_id IS NULL`): dos filas sin comercio no pueden repetir la clave, pero una fila sin comercio y una con comercio sí pueden compartirla. `email_ingestion_log.message_id` queda fuera de alcance: no tiene `tenant_id` y meterlo exigiría agregar y backfillear una columna nueva.

## Por qué

En el modelo de una Postgres compartida (ADR-0116) el aislamiento es el filtro por Tenant (Comercio), y las claves con unicidad global de ADR-0003 quedaron chicas: ya hay precedentes de dos tenants con el mismo `message_id` en la cola de Gmail (0051) y de numeración propia por comercio (P1-81). Mantener globales estas tres claves impediría ese caso y forzaría una secuencia de `numero` compartida entre comercios.

## Alternativa descartada

Mantener los índices globales y prefijar las claves con el comercio. Se descarta porque `message_id` viene de Gmail y `numero` es un correlativo visible: cambiar su forma toca integraciones y comprobantes, cuando el cambio de alcance se resuelve en la restricción.

## Qué cambia

Las frases de ADR-0103 que afirman que `message_id` sigue siendo único (líneas 24 y 48) quedan sin efecto para `utility_bills`, sin editar ese ADR. El GLOSSARY incorpora «Unicidad por comercio». La implementación lleva la migración `0055_unicidad_por_comercio` con su JSON de registro: 0054 ya fue mergeado en `main` por P1-96.

## Pendientes

- `email_ingestion_log.message_id` sigue con unicidad global y sin `tenant_id`: deuda registrada, fuera de este ítem.
