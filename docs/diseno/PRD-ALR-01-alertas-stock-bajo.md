---
id: PRD-ALR-01
tipo: prd
estado: en curso
modulos: [bot, email, inventario]
depende_de: [ADR-0024, ADR-0028, ADR-0039, ADR-0043]
reemplaza: []
reemplazado_por: ""
resumen: |
  Alertas automáticas de stock bajo con mínimo por producto, destinatarios con opt-in y armar pedido. ALR-S1
  persistido y editable hecho 2026-10-16; el endpoint del job corre con JOBSSECRET. ALR-S3 manda al canal de notification_preferences. Pendientes: pg_cron real (vive fuera del repo) y claves de alerta durables (hoy son un Set en memoria; `notification_events` ya existe).
---
# PRD-ALR-01 - Alertas automáticas de stock bajo (R2)

Fuente: `docs/07-canales-whatsapp-email/bot-whatsapp-parte-1.md` (B4 alertas por umbral, B5 aviso matutino), `docs/07-canales-whatsapp-email/notificaciones-email.md` (NE2 matutino), `src/modules/email/stock-matutino.ts`, `src/modules/whatsapp/alertas.ts`, `src/jobs/whatsapp-aviso-matutino.ts`, `docs/migracion-supabase.md`. Fecha extracción: 2026-10-12. Restringido por ADR-0024, ADR-0028, ADR-0039, ADR-0043. Gap: núcleo puro y tests existen; sin scheduler real ni mínimo editable persistido.

> Estado al 2026-10-24: en curso. ALR-S1 (`min_stock`/`reorder_qty` persistidos y editables en el panel) hecho. ALR-S2 parcial: el endpoint con `JOBSSECRET` ya guarda cada alerta enviada en `notification_events` (clave `alerta_stock:tenant:sku:día`) y no repite la no urgente el mismo día (`docs/roadmap/avances/ALR-S2.md`, `tests/alr-memoria-durable.test.ts`); falta el `pg_cron` real. ALR-S3 hecho: el job manda al canal de `notification_preferences` (WhatsApp, email o ambos); sin opt-in de WhatsApp el encargado recibe solo email, el canal pausado no recibe, el Dueño entra igual y otro tenant no se mezcla (`docs/roadmap/avances/ALR-S3.md`, `tests/alr-s3-canal.test.ts`). ALR-S5 hecho: botón Armar pedido en el historial (`docs/roadmap/avances/ALR-S5.md`, `tests/alr-s5-armar-pedido.test.ts`).

## Épica ALR-E1. Detección bajo mínimo

Requisito ALR-1: cada producto tiene un mínimo y el sistema detecta solo cuándo lo cruza.

- Historia ALR-S1. Mínimo por producto. `products.min_stock` y `products.reorder_qty` editables por Dueño y encargado. AC: Given producto sin mínimo When corre el job Then usa el sugerido por rotación 7 d; Given sin mínimo ni rotación Then no alerta. ADR: 0026. Talla S. Depende de: CAT-S1.
- Historia ALR-S2. Cron en Supabase: `pg_cron` más `pg_net` llaman `POST /api/jobs/alertas-stock` con `JOBS_SECRET`. Frecuencia: 08:00 TZ del tenant (matutino) y cada 2 h de 10:00 a 20:00 solo para quiebre (saldo 0). AC: Given producto bajo mínimo When el job corre dos veces el mismo día Then sale una sola alerta (clave `tenant+producto+día`). ADR: 0043. Talla M. Depende de: ALR-S1.

## Épica ALR-E2. Aviso al equipo

Requisito ALR-2: la alerta llega a quien repone, por el canal que eligió, en un solo mensaje accionable.

- Historia ALR-S3. Destinatarios: Dueño siempre; encargados con opt-in; canal según `notification_preferences` (WhatsApp, email o ambos). AC: Given encargado sin opt-in WhatsApp When hay alerta Then recibe solo email; Given canal pausado Then no recibe. ADR: 0039. Talla S. Depende de: ALR-S2.
- Historia ALR-S4. Contenido: producto, saldo actual, mínimo, cantidad sugerida a pedir, proveedor habitual y días de cobertura; agrupado en un mensaje con máximo 10 ítems más `ver todo`. AC: Given 25 productos bajo mínimo When se arma la alerta Then un mensaje por canal con 10 ítems y link. ADR: 0043. Talla S. Depende de: ALR-S2.
- Historia ALR-S5. Acción `Armar pedido`: crea borrador en lista urgente o del viernes. AC: Given toco el botón When confirmo Then queda borrador; nunca se envía al proveedor sin confirmar. ADR: 0040. Talla S. Depende de: ALR-S4.

## Dependencias externas

ALR-S1 espera a CAT-S1. ALR-S2 espera a la migración a Supabase (`docs/migracion-supabase.md`) y a ALR-S1. ALR-S3 espera a opt-in B2. ALR-S5 espera a lista del viernes B6.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Tres bajo mínimo | Job matutino | Un mensaje agrupado por canal con opt-in |
| Feliz | Quiebre a media tarde | Saldo llega a 0 a las 15:10 | Alerta en la corrida de las 16:00 |
| Fallo | Job repetido | Dos corridas el mismo día | Una sola alerta |
| Fallo | Sin datos | Sin mínimo ni rotación | No alerta |
| Regresión | Matutino actual | Tenant con NE2 activo | Mismo contenido, sin duplicar con ALR |

Arch-tests: AT1 el job solo lee, nunca modifica stock. AT2 toda alerta tiene clave idempotente registrada antes de enviar.