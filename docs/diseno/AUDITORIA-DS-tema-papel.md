---
id: AUDITORIA-DS-01
tipo: spec
estado: hecho
modulos: []
depende_de: [PRD-DS-01, PRD-DS-02, PRD-DS-03, ADR-0008, ADR-0009]
reemplaza: []
reemplazado_por: ""
resumen: Auditoría 2026-10-17 de la adopción Tema Papel (DS-S1 a DS-S23) contra el repo, con evidencia por slice, lo hecho en este PR y lo que espera decisión.
---

# Auditoría de adopción Tema Papel (DS-S1 a DS-S23)

Fecha: 2026-10-17, sobre `main` en `6aace67` más este PR. Fuentes: PRD-DS-01, PRD-DS-02, PRD-DS-03, ADR-0008, ADR-0009, ADR-0010, SPEC-UI-00.

Contexto que cambia la lectura de los PRD: los PRD-DS describen el tema de ModoOps (Odoo: launcher, rail, hub, login, onboarding). Inventario es Astro con páginas propias. SPEC-UI-00 decidió quedarse con los tokens `--color-*` del `@theme` de `src/styles/global.css` y no portar `--mo-*`; `src/styles/tokens-papel.css` es su espejo para las páginas sin Tailwind (`tests/panel-tokens.test.ts`). ADR-0010 dice que la landing va "sin neón ni glass".

Estados: **hecho** (hay evidencia), **parcial**, **falta** (sin decisión pendiente, se puede hacer), **decisión** (falta y espera a Mauri), **no aplica** (pieza de Odoo/ModoOps sin equivalente o descartada por un ADR).

## Tabla

