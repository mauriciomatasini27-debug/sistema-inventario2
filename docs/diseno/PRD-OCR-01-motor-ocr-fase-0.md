---
id: PRD-OCR-01
tipo: prd
estado: en curso
modulos: [ocr, compras]
depende_de: [ADR-0005, ADR-0089, PRD-PERS-04]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Plan de Fase 0 del motor OCR. Corre el benchmark que cierra P9-1 y enciende el pipeline de facturas de
  proveedores sobre el motor real. Historias OCR1-S1 a OCR1-S5.
---
# PRD-OCR-01 - Motor OCR de Fase 0: benchmark y encendido

Fuente: ADR-0005, ADR-0089, `docs/05-compras-servicios-pagos/facturas-proveedores.md` (FP1-FP12), `docs/01-fundacion/costos-por-cliente.md` (costos OCR), `src/modules/ocr`, ADR-0079. Restringido por ADR-0005 y ADR-0089. Fecha extracción: 2026-10-18.

## Problema

El pipeline de OCR y el job existen y el cliente PaddleOCR ya está cableado (`src/modules/ocr/motor.ts`, `src/lib/ocr-ingesta.ts`). OCR1-S4 y OCR1-S5 (canal WhatsApp en app) están hechos en repo; OCR1-S3 sigue parcial hasta corpus/endpoints del piloto (issue #70). E2E con Meta (#60) y Gmail verificado en producción dependen de credenciales externas.

## Épica OCR1-E1. Benchmark de Fase 0

Requisito OCR1-1: el motor se enciende solo con los dos números de ADR-0089 medidos y registrados.

- Historia OCR1-S1. Armar el set de comprobantes del piloto. AC: Given 30 a 50 comprobantes de kioscos reales con campos esperados When armo el set Then cada archivo tiene emisor, fecha, total y CUIT de referencia. ADR: 0005. Talla M. Depende de: nada.
- Historia OCR1-S2. Medir tiempo por imagen en CPU. AC: Given el set sobre una CX22 o CX33 When corro el benchmark Then el promedio queda entre 3 y 4 s por imagen y el resultado se guarda con fecha y máquina. ADR: 0089. Talla S. Depende de: OCR1-S1.
- Historia OCR1-S3. Medir tasa de acierto por campo. AC: Given el set When comparo la salida contra el valor de referencia Then la tasa por campo y la global quedan registradas, y si la global queda bajo 80% documento el motivo por emisor. ADR: 0089. Talla M. Depende de: OCR1-S2.
- Historia OCR1-S4. Verificar el fallback de baja confianza. AC: Given un comprobante con foto borrosa When la confianza global queda bajo 0.6 Then el job marca la nube como opción y el borrador queda `pendiente`. ADR: 0005. Talla S. Depende de: OCR1-S3.

## Épica OCR1-E2. Encendido del pipeline de facturas

Requisito OCR1-2: con el benchmark verde, el borrador y la confirmación de un toque funcionan sobre el motor real.

- Historia OCR1-S5. Borrador desde WhatsApp y Gmail. AC: Given un comprobante recibido por WhatsApp When el job corre Then guarda el borrador con confianza por campo y lo ofrece con [Confirmar] [Editar] [Descartar] en menos de 20 s. ADR: 0005. Talla M. Depende de: OCR1-S4, PERS-04.

## Dependencias externas

Mauri aporta el set de comprobantes desde los comercios del piloto (issue #70). La máquina CX22 o CX33 está disponible para el benchmark. E2E del borrador por WhatsApp con el número central Meta (issue #60) y Gmail OAuth verificado (PRD-GMAIL-01 / credenciales Mauri) no bloquean el cierre del slice en código; ver `docs/roadmap/avances/OCR1-S5.md`.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Comprobante nítido | Foto de factura de kiosco | Borrador con confianza global mayor a 0.6 |
| Fallo | Foto borrosa | Imagen desenfocada | Confianza bajo 0.6, fallback ofrecido |
| Fallo | Adjunto no comprobante | Foto de un producto | 415, sin job |
| Regresión | Repetición | El mismo wamid dos veces | Un solo job |

Arch-tests: AT1 el job de OCR es idempotente por wamid o message-id. AT2 ninguna salida expone la clave del proveedor de nube.
