---
id: DESTRABE-CREDENCIALES
tipo: spec
estado: propuesto
modulos: [auth, bot, email, precios, fiscal, ocr]
depende_de: [ADR-0041, ADR-0047, ADR-0089, ADR-0090, ADR-0091, ADR-0092]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Inventario de las credenciales externas que faltan, con la variable exacta de entorno, el código que la
  consume y lo que desbloquea. Se consulta con npm run credenciales.
---
# Credenciales externas para destrabar

Cada fila dice qué variable leer, qué parte del código la usa y qué queda habilitado cuando está. Los valores se cargan en `.env` local o en el gestor de secretos del servidor. Nunca se commitean.

Comando de control: `npm run credenciales`. Lee el entorno, informa qué falta por integración y no imprime valores. Con `--json` devuelve el reporte para otro script.

Carga guiada: `npm run cargar:credenciales`. Lee `.env`, pregunta solo por las variables que faltan y las escribe sin mostrarlas en una terminal interactiva. En modo no interactivo (pipe) la entrada no se oculta y hay que pasar una línea por variable. Enter vacío omite una variable. Para un PEM, escribir `@ruta/al/archivo.pem` en lugar del contenido.

Orden recomendado: primero el LLM, que es una clave y ya tiene código. Después ARCA homologación, cuando estén las respuestas legales. OCR requiere desplegar un servicio. Mercado Pago y Photos esperan código que todavía no existe; Gmail ya tiene OAuth, watch e ingesta backend.

## Google login

| Variable | Uso |
|---|---|
| `GOOGLE_LOGIN_CLIENT_ID` | OIDC de login |
| `GOOGLE_LOGIN_CLIENT_SECRET` | Canje del código |
| `GOOGLE_LOGIN_REDIRECT` | Redirect autorizado, hoy `http://localhost:4321/api/auth/callback` |

Desbloquea el login real con Google. La app debe pedir solo `openid email profile`, nunca Gmail ni Photos.

## Google integraciones

| Variable | Uso |
|---|---|
| `GOOGLE_INTEGRATIONS_CLIENT_ID` | App OAuth de Gmail, separada del login |
| `GOOGLE_INTEGRATIONS_CLIENT_SECRET` | Canje del código |
| `GOOGLE_INTEGRATIONS_REDIRECT` | Redirect autorizado, hoy `http://localhost:4321/api/integrations/callback` |
| `GMAIL_PUBSUB_TOPIC` | Topic de `users.watch` |
| `GMAIL_PUBSUB_AUDIENCE` | Audience del token OIDC del push |
| `GMAIL_PUBSUB_EMAIL` | Cuenta de servicio que firma el push |
| `GMAIL_ROUTE_PEPPER` | Pepper del HMAC de la casilla en el ruteo |
| `INTEGRATIONS_KMS_KEY_B64` | Clave AES-256-GCM de integraciones, separada de la fiscal |
| `INTEGRATIONS_KMS_KEY_ID` | Identificador de la clave de integraciones |
| `INTEGRATIONS_STATE_SECRET` | Firma la cookie de state del OAuth; fallback `JOBS_SECRET` |

Photos, si se habilita, usa un cliente propio para poder desconectarlo sin tocar Gmail: `GOOGLE_PHOTOS_CLIENT_ID`, `GOOGLE_PHOTOS_CLIENT_SECRET` y `GOOGLE_PHOTOS_REDIRECT`.

Gmail ya tiene el flujo OAuth (`/api/integrations/start`, `callback` y `disconnect`), la tabla `google_connections` con su migración, el refresh token cifrado con `INTEGRATIONS_KMS_*` y el backend de ingesta: `users.watch`, `history.list`, webhook Pub/Sub con OIDC, ruteo HMAC de la casilla, cola durable con reintentos y borradores en `email_ingestion_drafts`. Faltan la pantalla de consentimiento/confirmación y la UI de remitentes; el adjunto PDF usa un extractor inyectable hasta sumar una dependencia de texto PDF. Además, `gmail.readonly` es un scope restringido que exige verificación de la app y una evaluación CASA, y los scopes de Photos cambiaron en 2025. Photos usa una app separada y todavía no está cableado.

## Meta WhatsApp Cloud API

| Variable | Uso |
|---|---|
| `WHATSAPP_TOKEN` | Envío por Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | Número central |
| `WHATSAPP_APP_SECRET` | Firma del webhook |
| `WHATSAPP_VERIFY_TOKEN` | Verificación del webhook |

Desbloquea el envío y la recepción real. Requiere negocio verificado, número dado de alta, método de pago y plantillas aprobadas. Los textos están en `docs/07-canales-whatsapp-email/plantillas-meta.md`.

## Resend

| Variable | Uso |
|---|---|
| `RESEND_API_KEY` | Envío de email |

Desbloquea el envío real de `POST /api/email/send` y de la cola `email_outbox`. Requiere dominio verificado con SPF, DKIM y DMARC. Sin la clave, el sistema encola y responde 202.

## Mercado Pago

