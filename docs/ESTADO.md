# Estado del proyecto

Generado por `npm run docs:estado`. No editar a mano.

## Hecho reciente (últimos 15 avances)

- 2026-11-23 · [AUD-FIX-FISCAL-3](roadmap/avances/AUD-FIX-FISCAL-3.md) · AUD-FIX-FISCAL-3: en modo single el wizard fiscal cae a `tenantActual()` o al tenant por defecto cuando el pedido no trae…
- 2026-11-23 · [AUD-FIX-S1](roadmap/avances/AUD-FIX-S1.md) · AUD-FIX-S1: las 14 divergencias `corregir-schema` del triage quedan alineadas en `src/db/schema*.ts` (timestamptz, `fiscal_jobs`…
- 2026-11-23 · [AUD-FIX-S1-490](roadmap/avances/AUD-FIX-S1-490.md) · AUD-FIX-S1-490: los tests de AUD-S1 y AUD-S4 tipan sus datos sin `as never` (baseline en 1) y el resumen de verify pasa a 19…
- 2026-11-23 · [AUD-FIX-S2](roadmap/avances/AUD-FIX-S2.md) · AUD-FIX-S2: el unique (ambiente, alias) de `fiscal_computers` queda declarado en `schema-fiscal-control.ts` y en la migración…
- 2026-11-23 · [AUD-FIX-S3](roadmap/avances/AUD-FIX-S3.md) · AUD-FIX-S3: `cash_movements.nota` queda persistida (migración 0061); el panel de caja la manda y el historial la relee.
- 2026-11-23 · [AUD-FIX-S4](roadmap/avances/AUD-FIX-S4.md) · AUD-FIX-S4: `controla_vencimiento` del alta se persiste en `products` (migración 0061) y vuelve en la ficha HTTP.
- 2026-11-23 · [AUD-FIX-S5](roadmap/avances/AUD-FIX-S5.md) · AUD-FIX-S5: `permisos[]` sale del payload de alta de producto; los permisos se resuelven solo desde la sesión y no hay columna…
- 2026-11-23 · [AUD-FIX-S6](roadmap/avances/AUD-FIX-S6.md) · AUD-FIX-S6: el alta de cuenta de servicio del panel manda alias, email de origen y día de vencimiento; el schema y el repo ya los…
- 2026-11-23 · [AUD-FIX-S7](roadmap/avances/AUD-FIX-S7.md) · AUD-FIX-S7: el modo de primera factura se persiste en `fiscal_wizard.modo_primera_factura` (migración 0061) y sobrevive al…
- 2026-11-23 · [AUD-FIX-S8](roadmap/avances/AUD-FIX-S8.md) · AUD-FIX-S8: `/panel/pagos` lista y opera `payment_orders` (preparar, confirmar pago y cancelar) y convive con el pago de facturas…
- 2026-11-23 · [AUD-FIX-VTA-1](roadmap/avances/AUD-FIX-VTA-1.md) · AUD-FIX-VTA-1: `armarCobroDesdeCarrito` manda `por_peso` (contrato de `/api/sales` y `/api/credit/sales-on-account`) en vez de…
- 2026-11-23 · [AUD-FIX-VTA-2](roadmap/avances/AUD-FIX-VTA-2.md) · AUD-FIX-VTA-2: `precio_id` sale de `salesLineSchema` y del formulario de corrección; el payload viejo sigue entrando y la línea…
- 2026-11-23 · [AUD-S2](roadmap/avances/AUD-S2.md) · AUD-S2: `audit:db` corrido contra Supabase y el clúster local (catálogo idéntico) con el drift triageado en…
- 2026-11-23 · [AUD-S3](roadmap/avances/AUD-S3.md) · AUD-S3: `npm run check:columnas` valida las tablas y columnas que referencia el SQL crudo de `src/` contra `src/db/schema*.ts`,…
- 2026-11-23 · [AUD-S4](roadmap/avances/AUD-S4.md) · AUD-S4: round-trip por módulo crítico en 31 tablas (ventas, caja, inventario, fiado, fiscal); el harness inserta todas las…

## En curso

- 2026-11-22 · [WA-ESTADOS-WEBHOOK](roadmap/avances/WA-ESTADOS-WEBHOOK.md) · WA-ESTADOS-WEBHOOK: la ruta del webhook guarda los estados de Meta (sent, delivered, read, failed) en whatsapp_usage con…

## Pendientes y bloqueados

- 2026-11-22 · [TB-169](roadmap/avances/TB-169.md) · TB-169: spec aceptada para simplificar `/panel/stock` con una próxima acción por estado del negocio.
- 2026-11-21 · [P10-93](roadmap/avances/P10-93.md) · P10-93: venta por peso con gramos enteros, precio por kilogramo y ticket en kilogramos.
- 2026-11-18 · [STOCK-E5](roadmap/avances/STOCK-E5.md) · STOCK-E5 parcial: alta de códigos en `/panel/stock` (STOCK-S19) más edición/baja vía `PATCH /api/products` con `codigo` (dedupe…
- 2026-11-15 · [GGL-E1, GGL-E2, GGL-E3 y GGL-E4](roadmap/avances/0102.md) · GGL-E1–E3 implementados en repo (OAuth PKCE, token cifrado, watch/history, Pub/Sub OIDC, cola, panel, remitentes, S10b, S12), con…
- 2026-11-15 · [GGL-P0-HUECOS](roadmap/avances/GGL-P0-HUECOS.md) · GGL-P0-HUECOS pendiente: cerrar los cinco huecos P0 de la ingesta Gmail que la auditoría 2026-11-15 encontró entre ADR-0103 y el…
- 2026-11-15 · [P10-17](roadmap/avances/P10-17.md) · P10-17: el fallback de `promote` en `src/pages/api/sync/promote.ts` (`src/lib/repos/sync.ts:690-727`) numera `T-*` desde el…
- 2026-10-20 · [P10-8](roadmap/avances/P10-8.md) · P10-8 queda bloqueado: las ventas offline aplicadas desde la outbox (P10-6) no crean el doc fiscal pendiente que arma `POST…
- 2026-10-19 · [FE-S26](roadmap/avances/FE-S26.md) · FE-S26 parcial: `fiscal_computers` y `arca_tokens` dejan de ser tablas sin uso. `src/lib/repos/fiscal-control.ts` guarda el…
- 2026-10-18 · [OCR1-S3](roadmap/avances/OCR1-S3.md) · OCR1-S3 parcial: benchmark del extractor OCR sobre un corpus etiquetado (tests/ocr-benchmark.test.ts, exactitud global 0.9667);…
- 2026-10-18 · [P9-2](roadmap/avances/P9-2.md) · P9-2 sigue bloqueado: Mauri difirió la decisión el 2026-10-18; ADR-0090 queda propuesto hasta que designe contador y abogado.

## Migraciones aplicadas

Última aplicada: `0061_campos_huerfanos`.
Total: 62.

## Bloqueado y de quién depende

Credenciales externas:

- Google OAuth real · depende de Mauri (credenciales del proyecto y consentimiento)
- Meta WhatsApp Cloud API · depende de Mauri (alta del número central, verificación del negocio y plantillas)
- Resend (email) · depende de Mauri (cuenta y dominio verificado)
- Sentry · depende de Mauri (proyecto y DSN)
- Mercado Pago · depende de Mauri (credenciales y cuenta)
- Corpus del piloto OCR (imágenes y endpoint Paddle) · depende de Mauri (set etiquetado del piloto y host CX22/CX33 para medir exactitud y latencia; OCR1-S3)
- Google OAuth (Gmail/Photos) · depende de Mauri (GOOGLE_INTEGRATIONS_CLIENT_ID/SECRET/REDIRECT; consents versionados por conexión)
- Google Pub/Sub y KMS · depende de Mauri (topic para users.watch y clave de cifrado de refresh tokens; ADR-0102)
- Google Photos (espejo opcional) · depende de Mauri (segunda ola tras Gmail; ADR-0104 propuesto)

Decisiones de Mauri:

- Fiscal ARCA · depende de Mauri (certificado y homologación; ADR-0090 diferido, P9-2)
- Proveedor LLM real y costos · depende de Mauri (Anthropic/OpenAI y tarifas; mientras tanto un proveedor free)
- Pricing y planes publicados (PLAN-02) · depende de Mauri (montos finales por plan)
- Gmail UI, consentimiento y remitentes · depende de Mauri (UI de conexión/desconexión, invalid_grant, administración de remitentes y modo prueba; PRD-GMAIL-01)

## Gate de merge

- `npm run verify` (Node 22, Postgres A/B) debe pasar, y `node scripts/cadena/puede-mergear.mjs <PR>` debe salir 0.
- Squash-merge y borrar la rama.
- Las migraciones solo se aplican con aprobación de Mauri y se registran en `docs/roadmap/migraciones/<tag>.json` antes del merge del PR que las trae.
