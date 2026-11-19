---
id: PRD-GMAIL-01
tipo: prd
estado: hecho
modulos: [compras, pagos, auth, ocr, media]
depende_de: [ADR-0102, ADR-0103, ADR-0104, ADR-0005, ADR-0089, ADR-0093, PRD-OCR-01, MOD-05-CONSUMOS-SERVICIOS, MOD-05-FACTURAS-PROVEEDORES]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Gmail: conexión, ingesta y borradores implementados en app (GGL-S1, panel, remitentes, S10b, S12).
  E2E verificado, Pub/Sub/KMS y Google Photos bloqueados por credenciales/decisiones externas; reenvío GGL-S13 es P1.
---
# PRD-GMAIL-01 - Conexión de Google, ingesta de Gmail y copia en Photos

> Estado al 2026-11-15: hecho en aplicación para Gmail P0 (épica GGL-E1–E3 en código y tests; avances `GGL-S1`, `GGL-PANEL`, `GGL-REMITENTES`, `GGL-S10b`, `GGL-S12`, `GGL-CRED`, `GGL-PDF`). El epic `0102.md` queda **bloqueado (externo)** hasta E2E con Google verificado, topic Pub/Sub + KMS en producción (Mauri; ver `docs/ESTADO.md`). Photos (GGL-E4 / ADR-0104, `propuesto`) no tiene código: solo la columna `photos_albumes` y el tipo `"photos"` en el state de OAuth; las variables `GOOGLE_PHOTOS_*` de `.env.example` apuntan a una ruta que no existe. Huecos P0 abiertos contra el AC original: rechazar la casilla ya activa en otro comercio al conectar (hoy el 409 salta recién al registrar el watch, `gmail-watch.ts:51-53`), dedupe por `messageId`, evento por cambio de filtros, label elegible y scheduler del watch (detalle en ADR-0103). GGL-S13 (reenvío sin OAuth) sigue P1 sin ADR. Modo prueba: lista `GOOGLE_INTEGRATIONS_USUARIOS_PRUEBA` y refresh 7 días en testing (`GGL-S12`).

Fuente: `docs/05-compras-servicios-pagos/consumos-servicios.md` (CS1), `docs/05-compras-servicios-pagos/facturas-proveedores.md` (FP2), `docs/diseno/PRD-OCR-01-motor-ocr-fase-0.md`, `src/modules/ocr`, `src/pages/api/gmail/*`, `src/db/schema-servicios.ts`. Restringido por ADR-0005, ADR-0089, ADR-0093, ADR-0102, ADR-0103 y ADR-0104. Fecha extracción: 2026-10-19.

## Problema

Las facturas de servicios llegan por email. El dueño tenía que abrir el correo, bajar el adjunto y cargarlo a mano. En repo ya están OAuth, token cifrado, `users.watch`, `history.list`, cola durable, borradores, UI de integraciones/consentimiento, desconexión, salud de conexión, remitentes y modo prueba (migraciones 0030/0031). Lo que no cierra el epic en producción es correr el flujo de punta a punta con credenciales Google reales (consentimiento verificado, Pub/Sub, KMS) y la segunda ola Photos. El scope `gmail.readonly` alcanza técnicamente a toda la casilla aunque la app filtre; el consentimiento propio lo documenta.

El objetivo es que el dueño conecte su email una vez, elija de qué remitentes leer y reciba borradores de factura en la web. El sistema nunca envía, modifica ni borra correo. Google Photos es una copia opcional, no la fuente de verdad.

## Alcance

Entra en alcance Gmail para facturas de servicios en P0. Las facturas de proveedores por Gmail quedan en P1 porque ADR-0096 todavía deja el email fuera de ese flujo. Entra Photos como copia de los comprobantes que la app ya guardó, en la segunda ola después de Gmail y apagada por defecto. La dirección de reenvío de CS1.8 queda como plan B P1 y necesita su propio ADR. No entra Outlook, no entra envío de correo, no entra lectura de toda la bandeja, no entra Google Drive y no entra la biblioteca existente de Photos. El resumen y la confirmación en lote de la ventana inicial de 90 días son parte de CS4 y se detallan en el PRD de consumos, no acá.

## Épica GGL-E1. Conexión y consentimiento

Requisito GGL-R1: el dueño conecta Gmail con el mínimo permiso y puede desconectarlo cuando quiera.

