---
id: ADR-0103
tipo: adr
estado: aceptado
modulos: [compras, ocr]
depende_de: [ADR-0102, ADR-0005, ADR-0089, MOD-05-CONSUMOS-SERVICIOS]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  La ingesta combina users.watch con Pub/Sub y history.list como fuente autoritativa, con polling
  de respaldo, filtros por remitente y procesamiento idempotente por mensaje.
---
# ADR-0103 - Ingesta de Gmail por watch y history.list

Estado: aceptado (2026-10-19, evidencia: `src/jobs/gmail.ts`, `gmail-sync.ts`, `src/pages/api/gmail/webhook.ts`, `src/lib/repos/gmail-*.ts`, migración `0031_gmail_ingestion`, tests `tests/gmail-*.test.ts`). Fecha: 2026-10-19. Fuentes: `src/pages/api/gmail/watch.ts`, `src/pages/api/gmail/webhook.ts`, `src/modules/utilities/ingesta_gmail.ts`, `src/db/schema-servicios.ts`, `src/modules/ocr/motor.ts`, ADR-0102, ADR-0096, `docs/05-compras-servicios-pagos/consumos-servicios.md` (CS1.4 a CS1.8).

## Decisión

1. Cada conexión de Gmail registra `users.watch` contra un topic de Pub/Sub, con `labelIds=["INBOX"]` o la etiqueta opcional que elija el Dueño. La respuesta guarda `watch_history_id` y `watch_expira_at`. El watch se renueva cada 24 horas, aunque dura hasta 7 días, para tener margen ante un fallo. La renovación no pisa `gmail_history_cursor`, que es el último historial procesado.
2. El push de Pub/Sub llega a `POST /api/gmail/webhook` con el sobre real `{message:{data, messageId, publishTime}, subscription}`. El `data` es base64 de `{emailAddress, historyId}`. La ruta decodifica, valida el token OIDC y encola el trabajo. Responde 204 rápido; si el encolado falla, responde 500 para que Pub/Sub reintente. El `messageId` del sobre se usa para deduplicar entregas.
3. El token OIDC se verifica con `jose` y el JWKS de Google. Se exige firma válida, `issuer` de Google, `audience` igual a `GMAIL_PUBSUB_AUDIENCE`, `email` igual a `GMAIL_PUBSUB_EMAIL` y `email_verified=true`. Sin esa configuración, producción falla cerrado. El `state` compartido de la URL no reemplaza la firma.
4. Como Pub/Sub entrega al menos una vez, el trabajo es idempotente. En P0 la unidad es el mensaje: `utility_bills.message_id` sigue único y un correo produce una factura. `utility_bills` suma `canal` y `gmail_attachment_id` para trazabilidad. Si un correo trae varios adjuntos, se procesa el primero válido y el log del mensaje registra cuántos se ignoraron, sin contenido. La facturación por adjunto es P1 y requiere cambiar `procesar_email`.
5. La fuente autoritativa es `users.history.list` con `startHistoryId` guardado, `historyTypes=messageAdded`, `labelId` y paginación. `history.list` no acepta `q`: el filtro por remitente se hace con `messages.get` en `format=metadata` antes de descargar el adjunto. El cursor avanza solo cuando se procesaron todas las páginas. Si Gmail responde 404 porque el historial es viejo, se lee `users.getProfile`, se hace una ventana de recuperación de 30 días y se fija el cursor nuevo. La conexión inicial usa 90 días, configurable entre 0 y 12 meses.
6. Además del push, un polling cada 15 minutos corre `history.list` para las conexiones sin push reciente, con jitter, backoff y manejo de 429. Si el watch venció o falló tres renovaciones, la conexión queda `error`, se avisa al Dueño y el polling sigue hasta que reconecte.
7. El webhook resuelve el tenant con una tabla de control `gmail_watch_routes`, que guarda solo `HMAC-SHA-256(cuenta_email normalizada, GMAIL_ROUTE_PEPPER)`, `tenant_id`, `connection_id` y `activo`. No guarda la dirección en claro, ni tokens, ni contenido. En el MVP una casilla activa no puede estar en dos comercios; el índice único lo impide. Si no hay ruta activa, descarta y audita.
8. Antes de descargar se aplican los filtros de `email_ingestion_filters` por remitente o dominio y keywords. Un mensaje que no matchea solo deja id, dominio y decisión en `email_ingestion_log`; no se descarga su cuerpo ni su adjunto. La consulta `q` solo se usa en `messages.list` para la ventana inicial; no es la validación.
9. Se aceptan adjuntos `application/pdf`, `image/jpeg`, `image/png`, `image/webp` y `image/heic`, hasta 10 MB. El mime se valida por magic bytes, no solo por `Content-Type`. HEIC se convierte a JPEG para OCR. Se rechazan ejecutables, archivos comprimidos, HTML y PDFs protegidos. El nombre del archivo se normaliza y nunca se usa como ruta.
10. El adjunto se procesa con el pipeline existente: `extraer_comprobante` para el texto de PDF, OCR o cuerpo, `resolver_extraccion` si hace falta el motor y `procesar_email` para clasificar, crear el borrador y registrar el log. El borrador guarda `canal="gmail"` y el `origen` de extracción (`pdf_digital`, `ocr` o `email_respaldo`), no un `origen="gmail"` inexistente en el dominio. Si no hay cuenta de servicio, el borrador se guarda en `email_ingestion_drafts` con `account_id` nulo y no se persiste en `utility_bills` hasta que el Dueño elija una. Nunca se confirma una factura ni se crea un egreso sin acción del Dueño.
11. Los correos sin adjunto pero con datos de factura en el cuerpo se procesan con `extraer_comprobante` usando el cuerpo como respaldo, confianza baja y una imagen saneada del cuerpo como comprobante. No se siguen links ni se inicia sesión en sitios de terceros.
12. Las facturas de proveedores por Gmail no entran en este ADR. ADR-0096 deja el email fuera de ese flujo; si se habilita, necesita un ADR que cambie ese alcance y un routing explícito. El log y la idempotencia se reutilizan, pero no se promete el flujo en P0.
13. Cada mensaje procesado deja una fila en `email_ingestion_log` por `message_id` con decisión y motivo, sin contenido. Los cambios de filtros y los errores de conexión dejan eventos en `gmail_connection_events`. La cola y los jobs no guardan asunto, cuerpo ni remitente en claro.