| Slice | Estado | Evidencia | Qué falta |
|---|---|---|---|
| DS-S1 Paleta llama y CTA | parcial | `--color-llama #ffd600`, `--color-star-warm #e64a19` (deep), `--color-star-glow #bf360c` (rust) en `global.css` y `tokens-papel.css`. CTA de la landing en `bg-star-glow` (decisión de Mauri 2026-10-17, ADR-0008). | Sin `orange #f57c00`, sin gradiente `135deg` ni sombra/`scale(0.98)` del CTA; `#ffe033` solo como variable local en `panel.astro`/`admin.astro`. Decisión: el gradiente amarillo→naranja con texto blanco no pasa AA. |
| DS-S2 Ember en secundarias | decisión | `rg "#ffb300\|#ff7043\|#ef5350\|#c62828" src` sin resultados. | No hay tiles secundarias de launcher; definir si las pills/tiles del panel usan ember. |
| DS-S3 Papel y canvas claros | hecho (cerrado en este PR) | `--color-canvas #f7f5f2`, `--color-linen #efecea`, `--color-void #1a1a1a`; sin `#71639e`. Este PR pasa `/venta`, `/alta`, `/alta/estado` y `/t/[token]` de `#f5f1e8` a `var(--color-canvas)` y el `manifest.webmanifest` de `#f7faf7` a `#f7f5f2`. | Ver hallazgo HIGH de la landing abajo. |
| DS-S4 Dark ambiente POS | parcial | `/venta` tiene bloque `prefers-color-scheme: dark` con `var(--color-void)` (T-UI-06, `docs/diseno/harness-venta.md`). | Sin `charcoal #2b2b2b`, `mid #333`, `muted rgba(255,255,255,.72)` ni el ambiente radial. Decisión: ¿POS oscuro siempre o solo con el modo del sistema? |
| DS-S5 Glass, radios, blur | decisión | `rg backdrop-filter src` vacío. Cards a 12px en `/venta`, `/alta`; landing `--radius-card 1.25rem` (20px, ADR-0010). Listas sin glass por fila (`TablaCatalogo.tsx`). | ADR-0010 descarta glass en la landing; falta decidir si el panel/POS lo usa. |
| DS-S6 Tipografía | decisión | `--font-sans: 'Inter', ui-sans-serif, system-ui` en `global.css`; panel y POS en `system-ui`. | El PRD pide Montserrat; es cambio de marca. |
| DS-S7 Variables CSS `:root`/`.pos` | no aplica (decidido) | SPEC-UI-00: tokens `--color-*`, sin port `--mo-*`. Este PR suma `tokens-papel.css` a `/alta`, `/alta/estado`, `/t/[token]` y `/admin` (antes solo `/panel/*` y `/venta`). | Rail y `.pos` no existen. Quedan colores de estado sin token en `panel.astro`/`admin.astro` (vivo/ok/warn/pend) y verdes `#0a0`/`#25d366`. |
| DS-S8 Motion reducido | hecho | Kill global con `reduce` en `global.css`; `panel.astro`, `ConfirmDialog.astro`, `Toaster.tsx`, `ChatLanding.astro`; NumberFlow con `respectMotionPreference` y spec `tests/e2e/catalogo-mil.spec.ts` con `reducedMotion: reduce`. Las páginas standalone no tienen transiciones (`rg transition` vacío en venta/alta/admin/PanelShell). | Nada. |
| DS-S9 Adaptación a Inventario | parcial | Tokens propios con papel conservado; botones de 44px en mostrador (`venta.astro`, `PanelShell.astro`); emails a una columna de 600px en papel (`src/modules/email/*.ts`). | Nombres `--mo-*` descartados por SPEC-UI-00. CTA de email en `#e8590c` con blanco (3.6:1, no pasa AA en texto de 14px): ver decisiones. |
| DS-S10 Launcher | no aplica | Inventario no tiene launcher; el índice `/panel` con pills cumple el rol. | — |
| DS-S11 Rail fijo | no aplica | Sin rail; navegación por pills (`TopPills.astro`, `PanelShell.astro`). | — |
| DS-S12 Hub papel | parcial | `/panel` en papel con KPI (`KpiStrip.astro`), `main` con `min-width: 0`. | Sin shimmer/stagger en KPI (`rg shimmer src` vacío). |
| DS-S13 POS oscuro + ticket papel | parcial | Ticket claro en `/t/[token]` y `ticket_render.ts` con `@media print` 58mm. | POS oscuro: ver DS-S4. |
| DS-S14 Login | no aplica | No hay página de login propia (acceso por links y sesión); `/alta` es el alta. | — |
| DS-S15 Listas alto volumen | parcial | `TablaCatalogo.tsx`: header sticky, filas sin glass, 1000 filas virtualizadas (T-UI-03). | Sin hover `rgba(orange,.06)` ni selected; tipografía 13px contra `.875rem`. |
| DS-S16 Onboarding smoke | no aplica | Sin overlay de onboarding. | — |
| DS-S17 Constraints táctiles | parcial (avanza en este PR) | Touch 44px en `venta`, `PanelShell`, `ConfirmDialog`; 360px sin desborde (`tests/e2e/venta-worst.spec.ts`, `catalogo-mil.spec.ts`). Este PR suma `viewport-fit=cover` y padding `env(safe-area-inset-*)` en `/venta`. | Skeleton/shimmer de KPI (DS-S12). |
| DS-S18 Qué se reutiliza | parcial | Tokens y contratos de papel sí; `--mo-*` no (SPEC-UI-00). | — |
| DS-S19 Qué no se trae | hecho (cerrado en este PR) | Sin Odoo ni morado en código; `mencionaOdoo` en `src/modules/negocio/catalogo.ts` es el detector que lo impide. Este PR saca el remitente por defecto `ModoOps <avisos@modoops.local>` de `src/lib/alertas-seguridad.ts`. | — |
| DS-S20 Stack Inventario | hecho | Astro 7 + TS + islas React, SSR `@astrojs/node`, PWA (`public/manifest.webmanifest`, `public/sw.js`), papel `#f7f5f2`, cards de 12px en mostrador. | Blur 16px: ver DS-S5. |
| DS-S21 Email papel NE12 | parcial | Una columna `max-width:600px`, fondo `#f7f5f2`, sin imágenes pesadas (`plantillas.ts`, `plantilla-cierre.ts`, `ventas-diarias.ts`, `resumen-semanal.ts`, `eventos-*.ts`). | CTA `#e8590c` con blanco no pasa AA; sin `color-scheme`/dark del email. |
| DS-S22 Criterios de aceptación | parcial | Reduced motion y 360px con evidencia automatizada (specs e2e de arriba); contraste por par en `docs/diseno/contraste-aa.md`. | CTA primario en llama: hoy es `star-glow` por AA (decidido). Ticket impreso idéntico y "legible a 2 m" sin evidencia. |
| DS-S23 Fases 0 a 2 | falta | — | Capturas 360px dark/light lado a lado por fase; depende de cerrar DS-S4/S5/S6. |

