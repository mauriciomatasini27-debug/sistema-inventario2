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
| DS-S2 Ember en secundarias | hecho | `--color-ember-ambar/coral/rojo/vino` en `global.css` y `tokens-papel.css`; segbar del panel (`panel.astro`) con ámbar/coral/vino. Marca 2: tono por módulo en `panel-modulos.ts` (`EMBER_MODULO`) con punto en las pills (`TopPills.astro`) y en las etiquetas de los KPI (`KpiStrip.astro`), borde superior ember en las cards secundarias de `/panel` y `/panel/plan` (`.card-ember--*` en `tema.css`), `--serie-ember` (vino en claro, ámbar en oscuro) en ventas por mes y la dona, y "Mora" del segbar de `/admin` en coral. Texto `#1a1a1a` sobre ámbar/coral/rojo, blanco sobre vino; borde fino en ámbar/coral en claro. | Nada: ember queda solo en secundarias, nunca CTA. |
| DS-S3 Papel y canvas claros | hecho (cerrado en este PR) | `--color-canvas #f7f5f2`, `--color-linen #efecea`, `--color-void #1a1a1a`; sin `#71639e`. Este PR pasa `/venta`, `/alta`, `/alta/estado` y `/t/[token]` de `#f5f1e8` a `var(--color-canvas)` y el `manifest.webmanifest` de `#f7faf7` a `#f7f5f2`. | Ver hallazgo HIGH de la landing abajo. |
| DS-S4 Dark ambiente POS | hecho | `src/styles/tema.css` (roles claro/oscuro), `src/lib/tema.ts`, `TemaInicial.astro`/`TemaToggle.astro`: claro/oscuro con toggle por dispositivo, sistema por defecto y sin flash; `--color-charcoal`/`--color-mid` como tokens. | Nada: sin ambiente radial (decisión de Mauri). |
| DS-S5 Glass, radios, blur | hecho (panel/POS) | `tema.css` con `.vidrio-barra`/`.vidrio-card`, `@supports` con fallback y `prefers-reduced-transparency`; cards de 12px en `/venta` y 16px en panel. | Nada: la landing sigue sin glass (ADR-0010). |
| DS-S6 Tipografía | hecho | `--font-sans` con la pila del sistema en `global.css` y `tokens-papel.css`; `BaseLayout.astro` sin `<link>` de Google Fonts. | Nada: Montserrat descartado. |
| DS-S7 Variables CSS `:root`/`.pos` | no aplica (decidido) | SPEC-UI-00: tokens `--color-*`, sin port `--mo-*`. Las páginas standalone cargan `tokens-papel.css`; los colores de estado de `panel.astro`/`admin.astro` ahora usan tokens `--estado-*` (y `--color-whatsapp` para el verde). | Rail y `.pos` no existen. |
| DS-S8 Motion reducido | hecho | Kill global con `reduce` en `global.css`; `panel.astro`, `ConfirmDialog.astro`, `Toaster.tsx`, `ChatLanding.astro`; NumberFlow con `respectMotionPreference` y spec `tests/e2e/catalogo-mil.spec.ts` con `reducedMotion: reduce`. Las páginas standalone no tienen transiciones (`rg transition` vacío en venta/alta/admin/PanelShell). | Nada. |
| DS-S9 Adaptación a Inventario | hecho | Tokens propios con papel conservado; botones de 44px en mostrador (`venta.astro`, `PanelShell.astro`); emails a una columna de 600px en papel, con el papel común en `src/modules/email/papel.ts` (`documento_papel`, `cta`, `tabla`) y las nueve plantillas migradas. | Nada: los nombres `--mo-*` no se traen por SPEC-UI-00 (decidido) y el CTA de email quedó `#bf360c` con blanco, 5.60:1 en claro y oscuro (`tests/email-papel.test.ts`). |
| DS-S10 Launcher | no aplica | Inventario no tiene launcher; el índice `/panel` con pills cumple el rol. | — |
| DS-S11 Rail fijo | no aplica | Sin rail; navegación por pills (`TopPills.astro`, `PanelShell.astro`). | — |
| DS-S12 Hub papel | hecho | `/panel` en papel con KPI (`KpiStrip.astro`), `main` con `min-width: 0`. Skeleton con shimmer en tokens `--tema-*`, `aria-busy` y entrada escalonada de los KPI; estático con `prefers-reduced-motion: reduce` (`tests/ds-s12-kpi-skeleton.test.ts`, `tests/e2e/kpi-skeleton.spec.ts`). | Nada. |
| DS-S13 POS oscuro + ticket papel | parcial | Ticket claro en `/t/[token]` y `ticket_render.ts` con `@media print` 58mm. | POS oscuro: ver DS-S4. |
| DS-S14 Login | no aplica | No hay página de login propia (acceso por links y sesión); `/alta` es el alta. | — |
| DS-S15 Listas alto volumen | hecho | `TablaCatalogo.tsx`: header sticky en `--tema-fondo` 600 con borde 2px deep 15%, celdas `.875rem`/`.45rem` centradas, filas sin glass con hover naranja 6% y seleccionada deep 10% (la del SKU elegido en el formulario, `data-seleccionada` + `aria-current`), SKU/cantidades 500 en `--tema-enfasis` (star-glow claro, ámbar oscuro, AA en `check:contrast`), 1000 filas virtualizadas (T-UI-03); `tests/ds-s15-listas.test.ts`, `tests/e2e/ds-s15-listas.spec.ts`. | Énfasis en star-glow y no deep por AA (deep como texto da 3.9:1). |
| DS-S16 Onboarding smoke | no aplica | Sin overlay de onboarding. | — |
| DS-S17 Constraints táctiles | hecho | Touch 44px en `venta`, `PanelShell`, `ConfirmDialog`; 360px sin desborde (`tests/e2e/venta-worst.spec.ts`, `catalogo-mil.spec.ts`); `viewport-fit=cover` y padding `env(safe-area-inset-*)` en `/venta`; skeleton/shimmer de KPI cerrado en DS-S12. | Nada. |
| DS-S18 Qué se reutiliza | parcial | Tokens y contratos de papel sí; `--mo-*` no (SPEC-UI-00). | — |
| DS-S19 Qué no se trae | hecho (cerrado en este PR) | Sin Odoo ni morado en código; `mencionaOdoo` en `src/modules/negocio/catalogo.ts` es el detector que lo impide. Este PR saca el remitente por defecto `ModoOps <avisos@modoops.local>` de `src/lib/alertas-seguridad.ts`. | — |
| DS-S20 Stack Inventario | hecho | Astro 7 + TS + islas React, SSR `@astrojs/node`, PWA (`public/manifest.webmanifest`, `public/sw.js`), papel `#f7f5f2`, cards de 12px en mostrador. | Blur 16px: ver DS-S5. |
| DS-S21 Email papel NE12 | hecho | Papel común en un solo lugar (`src/modules/email/papel.ts`): documento con `color-scheme`/`supported-color-schemes` y `color-scheme: light dark` en el root, `@media (prefers-color-scheme: dark)` a `#1a1a1a`/`#f7f5f2` con bordes `#3a3a3a`, clases `ne-papel`/`ne-mute`/`ne-tabla`/`ne-cta`; las nueve plantillas de `src/modules/email/` pasan por `documento_papel`, sin contenedor duplicado. Columna `max-width:600px`, cuerpo de 16px, CTA `#bf360c` con blanco a 44px de alto y `display:block`, tablas con `table-layout:fixed` y `overflow-wrap:anywhere` para 360px, sin imágenes (ni el logo). Evidencia: `tests/email-papel.test.ts` (57 casos sobre las 16 salidas generadas) y `docs/diseno/contraste-aa.md` con los pares de dark del email (69/69 en `npm run check:contrast`). | Nada: el inline queda con el papel claro para los clientes que ignoran `<style>`, y el CTA se decide a `#bf360c` con blanco (5.60:1 en los dos modos), no llama. |
| DS-S22 Criterios de aceptación | parcial | Reduced motion y 360px con evidencia automatizada (specs e2e de arriba); contraste por par en `docs/diseno/contraste-aa.md`. | CTA primario en llama: hoy es `star-glow` por AA (decidido). Ticket impreso idéntico y "legible a 2 m" sin evidencia. |
| DS-S23 Fases 0 a 2 | falta | — | Capturas 360px dark/light lado a lado por fase; depende de cerrar DS-S4/S5/S6. |

