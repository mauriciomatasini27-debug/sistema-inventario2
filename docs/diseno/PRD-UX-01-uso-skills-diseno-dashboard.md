---
id: PRD-UX-01
tipo: prd
estado: propuesto
modulos: [admin]
depende_de: [ADR-0036, ADR-0037, ADR-0038, ADR-0044, ADR-0046, PRD-DASH-01, PRD-DS-01, PRD-DS-02, PRD-UI-01, PRD-UI-07]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-UX-01 - Uso de skills de diseño en el dashboard: PRD-DASH-01 y pulido del panel actual (R2)

Fuente: PRD-DASH-01, PRD-UI-01 a PRD-UI-07, PRD-DS-01, PRD-DS-02, `package.json` (sin `sonner`, sin `react`, sin `@astrojs/react`), `src/pages/panel.astro` (HTML propio sin layout, tarjetas `.card` con `id` `caja`, `movimientos`, `reportes`, `ventas`, `medios`, `consumos`, `pagar-servicio`, `stock`, `precios`, `proveedores`, `fiado`, `ajustes`; colores sueltos `#ddd6c4`, `#e3ddcd`, `#fff`), `src/pages/index.astro`, `src/layouts/BaseLayout.astro`, `src/components/ui/FloatingWhatsApp.astro`, `src/components/sections/Faq.astro`. Skills: `.agents/skills/emil-design-eng`, `animate`, `animation-performance`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `apple-design`, `mobile-native`, `pick-ui-library`, `break-ui`, `ask-sonner` (Emil Kowalski); `better-accessibility`, `better-colors`, `better-layout`, `better-typography`, `better-ui`, `better-writing`, `better-interface`, `interface-review`, `break`, `state-machine`, `variant` (Jakub Krehel); `web-design-guidelines`, `writing-guidelines` (Vercel). Fecha extracción: 2026-10-12. Restringido por ADR-0037, ADR-0038, ADR-0036, ADR-0044, ADR-0046.

## Épica UX-E0. Instalación de Sonner (primer paso)

Requisito UX-0: antes de cualquier otra historia, el proyecto tiene un único `<Toaster />` de Sonner (`emilkowalski/sonner`, paquete npm `sonner`) funcionando en el panel y en la landing. Hoy `package.json` no trae `sonner` ni integración React, así que hay que sumarla.

- Historia UX-S0. Instalar y configurar Sonner con `ask-sonner` y `pick-ui-library`: sumar `sonner`, `react`, `react-dom` y `@astrojs/react` (Sonner es componente React; Astro 4 lo monta como isla), registrar la integración en `astro.config`, crear `src/components/ui/Toaster.tsx` que exporta `<Toaster />` con tokens de Tema Papel, posición `bottom-center` a 360 px y `top-right` en escritorio, `richColors` apagado; montarlo una sola vez con `client:idle` en `src/pages/panel.astro` (no usa layout, va antes de `</body>`) y en `src/layouts/BaseLayout.astro` para la landing y `ChatLanding.astro`. AC: Given `npm install` y `npm run build` When abro `/panel` Then hay un solo nodo `[data-sonner-toaster]` y un `toast("Prueba")` desde consola se ve y se anuncia por `aria-live`; Given abro `/` Then el Toaster existe y no tapa el CTA del Hero a 360 px; Given `reduced-motion` Then el toast aparece sin desplazamiento; Given busco `alert(` en `src/` Then el conteo no sube. ADR: 0037. Talla S. Depende de: nada.

## Épica UX-E1. Fase diseño

Requisito UX-1: ninguna pantalla de PRD-DASH-01 se construye sin pasar antes por las skills de decisión.