- Historia GGL-S1. Conectar Gmail. AC: Given un Dueño autenticado en la web, sin conexión When toca "Conectar mi email" y acepta en Google Then queda una fila `google_connections` activa para Gmail con la cuenta, los scopes otorgados y el consentimiento versionado. La conexión solo se inicia desde la web, nunca desde un link del bot. Si la casilla ya está activa en otro comercio, se rechaza con un mensaje claro. ADR: 0102. Talla M. Depende de: GGL-S2, GGL-S3.
- Historia GGL-S2. Consentimiento propio. AC: Given el Dueño toca conectar When se abre la pantalla propia Then ve qué se lee, qué se guarda, qué no se hace y cómo desconectar; también ve que el permiso de Google alcanza a toda la casilla aunque la app filtre, y que un proveedor de OCR puede procesar el adjunto. La casilla es obligatoria y se registra versión, fecha y usuario. ADR: 0102. Talla S. Depende de: nada.
- Historia GGL-S3. Guardar el token cifrado. AC: Given el canje exitoso When se guarda la conexión Then la base solo tiene ciphertext, iv, tag, versión de cifrado y key id; el AAD liga el ciphertext a `tenant_id`, `tipo` y `connection_id`; el refresh token plano no aparece en logs, respuestas ni en el `Authorization` de ningún request. ADR: 0102. Talla M. Depende de: GGL-S1.
- Historia GGL-S4. Desconectar. AC: Given una conexión activa When el Dueño desconecta Then se revoca el token en Google, se borra el refresh token, se detiene el watch, se descartan los jobs pendientes, la fila queda `revocada` y ningún job en vuelo persiste una factura después del corte. ADR: 0102. Talla S. Depende de: GGL-S1.
- Historia GGL-S5. Error de token. AC: Given Google responde `invalid_grant` When un job intenta renovar Then la conexión queda `revocada` con motivo `invalid_grant`, el Dueño recibe un aviso y el job no entra en loop. Un error de red o un 5xx deja `error` transitorio y se reintenta con backoff. ADR: 0102. Talla S. Depende de: GGL-S1.

## Épica GGL-E2. Ingesta de Gmail

Requisito GGL-R2: cada correo nuevo de un remitente elegido se procesa una sola vez y produce un borrador, nunca una factura confirmada sin revisión.

- Historia GGL-S6. Registrar el watch. AC: Given una conexión activa When corre el job de watch Then `users.watch` queda registrado con el topic de Pub/Sub y la etiqueta elegida si existe; se guardan `watch_history_id` y `watch_expira_at` sin pisar `gmail_history_cursor`; el job renueva cada 24 horas. La ventana inicial es de 90 días, configurable entre 0 y 12 meses. ADR: 0103. Talla M. Depende de: GGL-S1.
- Historia GGL-S7. Recibir el push. AC: Given un push de Pub/Sub When el token OIDC es válido Then se decodifica el mensaje y se encola el job; When el token falta o no valida Then responde 401 y no crea job. ADR: 0103. Talla M. Depende de: GGL-S6.
- Historia GGL-S8. Leer el historial. AC: Given un `historyId` nuevo When corre el job Then lista los mensajes desde el cursor, pide metadata para filtrar por remitente, procesa cada uno una vez y avanza el cursor; `history.list` no acepta `q`, así que el filtro grueso se hace en la app. Si el historial es demasiado viejo Then vuelve a una ventana de recuperación de 30 días. ADR: 0103. Talla M. Depende de: GGL-S7.
- Historia GGL-S9. Filtrar antes de descargar. AC: Given un mensaje de un remitente no elegido When llega Then solo se registra su id y dominio, sin cuerpo ni adjunto; Given un remitente elegido con PDF o imagen When llega Then se descarga el adjunto. ADR: 0103. Talla M. Depende de: GGL-S8.
- Historia GGL-S9b. Administrar remitentes. AC: Given el Dueño en Configuración When agrega, edita, pausa o desactiva un remitente o un tipo de servicio Then el cambio aplica al siguiente mensaje y queda auditado. ADR: 0103. Talla S. Depende de: GGL-S9.
- Historia GGL-S10. Crear el borrador. AC: Given un adjunto de factura de servicio When termina el OCR Then queda un borrador con `canal="gmail"`, el `origen` de extracción que devuelve el motor (`pdf_digital`, `ocr` o `email_respaldo`), los ids de mensaje y adjunto y la confianza por campo; si no hay cuenta de servicio asociada, el borrador se guarda en `email_ingestion_drafts` con `account_id` nulo y no se persiste en `utility_bills` hasta que el Dueño elija la cuenta. El Dueño confirma en la web. ADR: 0103 y ADR-0005. Talla M. Depende de: GGL-S9.
- Historia GGL-S10b. Factura en el cuerpo. AC: Given un correo sin adjunto pero con datos de factura en el cuerpo When el remitente está filtrado Then se extraen monto y vencimiento con confianza baja, se genera una imagen saneada del cuerpo como comprobante y el borrador pide revisión. No se siguen links ni se inicia sesión en sitios de terceros. ADR: 0103 y ADR-0005. Talla M. Depende de: GGL-S10.
- Historia GGL-S11. Idempotencia. AC: Given el mismo mensaje entregado dos veces When corre el job Then no se crea un segundo borrador ni se duplica el egreso. En P0 un correo produce una factura: si trae varios adjuntos, se procesa el primero válido y el log del mensaje registra cuántos se ignoraron, sin guardar su contenido. La facturación por adjunto múltiple es P1 y requiere cambiar el dominio de ingesta (`ingesta_gmail.ts` / `gmail-sync.ts`). ADR: 0103. Talla S. Depende de: GGL-S10.

