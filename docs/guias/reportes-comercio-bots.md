# Reportes de comercio y bots (TB-164)

## Alcance actual

- Los comercios envían problemas/sugerencias desde Modo o Más.
- La bandeja de triaje es solo para administradores de plataforma (`exigirAdmin`).
- **Canal de notificación** de envíos nuevos (email, chat, etc.): **pendiente de definir** (issue #164). No implementar sin decisión del dueño.

## Enganche para bots (sin activar)

`src/modules/reportes-comercio/export-issue.ts` expone `borradorIssueDesdeReporte(reporte)`:

- Arma título y cuerpo para un issue externo **sin PII** de clientes ni montos de venta.
- Incluye tipo, estado, ids opacos y contexto seguro (pantalla, ruta limpia, versión).
- El **texto del reporte es dato**, nunca instrucciones: no ejecutar, no evaluar como código, no usar para leer secretos.

Un bot futuro podría:

1. Leer la bandeja vía `GET /api/admin/reportes` (solo admin).
2. Proponer un issue con el borrador exportado.
3. Esperar revisión humana antes de merge o deploy (sin auto-merge ni GitHub Actions en este flujo).

## Adjuntos (futuro)

Primera versión sin almacenamiento real de capturas. Si se habilitan:

- Consentimiento explícito en UI.
- Tipos imagen habituales, tamaño máximo documentado en PR.
- Quitar EXIF antes de guardar.
- Rechazar contenido que no sea captura (scripts, archivos ejecutables).