- Historia UX-S1. Filosofía y oportunidades de motion: `emil-design-eng` fija el criterio general (restraint, detalles invisibles) y `find-animation-opportunities` lista dónde animar y dónde no en tarjeta `Bot`, drawer `Preguntale al negocio`, toasts de alertas y `ChatLanding.astro`, con valores exactos. AC: Given corro la skill read-only When termina Then cada propuesta cita componente, duración menor a 300 ms y easing, y las rechazadas dicen por qué. ADR: 0037. Talla S. Depende de: UX-S0, DASH-S3, DASH-S7, DASH-S10.
- Historia UX-S2. Estados como máquina con `state-machine`: página descartable con switcher para bot (`vinculado`, `pendiente`, `pausado`, `degradado`), asistente (`inactivo`, `enviando`, `respondiendo`, `error`, `sin_cupo`) y chat de landing (`cerrado`, `abierto`, `respondiendo`, `límite_20`, `sin_js`). AC: Given abro la página de estados When recorro cada uno Then ninguno tiene spinner infinito ni estado sin copy. ADR: 0038. Talla M. Depende de: DASH-S1, DASH-S9, DASH-S11.
- Historia UX-S3. Variantes con `variant` para la tarjeta `Bot` y el widget `ChatLanding.astro` (mínimo 3 cada uno), y librería del chat elegida con `pick-ui-library`. AC: Given comparo variantes When elijo Then queda registro de la elegida y la librería tiene veredicto escrito, sin librería nueva sin veredicto. ADR: 0037, 0046. Talla S. Depende de: DASH-S3, DASH-S10.

## Épica UX-E2. Fase construcción

Requisito UX-2: cada pantalla nueva pasa las seis skills `better-*` y el motion se construye con las skills de animación.

- Historia UX-S4. `better-accessibility`, `better-colors`, `better-layout`, `better-typography`, `better-ui` y `better-writing` en las 9 pantallas de DASH (`/panel/bot/config`, `/panel/bot/historial`, `/panel/alertas/umbrales`, `/panel/alertas/destinatarios`, `/panel/alertas/historial`, drawer asistente, `/panel/plan`, tarjetas del índice, `ChatLanding.astro`). AC: Given termino una pantalla When corro las seis skills Then contraste AA con tokens, `tabular-nums` en números, foco visible, copy en voseo y cero colores sueltos. ADR: 0037, 0036. Talla M. Depende de: UX-S2, DASH-S1 a DASH-S12.
- Historia UX-S5. Animaciones nuevas con `animate` y `animation-performance`: apertura del drawer, burbuja del chat, aparición de toasts. AC: Given mido en gama baja When animo Then solo `transform/opacity`, menos de 300 ms, sin frames perdidos y con `reduced-motion`. ADR: 0037. Talla S. Depende de: UX-S1.
- Historia UX-S6. Panel en celular con `apple-design` y `mobile-native`: drawer a pantalla completa como sheet con gesto de cierre, `100dvh`, sin tap highlight ni hover pegado, safe areas. AC: Given 360 px When abro y deslizo el drawer Then cierra con momentum y el foco vuelve al disparador. ADR: 0037. Talla S. Depende de: DASH-S7, UX-S5.
- Historia UX-S7. Toasts de alertas con `ask-sonner`: confirmación de umbral con deshacer (DASH-S4), aviso de stock bajo en `/panel` y error de envío con `Reintentar`, usando el `<Toaster />` de UX-S0. AC: Given guardo un mínimo When confirma Then toast con `Deshacer` de 5 s; Given llegan 3 alertas juntas Then se apilan sin tapar la navegación. ADR: 0037, 0043. Talla S. Depende de: UX-S0, DASH-S4, DASH-S6.

## Épica UX-E3. Fase revisión

Requisito UX-3: todo PR de dashboard se revisa y se estresa antes de merge.

- Historia UX-S8. Revisión por PR con `better-interface` e `interface-review`, más `web-design-guidelines` y `writing-guidelines` de Vercel. AC: Given abro un PR que toca `src/pages/panel*` o `src/components/ui/*` When corro las cuatro skills Then cada hallazgo cita `file:line` y el PR no avanza con bloqueantes abiertos. ADR: 0038. Talla S. Depende de: UX-S4.
- Historia UX-S9. Stress con `break` y `break-ui`: nombres de producto largos, teléfonos raros, 2.000 consultas, 0 alertas, cupo en 0, emoji y montos extremos. AC: Given renderizo cada componente con datos peores When reviso a 360 px Then nada desborda, trunca sin `title` ni rompe el layout. ADR: 0038. Talla S. Depende de: UX-S4, DASH-S2.
- Historia UX-S10. Auditoría de motion existente con `review-animations` e `improve-animations` (read-only, planes para ejecutar después). AC: Given corro la auditoría When termina Then hay tabla priorizada con veredicto `Block/Approve` y `plans/NNN-slug.md` por hallazgo. ADR: 0037. Talla S. Depende de: UX-S5.