## Resuelto el 2026-10-17 (PR posterior a la auditoría)

Mauri decidió header claro. Los tres hallazgos de abajo quedaron corregidos: la landing pasa a texto `void` en secciones claras y `star-white` en las oscuras (`Section.astro`, `SiteHeader.astro`, `Hero.astro`, `Button.astro` `ghost-light`, `SectionHeading.astro`, `Contraste.astro`, `Contacto.astro`), con un spec que mide el contraste real de cada texto a 360px y 1280px (`tests/e2e/landing-legible.spec.ts`) y un trinquete estático (`tests/landing-legibilidad.test.ts`). El botón de WhatsApp usa el token nuevo `--color-whatsapp` con texto `void`, el CTA de los emails pasa a `#bf360c` y `/admin` ya no desborda a 360px. Pares nuevos en `docs/diseno/contraste-aa.md`.

## Resuelto el 2026-10-17 (marca: tipografía, tema oscuro, vidrio y estados)

Mauri cerró las decisiones 3 a 6. Tipografía: la pila del sistema (`--font-sans` en `global.css` y `tokens-papel.css`), se borró el `<link>` de Inter y Google Fonts de `BaseLayout.astro`; Montserrat queda descartado. Tema claro/oscuro por dispositivo: `src/styles/tema.css` con roles (`--tema-fondo/superficie/linea/texto/texto-suave/acento/barra/vidrio`) y `src/lib/tema.ts` con `TemaInicial.astro` (script inline sin flash) y `TemaToggle.astro` (botón de 44px con `aria-pressed`); sistema por defecto y sin ambiente radial. Vidrio en panel/POS (`.vidrio-barra`/`.vidrio-card` con `@supports` y `prefers-reduced-transparency`), la landing sigue sin glass (ADR-0010). Estados: tokens `--color-ok/aviso/vivo/pendiente/peligro` con tint claros y oscuros, clases `.estado-*` y segbar con ember; el verde WhatsApp ya tenía token. Pares nuevos en `docs/diseno/contraste-aa.md`, trinquete en `tests/tema.test.ts` y spec e2e `tests/e2e/tema.spec.ts`.

