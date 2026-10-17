# Estado del proyecto

Generado por `npm run docs:estado`. No editar a mano.

## Hecho reciente (últimos 15 avances)

- 2026-10-17 · [DASH-S1](roadmap/avances/DASH-S1.md) · DASH-S1 hecho: /panel/bot/config con estado de vinculación por persona (vinculado, pendiente con expira_en, pausado con…
- 2026-10-17 · [DASH-S3](roadmap/avances/DASH-S3.md) · DASH-S3 hecho: tarjeta Bot en el índice de /panel con consultas de hoy, última consulta en hora AR y estado del número central…
- 2026-10-17 · [DASH-S4](roadmap/avances/DASH-S4.md) · DASH-S4 hecho: /panel/alertas/umbrales con tabla de productos con min_stock y reorder_qty editables en línea vía el PATCH…
- 2026-10-17 · [DASH-S8](roadmap/avances/DASH-S8.md) · DASH-S8 hecho (parcial: /panel/plan; el medidor del drawer espera a DASH-S7): núcleo puro `src/lib/plan-panel.ts` (nombre del…
- 2026-10-17 · [P3-7a](roadmap/avances/P3-7a.md) · P3-7a hecho: pantallas full de Caja, Stock y Precios en `/panel` (#142); decisión: la navegación vive una sola vez en…
- 2026-10-17 · [P3-7b](roadmap/avances/P3-7b.md) · P3-7b hecho: Proveedores, Fiado, Consumos y Reportes tienen pantalla y los enlaces ↗ del panel apuntan a cada módulo;…
- 2026-10-17 · [P3-7c](roadmap/avances/P3-7c.md) · P3-7c hecho: `GET /api/sales/resumen` reemplaza los números `demo` del panel con agregados de servidor (tickets de hoy, stock…
- 2026-10-17 · [P3-7d](roadmap/avances/P3-7d.md) · P3-7d hecho: `GET /api/suppliers` y `GET /api/credit/customers` agregan listados read-only tenant-scoped con `?q=`…
- 2026-10-17 · [P3-7e](roadmap/avances/P3-7e.md) · P3-7e hecho: `panel.astro` queda como composición fina sobre componentes en `src/components/panel/` (`TopPills`, `KpiStrip`,…
- 2026-10-17 · [P3-7f](roadmap/avances/P3-7f.md) · P3-7f hecho: `GET /api/sales/resumen` netea devoluciones (`sale_returns`) y correcciones de medio (`ticket_payment_corrections`)…
- 2026-10-17 · [P3-7g](roadmap/avances/P3-7g.md) · P3-7g hecho: `HeatCard` y la barra segmentada del panel dejan sus últimos números `demo` sin endpoint nuevo; `ResumenPanel` suma…
- 2026-10-17 · [P9-4](roadmap/avances/P9-4.md) · P9-4 hecho: migraciones 0016 a 0019 (y hasta 0028) aplicadas en la base real, registradas en…
- 2026-10-17 · [T-UI-05](roadmap/avances/T-UI-05.md) · T-UI-05: medición de contraste AA por par en `scripts/check-contrast-lib.mjs` con umbral texto 4.5 / grande 3.0, tabla generada…
- 2026-10-16 · [ALR-S1](roadmap/avances/ALR-S1.md) · ALR-S1 hecho: min_stock y reorder_qty de products persistidos y editables desde el panel (PATCH /api/products valida min_stock…
- 2026-10-16 · [BOT-S1](roadmap/avances/BOT-S1.md) · BOT-S1/S2 hechos: módulos del bot por tenant (`rotacion`, `vencimientos`, `flujo_caja`, `cobranza`, `ordenes_produccion`,…

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