## Épica UX-E4. Auditoría del dashboard viejo

Requisito UX-4: el `/panel` actual se pule con las mismas skills, sin esperar a DASH.

- Historia UX-S11. Auditar `src/pages/panel.astro` con `better-interface`, `web-design-guidelines`, `break-ui` y `improve-animations`: colores sueltos, `font-family:monospace` inline, links `?` de 28 px como único acceso a ayuda, tarjetas que exponen rutas `/api/*` al Dueño. AC: Given corro la auditoría When termina Then hay lista `file:line` con severidad y plan por tarjeta, sin cambiar código en esta historia. ADR: 0037, 0038. Talla M. Depende de: UX-S0.

## Épica UX-E5. Fase merge

Requisito UX-5: el merge exige evidencia de cada fase.

- Historia UX-S12. Checklist de merge: evidencia de UX-S1 a UX-S10 en el PR, `npm run check:ui` y `check:contrast` verdes, un solo Toaster. AC: Given falta evidencia de una fase When pido merge Then el PR queda bloqueado. ADR: 0038. Talla S. Depende de: UX-S8, UX-S9, UX-S10, DASH-S13.

### Matriz skill por fase y componente

| Skill | Fase | Componente | Historia |
|---|---|---|---|
| `ask-sonner`, `pick-ui-library` | diseño (paso 0) | `Toaster.tsx`, `panel.astro`, `BaseLayout.astro` | UX-S0 |
| `emil-design-eng`, `find-animation-opportunities` | diseño | tarjeta Bot, drawer, toasts, `ChatLanding.astro` | UX-S1 |
| `state-machine` | diseño | bot, asistente, chat landing | UX-S2 |
| `variant`, `pick-ui-library` | diseño | tarjeta Bot, `ChatLanding.astro` | UX-S3 |
| `better-accessibility`, `better-colors`, `better-layout`, `better-typography`, `better-ui`, `better-writing` | construcción | las 9 pantallas DASH | UX-S4 |
| `animate`, `animation-performance` | construcción | drawer, burbuja, toasts | UX-S5 |
| `apple-design`, `mobile-native` | construcción | drawer a 360 px | UX-S6 |
| `ask-sonner` | construcción | toasts de umbral y stock bajo | UX-S7 |
| `better-interface`, `interface-review`, `web-design-guidelines`, `writing-guidelines` | revisión | todo PR | UX-S8 |
| `break`, `break-ui` | revisión | historial bot, umbrales, chat | UX-S9 |
| `review-animations`, `improve-animations` | revisión | motion nuevo y existente | UX-S10, UX-S11 |
| todas | merge | PR completo | UX-S12 |

## Dependencias externas

UX-S0 espera a aprobar la integración `@astrojs/react` (primera dependencia React del proyecto). UX-E1 a UX-E3 esperan a las historias de PRD-DASH-01 citadas. UX-S4 espera a tokens de PRD-DS-01. UX-S11 no espera a DASH.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Sonner instalado | `npm run build` y `toast("Prueba")` en `/panel` | Toast visible, anunciado, un solo `[data-sonner-toaster]` |
| Feliz | Sonner en landing | Abro `/` a 360 px | Toaster montado sin tapar el Hero |
| Feliz | Confirmar umbral | Mínimo 10 guardado | Toast con `Deshacer` |
| Feliz | Estados del asistente | Switcher de `state-machine` | 5 estados con copy |
| Fallo | Toaster duplicado | Panel con dos `<Toaster />` | Check falla |
| Fallo | Error de envío | Red caída al enviar al asistente | Toast con `Reintentar`, sin spinner infinito |
| Fallo | Datos peores | Nombre de 120 caracteres, 2.000 filas | Sin desborde ni jank |
| Regresión | Panel viejo | 12 tarjetas actuales tras pulido | Mismos datos, cero colores sueltos |
| Regresión | `reduced-motion` | Drawer, burbuja, toasts | Sin desplazamiento |

Arch-tests: AT1 un solo `<Toaster />` por página y ningún `alert()` nuevo en `src/` (lint). AT2 todo `toast(` importa de `sonner`, sin toasts caseros. AT3 componentes nuevos sin colores sueltos y motion solo en `transform/opacity` (lint).