## Épica GGL-E3. Verificación y límites de Google

Requisito GGL-R3: la app funciona en modo prueba mientras Google no aprueba el scope restringido, y existe un camino sin OAuth.

- Historia GGL-S12. Modo prueba. AC: Given la app no está verificada When un usuario que no está en la lista de prueba intenta conectar Then la UI explica el límite y no inicia OAuth. En modo Testing Google vence el refresh token a los 7 días: la UI avisa y pide reconectar en vez de prometer una ingesta continua. ADR: 0102. Talla S. Depende de: GGL-S1.
- Historia GGL-S13. Dirección de reenvío. AC: Given OAuth no está disponible When el Dueño reenvía una factura a la dirección del producto Then se crea el mismo borrador sin pedir scopes de Gmail. Es P1, necesita un ADR propio por ruta de entrada, SPF/DKIM, alias por tenant, límites y deduplicación entre canales, y no se implementa en este PRD. ADR: pendiente. Talla M. Depende de: GGL-S10.
- Historia GGL-S14. Salud de la conexión. AC: Given una conexión activa When pasa un día sin ingesta Then el panel muestra el estado del watch y la última ingesta, sin contenido de correo. ADR: 0103. Talla S. Depende de: GGL-S6.

## Épica GGL-E4. Google Photos opcional (segunda ola)

Requisito GGL-R4: la app conserva el original aunque Photos falle, se desconecte o el dueño borre la copia. Es P0 de producto según CS3, pero se implementa en la segunda ola después de Gmail y apagada por defecto.

- Historia GGL-S15. Copia opcional. AC: Given un original guardado en el almacenamiento propio When Photos está conectado y la opción está activa Then se sube una copia creada por la app al álbum del tipo de servicio y se guardan media id y álbum; si el original es PDF, se renderiza la primera página o hasta tres a JPEG antes de subir; si Photos falla Then la factura sigue disponible y la copia se reintenta; si el Dueño desconecta Photos Then Gmail sigue activo. ADR: 0104. Talla M. Depende de: GGL-S10.
- Historia GGL-S16. Sin lectura de la biblioteca. AC: Given la conexión de Photos When se piden scopes Then solo se piden scopes de medios creados por la app; un test verifica que no se pide lectura de toda la biblioteca. ADR: 0104. Talla S. Depende de: GGL-S15.
- Historia GGL-S17. Borrado en Photos. AC: Given el Dueño borra la copia en Photos When abre la factura Then el original del almacenamiento propio sigue visible. La app no borra media items de Google; el Dueño los administra desde Photos. ADR: 0104. Talla S. Depende de: GGL-S15.

## Dependencias externas

Bloqueo de cierre del epic (`docs/roadmap/avances/0102.md`): credenciales y despliegue en producción, no código pendiente del núcleo Gmail.

- Proyecto de Google Cloud, pantalla de consentimiento y app OAuth separada de la de login.
- Verificación de la app y evaluación CASA para `gmail.readonly`, con costo y plazo a confirmar.
- Topic de Pub/Sub y una cuenta de servicio para el push con OIDC.
- Almacenamiento de objetos para el original, hoy stub en `src/pages/api/media/upload-url.ts`; el upload-url actual solo acepta JPEG/WebP de 2 MB y no sirve para PDFs de Gmail.
- Renderizador de PDF a JPEG para la copia en Photos (pdf.js o poppler).
- Dominio y correo entrante si se implementa la dirección de reenvío.
- Política de privacidad y términos que cubran el uso limitado de datos de Google, los subprocesadores de OCR y la retención de originales bajo la Ley 25.326.

## Migración

Las migraciones de esta implementación (`0030_google_integrations` y `0031_gmail_ingestion`) se aplicaron con aprobación de Mauri y están registradas en `docs/roadmap/migraciones-aplicadas.md`.