## Resuelto el 2026-10-17 (marca 2: ember en el panel y tema en /admin)

Mauri aprobó sumar ember en más lugares del panel, el toggle en `/admin` y tres arreglos chicos. Ember: ver fila DS-S2. `/admin` monta `TemaInicial`/`TemaToggle` y pasa sus colores a los roles `--tema-*`; en oscuro invierte pills activas, avatar y primer segmento, y "Al día"/"Cobrado" usan `--estado-ok` en vez de llama (que no llegaba a 3:1 sobre papel). El toggle muestra a qué tema lleva ("☾ Oscuro" en claro, "☀ Claro" en oscuro) y mantiene `aria-pressed`. En oscuro el segbar vacío de `/panel` ya no muestra un segmento blanco (las reglas de color excluyen `.vacio`, que ocupa toda la barra), y "Vender →" / "Ver mora →" no envuelven la flecha a 360px. Pares nuevos en `docs/diseno/contraste-aa.md` (60/60), trinquete en `tests/marca2.test.ts` y e2e en `tests/e2e/marca2.spec.ts` y `tests/e2e/tema.spec.ts`.

## Resuelto el 2026-10-17 (email: papel común y modo oscuro)

El email deja de repetir su contenedor: `src/modules/email/papel.ts` es el único lugar que arma el documento (`documento_papel`, `cta`, `tabla`, `pie_links`, `pie_seguridad`), y las nueve plantillas lo usan sin capa de compatibilidad. El documento declara `color-scheme` y `supported-color-schemes`, lleva `color-scheme: light dark` en el root y un `<style>` con `@media (prefers-color-scheme: dark)` que pasa el papel a `#1a1a1a`, el texto a `#f7f5f2`, los bordes de tabla a `#3a3a3a` y los enlaces a `#8cc4e3`; el inline conserva el papel claro para los clientes que ignoran `<style>`. El CTA sigue siendo `#bf360c` con blanco, ahora con 44px de alto y a lo ancho, y las tablas entran a 360px con `table-layout:fixed`. No hay ninguna imagen en el email. Trinquete en `tests/email-papel.test.ts` y pares nuevos en `docs/diseno/contraste-aa.md` (69/69).

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
3. ~~Montserrat (PRD) o Inter (hoy)~~ (decidido 2026-10-17: pila del sistema en todos lados, sin Inter ni Google Fonts; Montserrat descartado).
4. ~~POS oscuro: siempre o solo con el modo del sistema; ambiente radial sí o no~~ (decidido 2026-10-17: claro/oscuro con toggle por dispositivo, sistema por defecto, sin ambiente radial).
5. ~~Glass y blur en panel/POS (ADR-0010 lo descarta en la landing)~~ (decidido 2026-10-17: vidrio con fallback y `prefers-reduced-transparency` en panel/POS; la landing sigue sin glass).
6. ~~Tokens de estado (ok/aviso/vivo/pendiente)~~ (decidido 2026-10-17: tokens `--color-ok/aviso/vivo/pendiente/peligro` con tint claros y oscuros, más clases `.estado-*`). El verde WhatsApp ya tiene token (`--color-whatsapp`, texto `void`).
