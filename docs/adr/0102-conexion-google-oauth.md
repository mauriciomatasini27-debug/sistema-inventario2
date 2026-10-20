---
id: ADR-0102
tipo: adr
estado: aceptado
modulos: [auth, compras]
depende_de: [ADR-0005, ADR-0089, MOD-05-CONSUMOS-SERVICIOS, MOD-05-FACTURAS-PROVEEDORES]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  La conexión de Gmail y Photos usa apps OAuth separadas del login, consentimiento propio
  versionado y refresh token cifrado con AAD por conexión. El login sigue con su cliente.
---
# ADR-0102 - Conexión de Google con OAuth separado y token cifrado

Estado: aceptado (2026-10-19, evidencia: `src/pages/api/integrations/start.ts`, `callback.ts`, `disconnect.ts`, `src/lib/repos/google-conexiones.ts`, `src/modules/integraciones/google-oauth.ts`, migración `0030_google_integrations`, `tests/google-oauth.test.ts`). Fecha: 2026-10-19. Fuentes: `src/modules/auth/oidc.ts`, `.env.example`, `docs/05-compras-servicios-pagos/consumos-servicios.md` (CS1.1 a CS1.8), ADR-0005, ADR-0089.

## Decisión

1. Gmail usa un cliente OAuth distinto del login. Variables `GOOGLE_INTEGRATIONS_CLIENT_ID`, `GOOGLE_INTEGRATIONS_CLIENT_SECRET` y `GOOGLE_INTEGRATIONS_REDIRECT`. El login conserva `GOOGLE_LOGIN_*` y los scopes `openid email profile`. Una app no pide Gmail para dejar entrar a alguien. Photos, si se implementa, usa un tercer cliente (`GOOGLE_PHOTOS_*`) para que su consentimiento y su revocación sean independientes: un refresh token es por grant y revocar un cliente invalida todos sus scopes, no un subconjunto.
2. El flujo es Authorization Code con PKCE S256, `access_type=offline` y `prompt=consent` para obtener refresh token. El `state` es aleatorio, de un solo uso, ligado al tenant y a la sesión, y se guarda del lado servidor con vencimiento corto en la base o en una cookie firmada `HttpOnly`; si hay más de una instancia, va en la base. El callback canjea el código contra `https://oauth2.googleapis.com/token`.
3. Los scopes se piden por integración. Gmail pide `openid email` y `https://www.googleapis.com/auth/gmail.readonly`. Photos, si el Dueño activa la copia, pide solo scopes de medios creados por la app. Nunca se piden `gmail.modify`, `gmail.send`, `mail.google.com`, `drive` ni lectura de toda la biblioteca de Photos. El permiso de Gmail alcanza a toda la casilla: la app filtra, pero el consentimiento debe decir que el acceso técnico es amplio.
4. El refresh token se guarda cifrado con AES-256-GCM. Se reutiliza la interfaz `Kms` de `src/modules/fiscal/kms.ts` con una instancia y una clave distintas: `INTEGRATIONS_KMS_KEY_B64` y `INTEGRATIONS_KMS_KEY_ID`. La base guarda `refresh_token_cifrado`, `refresh_token_iv`, `refresh_token_tag`, `cifrado_version` y `kms_key_id`. El AAD liga el ciphertext a `tenant_id`, `tipo` y `connection_id`, así una fila movida no descifra. El access token vive en memoria y no se persiste; ni el access token ni el `Authorization` van a logs.
5. La tabla `google_connections` vive en la base del tenant y guarda `tenant_id` para auditoría y para el caso de base compartida; toda lectura filtra por el tenant de la sesión. Una fila por `(tenant_id, tipo)`, con `tipo` en `gmail` o `photos`, `cuenta_email`, `scopes`, `estado` en `activa`, `error` o `revocada`, `consentimiento_version`, `consentimiento_at`, `consentido_por`, `ultimo_error` y timestamps. `revocada` cubre la desconexión del Dueño y `invalid_grant`; `error` queda para fallas transitorias. Los campos propios de Gmail y Photos los agregan ADR-0103 y ADR-0104.
6. El consentimiento propio se muestra antes de ir a Google y solo se inicia desde la web con el Dueño autenticado. El texto vive versionado en código (`CONSENTIMIENTO_GOOGLE_VERSION`) y dice qué se lee, qué se guarda, qué no se hace, cómo desconectar y qué subprocesadores de OCR pueden ver el adjunto. Sin aceptación explícita no se inicia el flujo. Se registra versión, fecha y usuario.
7. Desconectar revoca el token en `https://oauth2.googleapis.com/revoke`, borra el material cifrado, detiene el watch, descarta la cola pendiente y deja la fila en `revocada` para auditoría. Los jobs en vuelo revalidan el estado antes de persistir. Si Google responde `invalid_grant` al renovar, la conexión pasa a `revocada` con motivo `invalid_grant`; si es un error de red o 5xx, queda `error` y se reintenta con backoff, sin loop.
8. El callback es `GET /api/integrations/callback`, el mismo valor de `GOOGLE_INTEGRATIONS_REDIRECT`. Valida el `state`, el tenant de la sesión, el `code` y el `error` de Google. No acepta `tenant_id` del body ni de la URL. Un state vencido o de otro tenant se rechaza y se audita.
9. Mientras la app no esté verificada, el flujo queda en modo prueba con una lista de hasta 100 usuarios habilitados. La UI explica el límite antes de abrir Google. En modo Testing Google vence el refresh token a los 7 días; la UI pide reconectar y no promete ingesta continua. La dirección de reenvío de CS1.8 es el plan B y necesita su propio ADR.
10. Cada conexión, desconexión, error y cambio de filtros deja un evento append-only en `gmail_connection_events` con tenant, connection id, actor, tipo de evento y motivo, sin tokens ni contenido de correo.

