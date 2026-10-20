---
id: ADR-0104
tipo: adr
estado: propuesto
modulos: [compras, media]
depende_de: [ADR-0102, ADR-0005, ADR-0089, ADR-0028, PRD-CH-01, MOD-05-CONSUMOS-SERVICIOS, MOD-05-FACTURAS-PROVEEDORES]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  El original de cada comprobante vive en almacenamiento propio. Google Photos es un espejo
  opcional, apagado por defecto, limitado a medios creados por la app.
---
# ADR-0104 - Google Photos es un espejo opcional, no la fuente de verdad

Estado: propuesto. Fecha: 2026-10-19. Fuentes: `src/pages/api/media/upload-url.ts`, `src/offline/fotos.ts`, `docs/diseno/PRD-CH-01-canales-faltantes.md` (CH-S2), ADR-0028, ADR-0102, `docs/05-compras-servicios-pagos/consumos-servicios.md` (CS1.6).

## Decisión

1. El original de cada factura, comprobante o foto se guarda en almacenamiento de objetos propio (R2 o S3) con `sha256`, mime, tamaño y clave. Ese objeto es la fuente de verdad para OCR, visualización, auditoría y retención, se guarda cifrado en reposo y se sirve con URL firmada de vida corta. La clave lleva el prefijo del tenant y el tipo (`facturas/<tenant>/<sha256>.<ext>`); dos tenants con el mismo archivo no comparten objeto. El cableado de R2 es CH-S2 y ADR-0028; este ADR no lo duplica. Los PDFs de Gmail se suben del lado servidor y no usan el `upload-url` de fotos, que hoy acepta solo JPEG/WebP de 2 MB.
2. Google Photos es una copia opcional, apagada por defecto. Es P0 de producto según CS3, pero se implementa en la segunda ola después de Gmail. La ingesta y la facturación funcionan sin Photos.
3. La integración pide `photoslibrary.appendonly` para subir y `photoslibrary.readonly.appcreateddata` para verificar que la copia existe y obtener su URL temporal si el Dueño la abre desde la ficha. No pide `photoslibrary.readonly`, no pide sharing, no pide `edit` y no lee la biblioteca existente. La ficha muestra el original propio por defecto; la copia de Photos es secundaria. La Picker API queda fuera de alcance.
4. Photos usa un cliente OAuth propio (`GOOGLE_PHOTOS_*`) y un consentimiento propio. No comparte el grant de Gmail: si compartiera cliente, revocar Photos invalidaría también Gmail, porque el refresh token es por grant y no por fila. Cada tipo tiene su fila en `google_connections`; la conexión de Photos es única por comercio y se comparte entre caja, facturas y consumos.
5. La copia se sube a un álbum creado por la app, uno por tenant y tipo de servicio, con el patrón de CS3.2. El mapa `servicio -> album_id` se guarda en `photos_albumes` dentro de la conexión. Se guardan `photos_media_item_id` y el álbum en el registro del medio. La descripción del media item puede llevar servicio, proveedor, cuenta, vencimiento y monto; el nombre del álbum no lleva datos fiscales sensibles.
6. Si el original es PDF, se renderiza la primera página o hasta tres a JPEG en el servidor antes de subir. Si es HEIC, se convierte a JPEG para OCR y se sube la imagen convertida. El PDF original queda en el almacenamiento propio. El renderizador (pdf.js o poppler) es una dependencia nueva.
7. La subida es best effort. Si Photos falla, la factura queda guardada igual. El job reintenta con backoff; tras tres fallos, la copia queda `pendiente` y se muestra en el panel. Nunca se bloquea la confirmación de la factura ni el OCR por Photos.
8. La app no borra media items de Google. Puede leer solo los medios que creó, para verificar la copia o pedir su URL temporal cuando el Dueño la abre; nunca lee la biblioteca. Si el Dueño borra la copia desde Photos, la factura sigue completa con el original propio. Desconectar Photos revoca ese grant y detiene las copias; la conexión de Gmail sigue activa.
9. No se importan fotos existentes de la biblioteca. Los comprobantes que el Dueño quiera conservar se suben a la app, no se traen desde Photos.
10. La copia se trata como dato del tenant. El consentimiento dice que el archivo se envía a Google, que queda sujeto a la política de Google y que el Dueño puede borrarlo desde Photos sin afectar la factura.

## Por qué

- Desde los cambios de 2025, la Library API solo expone medios creados por la app. Diseñar la feature como espejo evita prometer una importación que Google ya no permite.
- El Dueño puede borrar una foto en Google. Si Photos fuera la fuente de verdad, se perdería el respaldo de una factura.
- La retención y la auditoría son obligaciones del producto. Depender de un tercero para el original agrega un riesgo que no se puede controlar.
- Pedir solo scopes de medios creados por la app reduce el daño de un token filtrado y simplifica la revisión de Google.
- Un cliente y un consentimiento propios de Photos permiten desconectar Photos sin tocar Gmail y evitan pedir permisos de Photos a quien solo quiere conectar Gmail.

## Qué cambia

- Se cablea el almacenamiento propio de medios y se guarda el registro del original, hoy stub en `src/pages/api/media/upload-url.ts`, con prefijo por tenant y PDF hasta 10 MB.
- Cliente de Photos con cliente OAuth propio, creación de álbum por tipo de servicio, render de PDF a JPEG y subida.
- UI de opt-in por tenant, apagada por defecto, y panel de estado de la copia.
- Campos de Photos en `google_connections` (`photos_albumes`) y en el registro del medio.
- Tests con un fake de Photos para los caminos de éxito, cuota, token revocado y borrado en Google.
- No cambia la ingesta de Gmail ni el pipeline de OCR.

## Pendientes

- Confirmar que `photoslibrary.appendonly` y `photoslibrary.readonly.appcreateddata` son los scopes vigentes en 2025 y alcanzan para crear álbumes, subir y verificar medios.
- Definir el renderizador de PDF a JPEG (pdf.js o poppler) y el límite de páginas.
- Credenciales y bucket de R2, y la tabla o columnas del registro de medios.
- Confirmar si la verificación de Photos requiere CASA o solo revisión de la app.
- Definir retención, borrado y exportación de los originales, y la referencia a la Ley 25.326.
- Texto del opt-in y del consentimiento de Photos.