## Resuelto el 2026-10-17 (PR posterior a la auditoría)

Mauri decidió header claro. Los tres hallazgos de abajo quedaron corregidos: la landing pasa a texto `void` en secciones claras y `star-white` en las oscuras (`Section.astro`, `SiteHeader.astro`, `Hero.astro`, `Button.astro` `ghost-light`, `SectionHeading.astro`, `Contraste.astro`, `Contacto.astro`), con un spec que mide el contraste real de cada texto a 360px y 1280px (`tests/e2e/landing-legible.spec.ts`) y un trinquete estático (`tests/landing-legibilidad.test.ts`). El botón de WhatsApp usa el token nuevo `--color-whatsapp` con texto `void`, el CTA de los emails pasa a `#bf360c` y `/admin` ya no desborda a 360px. Pares nuevos en `docs/diseno/contraste-aa.md`.

## Hallazgos HIGH previos (no se tocaron en este PR)

### Landing

La landing `/` se lee mal. Los alias heredados del tema galaxy se remapearon a valores claros (`--color-space-mist #efecea`, `--color-galaxy-deep #ffffff`, `--color-core-cream #1a1a1a`) pero el texto siguió en `text-canvas-white` (#f7f5f2). Medido con Chrome a 360px el 2026-10-17: `Section.astro` variantes `linen` y `white` con texto 1.08:1 y 1.09:1, H1 del hero blanco sobre papel 1.09:1, y el header oscuro translúcido con "Inventario" en `text-core-cream` 1.21:1. El arreglo obvio (texto `void` en secciones claras, `star-white` en las oscuras) toca unas 20 clases en `Section.astro`, `SectionHeading.astro`, `Hero.astro`, `Button.astro`, `SiteHeader.astro`, `Contacto.astro` y `Planes.astro`. Hay que definir si el header queda oscuro o claro, así que va en su propio PR.

### Botón verde de WhatsApp

`/alta/estado` (`a.btn`) y el botón de WhatsApp de `Contacto.astro` llevan texto blanco sobre `#25d366`: 1.98:1, no pasa AA. Arreglarlo cambia el verde de marca o el color del texto, así que espera decisión (punto 6).

### `/admin` a 360px

El documento mide 401px a 360px (la barra `segbar` corta "Prueba"). Ya pasaba en `main` antes de este PR; es layout, no tema.

## Decisiones pendientes para Mauri

1. ~~Landing: header oscuro o claro~~ (decidido: claro, resuelto).
2. ~~CTA de email a `star-glow`~~ (decidido y resuelto).
3. Montserrat (PRD) o Inter (hoy).
4. POS oscuro: siempre o solo con el modo del sistema; ambiente radial sí o no.
5. Glass y blur en panel/POS (ADR-0010 lo descarta en la landing).
6. Tokens de estado (ok/aviso/vivo/pendiente). El verde WhatsApp ya tiene token (`--color-whatsapp`, texto `void`).
