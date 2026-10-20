# Estado del proyecto

Generado por `npm run docs:estado`. No editar a mano.

## Hecho reciente (últimos 15 avances)

- 2026-10-20 · [P10-1](roadmap/avances/P10-1.md) · El cobro de venta se registra en caja como ingreso, no como egreso, y la devolución toma el signo opuesto (C8.8).
- 2026-10-20 · [P10-2](roadmap/avances/P10-2.md) · La venta a cuenta persiste venta, ticket, líneas de ticket y stock, no solo el movimiento de crédito (FC2).
- 2026-10-20 · [P10-3](roadmap/avances/P10-3.md) · El cobro de fiado es atómico entre el abono al cliente y la entrada de caja (FC5).
- 2026-10-20 · [P10-4](roadmap/avances/P10-4.md) · Una devolución de una venta a cuenta reintegra el crédito del cliente en vez de hardcodear `fueAcuenta: false` (FC10).
- 2026-10-20 · [P10-5](roadmap/avances/P10-5.md) · `ticket_lines` y `ticket_discounts` se insertan al emitir una venta y se leen al consultar el ticket (TV1/TV2).
- 2026-10-20 · [PLAN-S8](roadmap/avances/PLAN-S8.md) · PLAN-S8 hecho: `GET /api/panel/indice` suma `upsell` (ofertas por módulo fuera del plan, sin descartes) y `rol`, y `/panel`…
- 2026-10-19 · [BOT-S8](roadmap/avances/BOT-S8.md) · BOT-S8 hecho: el resumen mensual suma hasta 3 acciones deterministas (`src/modules/bot/acciones-propuestas.ts`: `reponer` del…
- 2026-10-19 · [CAT-S7 a CAT-S11](roadmap/avances/0101.md) · CAT-S7 a CAT-S11: persistencia de `products.sector` con la migración 0029, catálogo y conteo DB-first, normalización y tests PG…
- 2026-10-19 · [DASH-S12](roadmap/avances/DASH-S12.md) · DASH-S12 hecho: el índice de `/panel` sale de una lista declarativa única (`MODULOS_INDICE` en `src/lib/panel-modulos.ts`) que…
- 2026-10-19 · [DASH-S7](roadmap/avances/DASH-S7.md) · DASH-S7 hecho: `/panel` abre el drawer `Preguntale al negocio` con 8-12 preguntas sugeridas derivadas de las lecturas conectadas…
- 2026-10-19 · [DASH-S9](roadmap/avances/DASH-S9.md) · DASH-S9 hecho: máquina pura `src/lib/asistente-chat.ts` con los 5 estados (`inactivo`, `enviando`, `respondiendo`, `error`,…
- 2026-10-19 · [IA-S4](roadmap/avances/IA-S4.md) · IA-S4 hecho: `POST /api/asistente` (tenant y rol de la sesión, body zod, cupo del plan, `fuera_de_plan` 403 antes de crear el…
- 2026-10-19 · [P9-15](roadmap/avances/P9-15.md) · P9-15: inventario consultable de credenciales externas con carga guiada, y OpenRouter en lugar de Groq como puente free del…
- 2026-10-19 · [PLAN-S7](roadmap/avances/PLAN-S7.md) · PLAN-S7 hecho: `/panel/plan` queda solo para el Dueño (`GET /api/plan/resumen` responde 403 al empleado) y muestra la renovación…
- 2026-10-19 · [PROV-E4 (PROV-S11 y PROV-S12)](roadmap/avances/PROV-E4.md) · PROV-E4 hecho: cupo por número de proveedor (`CUPO_PROV_MENSAJES` = 20 mensajes por ventana móvil de `CUPO_PROV_VENTANA_MIN` = 60…

## En curso

- 2026-10-20 · [GGL-E1, GGL-E2, GGL-E3 y GGL-E4](roadmap/avances/0102.md) · GGL-E1 a GGL-E4: PRD y ADRs listos; migraciones 0030/0031, OAuth con PKCE/state, repositorio cifrado y rutas…

## Pendientes y bloqueados

- 2026-10-19 · [FE-S26](roadmap/avances/FE-S26.md) · FE-S26 parcial: `fiscal_computers` y `arca_tokens` dejan de ser tablas sin uso. `src/lib/repos/fiscal-control.ts` guarda el…
- 2026-10-19 · [PROV-E1, PROV-E2 y PROV-E3](roadmap/avances/0096.md) · PROV-E1, PROV-E2 y PROV-E3: alta de proveedores por WhatsApp con código de invitación, identidad por el CUIT leído, aviso al…
- 2026-10-18 · [OCR1-S3](roadmap/avances/OCR1-S3.md) · OCR1-S3 parcial: benchmark del extractor OCR sobre un corpus etiquetado (tests/ocr-benchmark.test.ts, exactitud global 0.9667);…
- 2026-10-18 · [OCR1-S5](roadmap/avances/OCR1-S5.md) · OCR1-S5 parcial: la ingesta vive una sola vez en `src/lib/ocr-ingesta.ts` (`ingerirOcr` + `respuestaIngesta`) y `POST…
- 2026-10-18 · [P9-2](roadmap/avances/P9-2.md) · P9-2 sigue bloqueado: Mauri difirió la decisión el 2026-10-18; ADR-0090 queda propuesto hasta que designe contador y abogado.

## Migraciones aplicadas

Última aplicada: `0031_gmail_ingestion`.
Total: 32.

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
