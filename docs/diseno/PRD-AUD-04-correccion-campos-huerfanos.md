---
id: PRD-AUD-04
tipo: prd
estado: propuesto
modulos: [caja, inventario, fiado, fiscal, persistencia]
depende_de: [ADR-0127, ADR-0129]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Corrige los 5 campos huérfanos de la trazabilidad ADR-0127 (caja, stock, servicios, fiscal) aplicando la política de ADR-0129: persistir, aceptar en memoria o quitar.
---
# PRD-AUD-04 - Corrección de campos huérfanos (ADR-0127)

Fuente: hallazgos de ADR-0127. Restringido por ADR-0129.

## Problema

La trazabilidad de ADR-0127 marcó 5 campos huérfanos: la pantalla los manda (o los
configura) pero no llegan a ninguna columna, o solo viven en memoria. Hay que decidir,
bajo ADR-0129, cuáles se persisten, cuáles se aceptan en memoria y cuáles se quitan.

## Épica AUD-E4. Cerrar los huérfanos de la trazabilidad

Requisito AUD-R4: ningún campo huérfano de la primera pasada queda sin resolver bajo ADR-0129.

- Historia AUD-FIX-S3. Caja: persistir la nota del movimiento (#476). AC: Given un movimiento
  de caja con nota When se guarda y se relee Then la nota vuelve de una columna. ADR: 0129. Talla S.
- Historia AUD-FIX-S4. Stock: persistir "controla vencimiento" del alta (#477). AC: Given un
  producto con control de vencimiento When se guarda y se relee Then el flag vuelve de una columna.
  ADR: 0129. Talla S.
- Historia AUD-FIX-S5. Stock: resolver `permisos[]` del alta (#478). AC: Given el alta de producto
  When manda permisos Then se persisten o se quitan del payload con justificación. ADR: 0129. Talla S.
- Historia AUD-FIX-S6. Servicios: persistir alias, email de origen y día de vencimiento (#479).
  AC: Given una cuenta de servicio When se crea con alias/email/día Then se releen de columnas.
  ADR: 0129. Talla S.
- Historia AUD-FIX-S7. Fiscal: decidir el modo de primera factura en memoria (#480). AC: Given el
  modo When se elige Then se persiste o se acepta en memoria con justificación. ADR: 0129. Talla S.

## Decisiones de implementación (2026-11-23)

Aprobadas por Mauri:

- S3: persistir `cash_movements.nota`.
- S4: persistir `products.controla_vencimiento`.
- S5: quitar `permisos[]` del payload de alta; no tenía consumidor y los permisos se resuelven desde la sesión.
- S6: persistir alias, email de origen y día de vencimiento en `service_accounts`; el schema ya los tenía, la UI ahora los manda.
- S7: persistir `fiscal_wizard.modo_primera_factura`.

La migración es `0061_campos_huerfanos` para S3, S4 y S7. S5 no lleva columna y S6 no necesitó migración.

## Dependencias externas

Migraciones nuevas para los hallazgos "persistir": aprobadas por Mauri y registradas en
`docs/roadmap/migraciones/<tag>.json` (ADR-0112).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Campo persistido | guardar + releer | el valor vuelve de la columna |
| Feliz | Campo en memoria | guardar + releer | justificación documentada en el issue |
| Fallo | Columna sin declarar | check:columnas | 0 hallazgos tras la migración |
