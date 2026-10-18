---
id: ADR-0089
tipo: adr
estado: aceptado
modulos: [ocr, compras]
depende_de: [ADR-0005]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Ratifica PaddleOCR PP-OCRv5 autohospedado como motor primario de Fase 0 y cierra P9-1. Fija la puerta de
  benchmark que habilita encenderlo y el umbral 0.6 para caer a Vision o Textract.
---
# ADR-0089 - Proveedor OCR definitivo de Fase 0

Estado: aceptado. Fecha: 2026-10-18. Aprobado por Mauri el 2026-10-18. Fuentes: ADR-0005 (OCR Fase 0, motor y pipeline), `docs/01-fundacion/costos-por-cliente.md` (costos por cliente, PaddleOCR y nube), `docs/05-compras-servicios-pagos/facturas-proveedores.md` (FP1-FP12), P9-1.

## Decisión

PaddleOCR PP-OCRv5 autohospedado sigue como motor primario de Fase 0, igual que ADR-0005. Vision o Document AI y Textract quedan como fallback de baja confianza, nunca como primario. Encender el motor productivo deja de estar bloqueado cuando el benchmark de PRD-OCR-01 cumple sus dos metas.

La puerta de encendido tiene dos números. El OCR resuelve un comprobante típico en 3 a 4 segundos por imagen en una Hetzner CX22 o CX33 de CPU. La tasa de acierto por campo llega al 80% o más en el set de comprobantes del piloto. Si la tasa queda por debajo del 80%, se sube el umbral de fallback de 0.6 a 0.7 sin cambiar de primario, como ADR-0005 previó.

## Por qué

ADR-0005 ya eligió PaddleOCR y descartó la nube como primario por costo por imagen y por privacidad, porque la factura no sale a un tercero. P9-1 quedó abierto porque el docx de facturas deja el motor como [a verificar] para Fase 0 y nadie corrió el benchmark. Esta ADR cierra la verificación con un criterio medible en lugar de dejar la elección abierta.

La nube cobra por imagen y manda datos del comercio afuera. Ese costo crece con el volumen y no tiene techo por cliente. PaddleOCR es Apache 2.0, corre en el servidor que ya se paga y no agrega costo por imagen.

## Qué cambia

Nada de código todavía. Al aprobarse, P9-1 pasa de bloqueado a un ítem de implementación cubierto por PRD-OCR-01. El job de OCR (`src/modules/ocr`) queda habilitado para correr contra el motor real en lugar del fake de tests.

## Pendientes

Correr el benchmark de PRD-OCR-01 en la CX22 o CX33 del piloto y registrar los dos números. Verificar la versión vigente de PP-OCRv5 y el peso del modelo en disco. Si el benchmark falla la meta de tiempo, evaluar una CX43 antes de mover el umbral.
