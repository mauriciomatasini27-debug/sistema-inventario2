# Estado del proyecto

Generado por `npm run docs:estado`. No editar a mano.

## Hecho reciente (últimos 15 avances)

- 2026-10-21 · [P10-13](roadmap/avances/P10-13.md) · P10-13 hecho: el catálogo offline de /venta se aísla por tenant y el script principal vuelve a empaquetarse.
- 2026-10-20 · [IA-S2-LECTURAS](roadmap/avances/IA-S2-LECTURAS.md) · IA-S2-LECTURAS hecho: `top_productos`, `margen_producto` y `rotacion_lenta` leen datos reales del tenant (DB-first con espejo en…
- 2026-10-20 · [ON4-5](roadmap/avances/ON4-5.md) · ON4-5 hecho: `/panel/stock` suma la sección "Ubicaciones" que lista y crea ubicaciones contra `/api/locations` (409 duplicada con…
- 2026-10-20 · [ON4-5-RENOMBRAR](roadmap/avances/ON4-5-RENOMBRAR.md) · ON4-5-RENOMBRAR hecho: `PATCH /api/locations` con zod `{ id uuid, nombre 1..80 con trim }` renombra la ubicación del tenant vía…
- 2026-10-20 · [ON4-SEED](roadmap/avances/ON4-SEED.md) · ON4-SEED hecho: al terminar `POST /api/onboarding/alta` se siembran las ubicaciones de `plantilla_rubro(rubro)` (kiosco 6, rubro…
- 2026-10-20 · [P10-1](roadmap/avances/P10-1.md) · El cobro de venta se registra en caja como ingreso, no como egreso, y la devolución toma el signo opuesto (C8.8).
- 2026-10-20 · [P10-10](roadmap/avances/P10-10.md) · P10-10 hecho: el stock inicial ya no se duplica cuando dos "Guardar" llegan a la vez.
- 2026-10-20 · [P10-11](roadmap/avances/P10-11.md) · P10-11 hecho: la pantalla de stock muestra y acepta montos en pesos, con las APIs y la base en centavos.
- 2026-10-20 · [P10-12](roadmap/avances/P10-12.md) · P10-12 hecho: la pantalla de precios muestra montos en pesos es-AR, con las APIs y la base en centavos.
- 2026-10-20 · [P10-2](roadmap/avances/P10-2.md) · La venta a cuenta persiste venta, ticket, líneas de ticket y stock, no solo el movimiento de crédito (FC2).
- 2026-10-20 · [P10-3](roadmap/avances/P10-3.md) · El cobro de fiado es atómico entre el abono al cliente y la entrada de caja (FC5).
- 2026-10-20 · [P10-4](roadmap/avances/P10-4.md) · Una devolución de una venta a cuenta reintegra el crédito del cliente en vez de hardcodear `fueAcuenta: false` (FC10).
- 2026-10-20 · [P10-5](roadmap/avances/P10-5.md) · `ticket_lines` y `ticket_discounts` se insertan al emitir una venta y se leen al consultar el ticket (TV1/TV2).
- 2026-10-20 · [P10-6](roadmap/avances/P10-6.md) · Las ventas offline que llegan por `POST /api/sync/push` (`modulo: "sales"`) se aplican con `registrar_venta`: venta, ticket,…
- 2026-10-20 · [P10-7](roadmap/avances/P10-7.md) · Las ventas offline que no se pueden aplicar quedan visibles para el Dueño en `/panel/ventas-pendientes`, con su motivo, para…

## En curso

- 2026-10-20 · [GGL-E1, GGL-E2, GGL-E3 y GGL-E4](roadmap/avances/0102.md) · GGL-E1 a GGL-E4: PRD y ADRs listos; migraciones 0030/0031, OAuth con PKCE/state, repositorio cifrado y rutas…

## Pendientes y bloqueados

- 2026-10-20 · [ON4-SEED-DB](roadmap/avances/ON4-SEED-DB.md) · ON4-SEED-DB parcial: la siembra de ubicaciones por rubro queda registrada en `tenant_location_seeds` (migración…
- 2026-10-20 · [P10-8](roadmap/avances/P10-8.md) · P10-8 queda bloqueado: las ventas offline aplicadas desde la outbox (P10-6) no crean el doc fiscal pendiente que arma `POST…
- 2026-10-20 · [P10-9](roadmap/avances/P10-9.md) · P10-9 pendiente: en `/panel/ventas-pendientes` la corrección se hace editando el JSON crudo del payload; Mauri pidió a futuro un…
- 2026-10-20 · [STOCK-E1 y STOCK-E2](roadmap/avances/0106.md) · STOCK-E1 y STOCK-E2 propuestos: PRD-STOCK-01 y ADR-0106/0107 documentan el alta al vender y el catálogo sugerido por rubro; las…
- 2026-10-20 · [STOCK-E3](roadmap/avances/0108.md) · STOCK-E3 propuesto: PRD-STOCK-02 y ADR-0108 documentan la importación de stock desde CSV/Excel con vista previa y errores por…
- 2026-10-19 · [FE-S26](roadmap/avances/FE-S26.md) · FE-S26 parcial: `fiscal_computers` y `arca_tokens` dejan de ser tablas sin uso. `src/lib/repos/fiscal-control.ts` guarda el…
- 2026-10-19 · [PROV-E1, PROV-E2 y PROV-E3](roadmap/avances/0096.md) · PROV-E1, PROV-E2 y PROV-E3: alta de proveedores por WhatsApp con código de invitación, identidad por el CUIT leído, aviso al…
- 2026-10-18 · [OCR1-S3](roadmap/avances/OCR1-S3.md) · OCR1-S3 parcial: benchmark del extractor OCR sobre un corpus etiquetado (tests/ocr-benchmark.test.ts, exactitud global 0.9667);…
- 2026-10-18 · [OCR1-S5](roadmap/avances/OCR1-S5.md) · OCR1-S5 parcial: la ingesta vive una sola vez en `src/lib/ocr-ingesta.ts` (`ingerirOcr` + `respuestaIngesta`) y `POST…
- 2026-10-18 · [P9-2](roadmap/avances/P9-2.md) · P9-2 sigue bloqueado: Mauri difirió la decisión el 2026-10-18; ADR-0090 queda propuesto hasta que designe contador y abogado.

## Migraciones aplicadas

Última aplicada: `0036_stock_inicial_unico`.
Total: 37.

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
- Las migraciones solo se aplican con aprobación de Mauri y se registran en `docs/roadmap/migraciones-aplicadas.md` antes del merge del PR que las trae.
