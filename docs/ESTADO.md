# Estado del proyecto

Generado por `npm run docs:estado`. No editar a mano.

## Hecho reciente (últimos 15 avances)

- 2026-10-17 · [DASH-S1](roadmap/avances/DASH-S1.md) · DASH-S1 hecho: /panel/bot/config con estado de vinculación por persona (vinculado, pendiente con expira_en, pausado con…
- 2026-10-17 · [DASH-S3](roadmap/avances/DASH-S3.md) · DASH-S3 hecho: tarjeta Bot en el índice de /panel con consultas de hoy, última consulta en hora AR y estado del número central…
- 2026-10-17 · [DASH-S4](roadmap/avances/DASH-S4.md) · DASH-S4 hecho: /panel/alertas/umbrales con tabla de productos con min_stock y reorder_qty editables en línea vía el PATCH…
- 2026-10-17 · [DASH-S8](roadmap/avances/DASH-S8.md) · DASH-S8 hecho (parcial: /panel/plan; el medidor del drawer espera a DASH-S7): núcleo puro `src/lib/plan-panel.ts` (nombre del…
- 2026-10-17 · [DS-LANDING-AA](roadmap/avances/DS-LANDING-AA.md) · Landing `/` legible en Tema Papel con header claro (decisión de Mauri): texto oscuro en secciones claras y claro en las oscuras,…
- 2026-10-17 · [DS-S12](roadmap/avances/DS-S12.md) · DS-S12: la franja KPI de `/panel` (`KpiStrip.astro`) arranca con skeleton y shimmer sutil en tokens `--tema-*` y…
- 2026-10-17 · [DS-S17](roadmap/avances/DS-S17.md) · DS-S17 hecho: `/venta` con `viewport-fit=cover` y padding `env(safe-area-inset-*)`, touch 44px y 360px sin desborde cubiertos por…
- 2026-10-17 · [DS-S19](roadmap/avances/DS-S19.md) · DS-S19: sin rastro de ModoOps en código: el remitente por defecto de `src/lib/alertas-seguridad.ts` pasa de `ModoOps…
- 2026-10-17 · [DS-S2](roadmap/avances/DS-S2.md) · DS-S2: tokens ember (`--color-ember-ambar/coral/rojo/vino`) en `global.css` y `tokens-papel.css` y el segbar del panel…
- 2026-10-17 · [DS-S3](roadmap/avances/DS-S3.md) · DS-S3: papel `#f7f5f2` (`var(--color-canvas)`) en `/venta`, `/alta`, `/alta/estado` y `/t/[token]` en lugar de `#f5f1e8`, tokens…
- 2026-10-17 · [DS-S4](roadmap/avances/DS-S4.md) · DS-S4: tema claro/oscuro por dispositivo con `src/styles/tema.css` (roles `--tema-*` y `--estado-*`), `src/lib/tema.ts`,…
- 2026-10-17 · [DS-S5](roadmap/avances/DS-S5.md) · DS-S5: vidrio en panel/POS con `.vidrio-barra`/`.vidrio-card` (blur 16px bajo `@supports`, fallback opaco y…
- 2026-10-17 · [DS-S6](roadmap/avances/DS-S6.md) · DS-S6: pila del sistema (`--font-sans` en `global.css` y `tokens-papel.css`) en todas las páginas, se quitó el `<link>` de Inter…
- 2026-10-17 · [P3-7a](roadmap/avances/P3-7a.md) · P3-7a hecho: pantallas full de Caja, Stock y Precios en `/panel` (#142); decisión: la navegación vive una sola vez en…
- 2026-10-17 · [P3-7b](roadmap/avances/P3-7b.md) · P3-7b hecho: Proveedores, Fiado, Consumos y Reportes tienen pantalla y los enlaces ↗ del panel apuntan a cada módulo;…

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
