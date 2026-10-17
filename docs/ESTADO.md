# Estado del proyecto

Generado por `npm run docs:estado`. No editar a mano.

## Hecho reciente (últimos 15 avances)

- 2026-10-17 · [P3-7a](roadmap/avances/P3-7a.md) · P3-7a hecho: pantallas full de Caja, Stock y Precios en `/panel` (#142); decisión: la navegación vive una sola vez en…
- 2026-10-17 · [P3-7b](roadmap/avances/P3-7b.md) · P3-7b hecho: Proveedores, Fiado, Consumos y Reportes tienen pantalla y los enlaces ↗ del panel apuntan a cada módulo;…
- 2026-10-17 · [P9-4](roadmap/avances/P9-4.md) · P9-4 hecho: migraciones 0016 a 0019 (y hasta 0028) aplicadas en la base real, registradas en…
- 2026-10-16 · [ALR-S1](roadmap/avances/ALR-S1.md) · ALR-S1 hecho: min_stock y reorder_qty de products persistidos y editables desde el panel (PATCH /api/products valida min_stock…
- 2026-10-16 · [BOT-S1](roadmap/avances/BOT-S1.md) · BOT-S1/S2 hechos: módulos del bot por tenant (`rotacion`, `vencimientos`, `flujo_caja`, `cobranza`, `ordenes_produccion`,…
- 2026-10-16 · [BOT-S3](roadmap/avances/BOT-S3.md) · BOT-S3 hecho: el job diario del bot rubro quiosco une `vencimientos` (CAT-S4 15/7/3d) y `rotacion` (RT6 dormidos) en UN mensaje…
- 2026-10-16 · [BOT-S4](roadmap/avances/BOT-S4.md) · BOT-S4 hecho: el job diario del bot rubro pyme une `flujo_caja` (caja de hoy contra los pagos pendientes a 7 días, con faltante y…
- 2026-10-16 · [BOT-S7](roadmap/avances/BOT-S7.md) · BOT-S7 hecho: el job mensual (`src/jobs/resumen-mensual.ts`, núcleo puro, y `POST /api/jobs/resumen-mensual` con `correrJob`,…
- 2026-10-16 · [CI-LOCAL](roadmap/avances/CI-LOCAL.md) · CI-LOCAL: verificación local con `npm run verify` (replica ci.yml y regenera ROADMAP/INDEX) y los cuatro workflows de GitHub…
- 2026-10-16 · [IA-S1 a IA-S3](roadmap/avances/PRD-IA-01.md) · IA-S1 a IA-S3: asistente con catálogo cerrado detrás de ProveedorLLM + fake, registro en memoria; la tabla ai_usage queda para…
- 2026-10-16 · [IA-S5](roadmap/avances/IA-S5.md) · IA-S5 hecho: `src/lib/repos/ia-uso.ts` persiste una fila por consulta en `ai_usage` (tenant, mes, proveedor, modelo, tokens,…
- 2026-10-16 · [LP3-S1 a LP3-S5](roadmap/avances/PRD-LP-03.md) · LP3-S1 a LP3-S5: accesos Mi comercio/Admin vía login con destino desde header y hero, nav solo anclas y Entrar de alta a /panel.
- 2026-10-16 · [LP4-S1 a LP4-S5](roadmap/avances/PRD-LP-04.md) · LP4-S1 a LP4-S5: ChatLanding reemplaza el flotante y /api/landing-chat responde solo desde FAQ/planes/rubros de ejemplo con cupo…
- 2026-10-16 · [P3-1](roadmap/avances/P3-1.md) · P3-1 hecho: PRD-CAT-01 (CAT-S1..S6), PRD-CAJA-01 (CAJA-S1..S4, #76 #78 #81 #82), PWA P1.8 (#51) y SYNC-S1..S7 (#103 #104 #105…
- 2026-10-16 · [P3-2a](roadmap/avances/P3-2a.md) · P3-2a hecho: AU-FIX-S1 a S6 cumplen con evidencia (S1 redirect con 2 cookies en `login.ts:47-50`, S2 sin `void headers` en…

## En curso

- Sin avances en curso.

## Pendientes y bloqueados

- 2026-10-14 · [P9-1](roadmap/avances/P9-1.md) · P9-1 bloqueado por decisiones de Mauri: Proveedor de OCR definitivo (ADR-0005: PaddleOCR propio vs Vision/Textract).
- 2026-10-14 · [P9-2](roadmap/avances/P9-2.md) · P9-2 bloqueado por decisiones de Mauri: Consulta legal/fiscal con contador y abogado y certificados ARCA (fecha límite 1/12/2026…
- 2026-10-14 · [P9-3](roadmap/avances/P9-3.md) · P9-3 bloqueado por decisiones de Mauri: Número central de WhatsApp en Meta (alta, verificación del negocio y plantillas).
- 2026-10-14 · [P9-5](roadmap/avances/P9-5.md) · P9-5 sigue bloqueado por decisiones de Mauri: proveedor de cobro y precios a publicar (PLAN2-S4); la persistencia de planes y…

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

Decisiones de Mauri:

- Fiscal ARCA · depende de Mauri (certificado y homologación)
- Proveedor de OCR · depende de Mauri (PaddleOCR propio vs Vision/Textract)
- Proveedor LLM real y costos · depende de Mauri (Anthropic/OpenAI y tarifas)
- Pricing y planes publicados (PLAN-02) · depende de Mauri (precios y proveedor de cobro)
- P2-4 SUP-S5/S6 (Supabase live) · depende de Mauri (solo Mauri corre contra la base real)

## Gate de merge

- `npm run verify` (Node 22, Postgres A/B) debe pasar, y `node scripts/cadena/puede-mergear.mjs <PR>` debe salir 0.
- Squash-merge y borrar la rama.
- Las migraciones solo se aplican con aprobación de Mauri y se registran en `docs/roadmap/migraciones-aplicadas.md` antes del merge del PR que las trae.