## Por qué

- `users.watch` da latencia baja y `history.list` da exactitud. Juntos cubren pushes perdidos y reinicios.
- El polling de respaldo evita el silencio cuando Pub/Sub o el watch fallan, que es el modo de falla más caro para el Dueño.
- La idempotencia por mensaje es obligatoria con entrega al menos una vez y con reintentos; la unidad por adjunto queda para P1 cuando el dominio la soporte.
- Filtrar antes de descargar ahorra cuota, memoria y exposición de datos.
- El log sin contenido cumple CS11.3 y reduce el daño de una filtración.
- Resolver el tenant por una tabla de control con hash evita cruzar comercios y no obliga a guardar direcciones en claro.

## Qué cambia

- Se reemplazan los stubs de `watch.ts` y `webhook.ts` por rutas reales con OIDC, encolado y auditoría.
- Nuevas variables `GMAIL_PUBSUB_TOPIC`, `GMAIL_PUBSUB_AUDIENCE`, `GMAIL_PUBSUB_EMAIL` y `GMAIL_ROUTE_PEPPER`.
- Migración con `gmail_watch_routes`, `gmail_connection_events`, `email_ingestion_drafts`, `canal` y `gmail_attachment_id` en `utility_bills`, y `gmail_history_cursor` en `google_connections`. `message_id` sigue único.
- Jobs de watch, polling, descarga y OCR con reintentos acotados y backoff.
- Panel de salud por conexión con última ingesta y estado del watch, sin asunto ni remitente en claro.
- No cambia el contrato de confirmación de facturas ni el de OCR.

## Pendientes

- Crear el topic de Pub/Sub, la suscripción push y la cuenta de servicio con OIDC.
- Definir el extractor de texto de PDF o confirmar que el proveedor OCR acepta PDF; hoy el repo no tiene parser de PDF.
- Aprobar la migración y registrar la ventana inicial de 90 días y la de recuperación de 30 días.
- Confirmar cuotas de Gmail y Pub/Sub para la cantidad de tenants prevista, y el manejo de 429.
- Definir el routing de facturas de proveedor y su revisión en la UI, o dejarlo fuera de P0.
- Definir el renderizador de PDF a imagen para la copia en Photos.