| Variable | Uso |
|---|---|
| `MP_WEBHOOK_SECRET` | Verificación HMAC del webhook |

El secreto se copia del panel de la aplicación de Mercado Pago, en la configuración de webhooks. Hoy el webhook del repo firma `JSON.stringify(body)` y no el esquema `x-signature` de Mercado Pago, así que cargar el secreto no lo hace funcionar con pagos reales. La validación correcta y la creación de preaprobaciones son PLAN3-S4 y PLAN3-S3. Conviene esperar a que ese código exista. Confirmar comisión y plazos antes de publicar precios.

## OCR Paddle

| Variable | Uso |
|---|---|
| `OCR_PADDLE_ENDPOINT` | Motor OCR autohospedado |

No es una credencial que se copia de un panel. Es un servicio que hay que desplegar. El cliente de `src/modules/ocr/motor.ts` llama `POST <endpoint>/ocr` con `{ imagen_base64, mime_type }` y espera `{ texto, confianza }`. Requiere el host CX22 o CX33 con PaddleOCR PP-OCRv5, un proxy HTTPS y el corpus etiquetado del piloto. El cliente no manda autenticación, así que no hay que exponer el endpoint público sin una regla de red o un token en el proxy. La puerta de encendido es 3 a 4 segundos por imagen y 80% de acierto por campo.

## ARCA

| Variable | Uso |
|---|---|
| `ARCA_CUIT_PROVEEDOR` | CUIT del computador fiscal |
| `ARCA_CERT_PEM` | Certificado WSASS |
| `ARCA_KEY_PEM` | Clave del certificado |
| `FISCAL_KMS_KEY_B64` | Envoltura local de la clave y el TA |
| `ARCA_AMBIENTE` | `homo` o `prod` |

Desbloquea la homologación real y después la emisión en producción. Antes hacen falta las respuestas de `docs/06-fiscal-arca/pedido-contador-abogado.md` y el CUIT del proveedor.

Pasos para homologación:

1. Generar la clave y el CSR. El DN exacto lo fija ARCA; el CN suele ser el CUIT.

   ```
   openssl req -new -newkey rsa:2048 -nodes -keyout arca-key.pem -out arca.csr -subj "/C=AR/O=<razón social>/CN=<CUIT>"
   ```

2. Subir `arca.csr` a WSASS, asociar el alias y el servicio `wsfe`, y descargar el certificado PEM.
3. Generar la clave de envoltura KMS con `openssl rand -base64 32`.
4. Cargar `ARCA_CUIT_PROVEEDOR`, `ARCA_AMBIENTE=homo`, `ARCA_CERT_PEM` con `@ruta/cert.pem`, `ARCA_KEY_PEM` con `@ruta/arca-key.pem` y `FISCAL_KMS_KEY_B64`.
5. No pasar a `prod` sin el certificado de producción y la homologación de FE2-S4.

La clave privada no se commitea. En producción va en un gestor de secretos, no en `.env`.

## LLM del asistente

| Variable | Uso |
|---|---|
| `ASSISTANT_LLM_KEY` | Clave del proveedor |
| `ASSISTANT_LLM_BASE_URL` | Endpoint compatible con la API de OpenAI |
| `ASSISTANT_LLM_MODEL` | Modelo |

Es opcional. Sin la clave el asistente usa el fake. El puente free es OpenRouter, no Groq. Groq responde `403 Access denied. Please check your network settings.` antes de mirar la clave cuando la salida es una IP de datacenter o una VPN, y también desde algunos países, así que cargar la clave de Groq no alcanza. OpenRouter publica el mismo contrato de la API de OpenAI y respondió 200 desde este entorno.

Valores:

- `ASSISTANT_LLM_KEY` con la clave `sk-or-...`
- `ASSISTANT_LLM_BASE_URL=https://openrouter.ai/api/v1`
- `ASSISTANT_LLM_MODEL` con un modelo `:free`, por ejemplo `minimax/minimax-m3.1-flash:free`, que conviene confirmar contra `GET /api/v1/models` porque los `:free` cambian seguido

Solo `ASSISTANT_LLM_KEY` cuenta para el chequeo, pero los defaults del código apuntan a Groq (`api.groq.com/openai/v1`), así que si faltan la base o el modelo la llamada vuelve a Groq y falla con 403. Conviene cargar las tres.

## Sentry

No hay variables ni SDK cableados. Para habilitarlo hace falta instalar el SDK, agregar el hook de errores del servidor y definir el DSN. Hasta entonces no figura en `npm run credenciales` para no reportar una integración que el código no consume.

## Cómo verificar una integración

1. Cargar las variables con `npm run cargar:credenciales` o editando `.env` local.
2. Correr `npm run credenciales` y confirmar que la fila pasa a `presente`. Presente significa que la variable no está vacía, no que la credencial funcione.
3. Probar el camino real, no solo la presencia de la variable. Login con una cuenta, un mensaje al número de prueba, un email a una casilla propia, un pago de prueba en Mercado Pago y una imagen de OCR del corpus.
4. Registrar la fecha de la prueba y el resultado.