## Por qué

- Separar clientes limita el daño. Si el cliente de integraciones se filtra, el login no queda comprometido, y viceversa.
- PKCE y `state` cortan el code interception y el CSRF del callback. Es el mismo patrón que ya usa `src/modules/auth/oidc.ts`.
- Guardar solo el refresh token reduce la superficie. El access token dura una hora y se puede pedir de nuevo.
- Cifrar con una clave de integraciones separada de la fiscal, más AAD por conexión, evita que un dump de la base exponga correos y que un ciphertext se mueva entre filas. La rotación de la clave queda como pendiente.
- El consentimiento versionado es requisito de producto y de Google. Sin él, la conexión no es auditable.
- La revocación real en Google es la única forma de cortar el acceso cuando el Dueño desconecta.

## Qué cambia

- Nuevas variables `GOOGLE_INTEGRATIONS_*`, `INTEGRATIONS_KMS_*`, `GMAIL_PUBSUB_*` y, para Photos, `GOOGLE_PHOTOS_*`.
- Migración con `google_connections` y `gmail_connection_events`, pendiente de aprobación y registro.
- Rutas `GET /api/integrations/start`, `GET /api/integrations/callback` y `POST /api/integrations/disconnect`.
- Pantalla de consentimiento y panel de estado de la conexión.
- Un job de renovación y un cliente HTTP de Google con timeout, reintentos acotados y telemetría sin tokens.
- No cambia el login, ni sus scopes, ni su callback.

## Pendientes

- Aprobación de Mauri para la migración y para crear el proyecto de Google Cloud.
- Verificación de la app y CASA para `gmail.readonly`: costo, plazo y responsable.
- Texto legal del consentimiento y política de privacidad.
- Definir si la clave de integraciones se guarda en el mismo secreto del deploy o en un KMS externo, y el procedimiento de rotación y rewrap.
- Confirmar la lista de usuarios de prueba y el límite de 100, y el efecto de los 7 días de vencimiento del refresh token en Testing.
- Definir si el `state` va en la base del tenant o en una cookie firmada, según la cantidad de instancias.
- Cerrar el texto de privacidad con los subprocesadores de OCR.
