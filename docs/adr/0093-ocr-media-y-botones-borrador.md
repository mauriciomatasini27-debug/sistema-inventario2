---
id: ADR-0093
tipo: adr
estado: aceptado
modulos: [ocr, compras, bot]
depende_de: [ADR-0005, ADR-0089, ADR-0079, ADR-0091]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0005]
modificado_por: [ADR-0095]
resumen: |
  La media del comprobante de WhatsApp se descarga en el borde del webhook con las credenciales del número
  central, y el motor OCR recibe bytes y no una referencia. El borrador se ofrece con tres botones: Descartar
  cierra al toque, y Confirmar y Editar derivan a la web.
---
# ADR-0093 - Ingesta de media de WhatsApp y toque de botones del borrador OCR

Estado: aceptado. Fecha: 2026-10-18. Aprobado por Mauri el 2026-10-18. Fuentes: ADR-0005 (pipeline OCR y botones), ADR-0089 (motor PaddleOCR), ADR-0079 (jobs y eventos OCR), ADR-0091 (número central), `docs/02-identidad-onboarding/autenticacion-gestion-usuarios.md` (AU10.4), PRD-OCR-01 (OCR1-S5), PRs #181 y #182.

## Decisión

El webhook de la Cloud API es el borde que reconoce el comprobante. `normalizarAdjuntoEntrada` detecta `image` o `document`, valida el mime y, si el adjunto no es comprobante, responde 415 sin crear job. El borde descarga el media con las credenciales del número central (`descargar_media`, dos saltos, metadata y binario) y entrega los bytes al motor OCR como `ImagenOcr` (base64 más mime). El motor nunca recibe una URL ni una referencia. El job, el borrador y el evento conservan `wa-media:<id>` como referencia de auditoría.

El borrador se ofrece como un `interactive` de tres botones con ids `ocr:<acción>:<borradorId>` que arma la función pura `payload_borrador_ocr`. Descartar cierra el borrador al toque desde el número dueño y emite `ocr_descartado`. Confirmar y Editar derivan a la web. El flujo de edición por texto de ADR-0005 queda pendiente.

## Por qué

El motor vive detrás de una frontera de bytes. ADR-0005 ya previó "OCR sobre bytes WA" y separa la ingesta de la subida a Photos. Si el borde descarga el media, el motor queda sin credenciales de Meta y sin acceso a red, y el id de WhatsApp es la única llave de auditoría. El mime se valida antes de descargar, así que un adjunto que no es comprobante no gasta una llamada a Meta ni crea job (E3).

Los botones separan lo reversible de lo sensible. Descartar no toca dinero ni registros fiscales, así que vive en el bot. Confirmar registra un comprobante y Editar cambia montos. Para esas dos el bot manda a la web, en línea con AU10.4, que reserva las acciones sensibles a la web.

## Qué cambia

- `src/modules/ocr/imagen.ts`: nuevo `ImagenOcr { bytes, mimeType }` y `MAX_BYTES_IMAGEN`.
- `src/modules/ocr/motor.ts`: `MotorOcr.extraer` recibe `ImagenOcr` y el cliente Paddle manda `{ imagen_base64, mime_type }`.
- `src/modules/whatsapp/cliente-cloud.ts`: `descargar_media` con dos saltos, Bearer, timeout, exigencia de `https:` en el segundo salto, y sin lanzar.
- `src/modules/whatsapp/transport.ts`: `descargarMedia` en el transporte y `normalizarBotonEntrada` para el botón.
- `src/modules/whatsapp/ocr-borrador.ts`: `payload_borrador_ocr`, `parsear_boton_ocr` y las respuestas de error.
- `src/pages/api/whatsapp/webhook.ts`: detecta el adjunto, descarga el media y despacha el toque de botón después de la puerta de identidad.
- Tests: `tests/ocr-media-descarga.test.ts` y `tests/ocr1-s5-botones.test.ts`.

## Alternativa descartada

Que el motor descargue el media obliga a darle credenciales de Meta o a exponer un proxy, y mete red dentro del paso puro de OCR. Responder 415 después de descargar gasta una llamada a Meta por cada adjunto que no es comprobante. Confirmar el comprobante desde el bot choca con AU10.4 para un registro con efecto contable.

## Consecuencias

El motor queda puro sobre bytes y se testea sin red. La media se baja una vez en la request, sin cola, así que el acuse y el borrador caen dentro del SLA si Meta responde. Si la descarga falla, el bot pide reintento y no crea job, así que no hay borrador huérfano. La edición por texto es el único tramo del bot que falta para cerrar OCR1-S5.

## Pendientes

Edición por texto (ADR-0005). Pull real de Gmail por `history.list` con OAuth. Prueba en vivo del número central (P9-3).

## Evidencia de aceptación (2026-10-18)

- PR #181 (media) y PR #182 (botones) squash-mergeados a `main`.
- `npm run verify` exit 0 sobre el head rebasado de #182, con 236 archivos de test y 2021 tests.
- `tests/ocr-media-descarga.test.ts` cubre el mime, el `content-length`, el segundo salto `https:` y el transporte falso. `tests/ocr1-s5-botones.test.ts` cubre descartar, confirmar, editar, id inválido, borrador inexistente, doble toque y dedup.
