# Estado del proyecto

Generado por `npm run docs:estado`. No editar a mano.

## Hecho reciente (últimos 15 avances)

- 2026-10-18 · [IA-LLM-FREE](roadmap/avances/IA-LLM-FREE.md) · IA-LLM-FREE: adaptador de proveedor LLM compatible con la API OpenAI (Groq free como puente) detrás de `ProveedorLLM`, con…
- 2026-10-18 · [OCR1-S4](roadmap/avances/OCR1-S4.md) · OCR1-S4 hecho: el umbral de fallback vive en `UMBRAL_FALLBACK_NUBE = 0.6` (`src/modules/ocr/motor.ts`, ADR-0089 prevé subirlo a…
- 2026-10-18 · [P1-9](roadmap/avances/P1-9.md) · P1-9: el login persiste el usuario en `users`, así el alta de comercio deja de fallar la FK y llega a Supabase.
- 2026-10-18 · [P9-1](roadmap/avances/P9-1.md) · P9-1 desbloqueado: Mauri aprobó ADR-0089 el 2026-10-18 y ratificó PaddleOCR PP-OCRv5 autohospedado como motor primario de Fase 0;…
- 2026-10-18 · [P9-3](roadmap/avances/P9-3.md) · P9-3 desbloqueado: Mauri aprobó ADR-0091 el 2026-10-18 y eligió la Cloud API directa de Meta para el número central; pasa a…
- 2026-10-18 · [P9-5](roadmap/avances/P9-5.md) · P9-5 desbloqueado: Mauri aprobó ADR-0092 el 2026-10-18 y eligió Mercado Pago en pesos con débito automático; pasa a ejecución por…
- 2026-10-18 · [PLAN-S2](roadmap/avances/PLAN-S2.md) · PLAN-S2 hecho: PATCH /api/bot-modulos bloquea encender un módulo de rubro con 403 `fuera_de_plan` cuando el plan activo no…
- 2026-10-18 · [PLAN-S4](roadmap/avances/PLAN-S4.md) · PLAN-S4 hecho: `POST /api/plan/cambiar` (solo Dueño) programa la baja a fin de período en `plan_programado` sin reintegro y fija…
- 2026-10-18 · [SUP-S5](roadmap/avances/SUP-S5.md) · SUP-S5: prueba viva contra Supabase con venta y `GET /api/cash/balance`, `GET /api/tickets` y balance de credit con `fuente:…
- 2026-10-18 · [SUP-S6](roadmap/avances/SUP-S6.md) · SUP-S6: `npm test` verde en `tests/sync-durable.test.ts`, `tests/pers-write-through.test.ts` y `tests/credit-rutas.test.ts`; `npm…
- 2026-10-17 · [DASH-S1](roadmap/avances/DASH-S1.md) · DASH-S1 hecho: /panel/bot/config con estado de vinculación por persona (vinculado, pendiente con expira_en, pausado con…
- 2026-10-17 · [DASH-S3](roadmap/avances/DASH-S3.md) · DASH-S3 hecho: tarjeta Bot en el índice de /panel con consultas de hoy, última consulta en hora AR y estado del número central…
- 2026-10-17 · [DASH-S4](roadmap/avances/DASH-S4.md) · DASH-S4 hecho: /panel/alertas/umbrales con tabla de productos con min_stock y reorder_qty editables en línea vía el PATCH…
- 2026-10-17 · [DASH-S8](roadmap/avances/DASH-S8.md) · DASH-S8 hecho (parcial: /panel/plan; el medidor del drawer espera a DASH-S7): núcleo puro `src/lib/plan-panel.ts` (nombre del…
- 2026-10-17 · [DS-LANDING-AA](roadmap/avances/DS-LANDING-AA.md) · Landing `/` legible en Tema Papel con header claro (decisión de Mauri): texto oscuro en secciones claras y claro en las oscuras,…

## En curso

- Sin avances en curso.

## Pendientes y bloqueados

- 2026-10-19 · [PROV-E1 y PROV-E2](roadmap/avances/0096.md) · PROV-E1 y PROV-E2: alta de proveedores por WhatsApp con código de invitación e identidad por CUIT leído (contactos en memoria; E3…
- 2026-10-18 · [OCR1-S3](roadmap/avances/OCR1-S3.md) · OCR1-S3 parcial: benchmark del extractor OCR sobre un corpus etiquetado (tests/ocr-benchmark.test.ts, exactitud global 0.9667);…
- 2026-10-18 · [OCR1-S5](roadmap/avances/OCR1-S5.md) · OCR1-S5 parcial: la ingesta vive una sola vez en `src/lib/ocr-ingesta.ts` (`ingerirOcr` + `respuestaIngesta`) y `POST…
- 2026-10-18 · [P9-2](roadmap/avances/P9-2.md) · P9-2 sigue bloqueado: Mauri difirió la decisión el 2026-10-18; ADR-0090 queda propuesto hasta que designe contador y abogado.

## Migraciones aplicadas

Última aplicada: `0028_tenant_bot_modules`.
Total: 29.

## Bloqueado y de quién depende

Credenciales externas:

- Google OAuth real · depende de Mauri (credenciales del proyecto y consentimiento)
- Meta WhatsApp Cloud API · depende de Mauri (alta del número central, verificación del negocio y plantillas)
- Resend (email) · depende de Mauri (cuenta y dominio verificado)
- Sentry · depende de Mauri (proyecto y DSN)
- Mercado Pago · depende de Mauri (credenciales y cuenta)
- Corpus del piloto OCR (imágenes y endpoint Paddle) · depende de Mauri (set etiquetado del piloto y host CX22/CX33 para medir exactitud y latencia; OCR1-S3)

Decisiones de Mauri:

- Fiscal ARCA · depende de Mauri (certificado y homologación; ADR-0090 diferido, P9-2)
- Proveedor LLM real y costos · depende de Mauri (Anthropic/OpenAI y tarifas; mientras tanto un proveedor free)
- Pricing y planes publicados (PLAN-02) · depende de Mauri (montos finales por plan)

## Gate de merge

- `npm run verify` (Node 22, Postgres A/B) debe pasar, y `node scripts/cadena/puede-mergear.mjs <PR>` debe salir 0.
- Squash-merge y borrar la rama.
- Las migraciones solo se aplican con aprobación de Mauri y se registran en `docs/roadmap/migraciones-aplicadas.md` antes del merge del PR que las trae.
