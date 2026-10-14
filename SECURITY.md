# Política de seguridad

## Reportar una vulnerabilidad

No abras issues públicos para problemas de seguridad. Reportalos de forma privada
mediante **GitHub → Security → Report a vulnerability** (avisos privados) o
contactando directamente al mantenedor (@mauriciosoyastor).

Incluí: descripción, pasos para reproducir, impacto estimado y versión/commit afectado.
Respondemos dentro de 5 días hábiles y coordinamos la divulgación una vez corregido.

## Versiones soportadas

Solo la rama `main` recibe correcciones de seguridad.

## Manejo de secretos

- Nunca se commitean archivos `.env*` (excepto `.env.example`, sin valores reales).
- El repositorio tiene secret scanning y push protection habilitados (cuando el plan lo permite).
- Los secretos de despliegue se cargan como *Environment secrets* de GitHub
  (`homologacion`, `produccion`), nunca en el código.

### Secretos esperados (nombres, sin valores)

| Nombre | Uso |
|---|---|
| `CONTROL_DATABASE_URL` | Base de control (control plane) |
| `TENANT_DATABASE_URL` | Base del tenant |
| `DATABASE_URL` | Conexión genérica, si el entorno la usa |
| `GOOGLE_LOGIN_CLIENT_ID` / `GOOGLE_LOGIN_CLIENT_SECRET` | OAuth de login |
| `GOOGLE_INTEGRATIONS_CLIENT_ID` / `GOOGLE_INTEGRATIONS_CLIENT_SECRET` | OAuth de integraciones |
| `SUPERADMIN_SUBS` / `ADMIN_ALLOWLIST_SUBS` | Allowlists de administración |
| `JOBS_SECRET` | Autenticación de jobs programados |
| `ARCA_CUIT_PROVEEDOR` | CUIT del emisor fiscal |
| `ARCA_CERT_PEM` / `ARCA_KEY_PEM` | Certificado y clave privada ARCA |
| `FISCAL_KMS_KEY_B64` / `FISCAL_KMS_KEY_ID` | Envoltura de claves fiscales |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_APP_SECRET` | Integración WhatsApp |