- `google_connections` por tenant y tipo, con token cifrado, estado, consentimiento, `gmail_history_cursor`, `watch_history_id` y vencimiento del watch.
- `gmail_watch_routes` en la base de control, solo con HMAC de la dirección con pepper, tenant y connection id, sin dirección en claro, tokens ni contenido. Índice único para que una casilla activa no se conecte a dos comercios en el MVP.
- `gmail_connection_events` append-only para conectar, desconectar, error y cambios de filtros, sin tokens ni contenido.
- `email_ingestion_drafts` para borradores en revisión o sin cuenta, con `account_id` nulo, `message_id` único, `vence_en`, `recordatorio_en` y `estado`.
- `utility_bills` suma `canal` y `gmail_attachment_id`; `message_id` sigue único porque en P0 un correo produce una factura.

## Estrategia de prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Conectar y consentir | Dueño acepta scopes | Conexión activa y consentimiento registrado |
| Feliz | Factura de servicio | Correo con PDF de Edenor | Borrador con `canal="gmail"`, `origen` de extracción y confianza |
| Fallo | Scope insuficiente | Google devuelve sin `gmail.readonly` | Conexión rechazada con mensaje claro |
| Fallo | Push sin OIDC | POST sin Authorization | 401 y ningún job |
| Fallo | Duplicado | Mismo mensaje y adjunto dos veces | Un solo borrador |
| Fallo | Photos caído | Upload a Photos falla | Factura guardada en almacenamiento propio |
| Borde | Historial viejo | `historyId` expirado | Vuelve a la ventana de 30 días sin duplicar |
| Borde | Misma casilla en dos comercios | Segunda conexión | Se rechaza y no se cruzan datos |
| Borde | Correo con dos adjuntos | Dos PDFs | Un borrador y el segundo adjunto ignorado |
| Borde | Factura solo en el cuerpo | HTML con monto y vencimiento | Borrador en revisión con confianza baja |
| Seguridad | Token en reposo | Leer la fila | Solo ciphertext, iv, tag, versión y key id |
| Seguridad | Scopes | Abrir la URL de Google | Solo `gmail.readonly` y `openid email`, sin modify/send |
| Seguridad | Rotación de clave | Rewrap de una conexión | Descifra con la clave vieja y vuelve a cifrar con la nueva |
| Carrera | Desconectar con job en vuelo | Disconnect y job simultáneos | El job no persiste después del corte |

La prueba de punta a punta usa un proveedor OAuth falso y un Gmail falso, como el resto de los slices con servicios externos. La prueba real se hace con usuarios de prueba hasta que CASA esté aprobada.

## Fuera de alcance

Enviar, responder, modificar o borrar correo. Leer toda la bandeja. Gestionar etiquetas de Gmail más allá de elegir una. Google Drive. Outlook y Microsoft 365. Leer la biblioteca existente de Photos. Elegir fotos existentes con la Picker API. Borrar media items de Google Photos desde la app. Facturas de proveedores por Gmail en P0. Varias facturas por correo en P0. Dirección de reenvío sin ADR propio. Facturación automática sin confirmación del Dueño.

## Riesgos

- CASA puede tardar semanas y tener costo. Mitigación: modo prueba y dirección de reenvío.
- Google puede cambiar scopes o cuotas. Mitigación: permisos mínimos y revisión trimestral.
- Un token filtrado da acceso de lectura a toda la casilla, no solo a los remitentes filtrados. Mitigación: cifrado con AAD, rotación, revocación, auditoría y consentimiento explícito.
- Un error de tenant puede mezclar facturas. Mitigación: el tenant sale de la sesión, el callback valida el state y una casilla activa no se conecta a dos comercios en el MVP.
- Un refresh token de una app en Testing vence a los 7 días. Mitigación: aviso y reconexión; no prometer ingesta continua hasta la verificación.
- Un adjunto puede salir hacia un proveedor de OCR. Mitigación: listar subprocesadores y limitar el contenido enviado.
- Un adjunto grande o malicioso puede agotar memoria. Mitigación: límite de tamaño, mime permitido por magic bytes y análisis en un job.

## Plan B sin OAuth

La dirección de reenvío de CS1.8 no se implementa en este PRD. Si CASA se demora o el Dueño no quiere dar acceso a su casilla, el plan B necesita un ADR propio que defina alias por tenant, SPF/DKIM, límite de tamaño, cuarentena, deduplicación entre canales y qué pasa si el reenvío rompe la autenticación del remitente. El borrador y el OCR reutilizan el mismo pipeline.
