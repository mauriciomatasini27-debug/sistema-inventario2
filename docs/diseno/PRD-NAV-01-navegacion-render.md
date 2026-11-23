---
id: PRD-NAV-01
tipo: prd
estado: propuesto
modulos: [admin, landing]
depende_de: [ADR-0130]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Navegación entre rutas sin freeze: prefetch + View Transitions de Astro con fallback MPA, y quitar el trabajo bloqueante del render crítico (frontmatter de layouts y páginas).
---
# PRD-NAV-01 - Navegación entre rutas sin freeze

Fuente: bug reportado "al cambiar de ruta la UI se tilda". Restringido por ADR-0130.

> Estado al 2026-11-23: NAV-S1 implementado con prefetch y View Transitions cross-document nativas. La navegación ya no muestra el blanco entre rutas y sin JS sigue siendo MPA; el full reload de base se mantiene (desvío del AC, ver Evidencia NAV-S1). NAV-S2 pendiente.

## Problema

Al cambiar de ruta la UI se tilda. `astro.config.mjs` usa `output: "server"` sin `prefetch` ni View Transitions, así que cada navegación es un full reload: espera del primer byte del SSR, re-parseo del HTML y re-ejecución de los scripts inline. Encima, el render del panel hace trabajo sincrónico en el frontmatter (`PanelShell.astro` resuelve sesión/tenant/membresía en cada render) y páginas como `integraciones.astro` y `integraciones-remitentes.astro` hacen `await` a datos (salud Gmail, remitentes de ingesta) antes de emitir HTML.

## Épica NAV-E1. Navegación y render fluido

Requisito NAV-R1: la navegación entre rutas debe sentirse fluida — prefetch de la siguiente página, transición de vista con fallback MPA y sin trabajo bloqueante innecesario en el render crítico.

- Historia NAV-S1. Habilitar `prefetch` y View Transitions en `astro.config.mjs` con fallback MPA y medir TTFB/LCP antes/después. AC: Given dos rutas del panel When navego Then la transición de vista evita el full reload y el LCP no empeora, y sin JS la navegación sigue funcionando como MPA. ADR: 0130. Talla M. Depende de: nada.
- Historia NAV-S2. Auditar el frontmatter de `PanelShell.astro` (sesión/tenant/membresía) y las páginas con `await` bloqueante (`integraciones.astro`, `integraciones-remitentes.astro`) y mover lo lento fuera del render crítico (streaming o isla). AC: Given una página de panel When renderiza Then el primer byte no espera llamadas de datos lentas y la sesión se resuelve sin bloquear el HTML. ADR: 0130. Talla M. Depende de: NAV-S1.

## Dependencias externas

Ninguna. Es configuración de Astro y refactor de frontmatter existente.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Navegación con prefetch | clic en enlace del nav | transición de vista, sin full reload |
| Fallo | Cliente sin JS | navegación | fallback MPA funciona |
| Fallo | Frontmatter con await lento | página integraciones | el primer byte no espera el dato lento |

## Evidencia NAV-S1 (2026-11-23)

Medición con `npm run medir:navegacion -- --base-url <url> --latencia 150 --corridas 5` (Chromium, viewport 1280×800, latencia simulada de 150 ms), comparando `main` (antes) con la rama de NAV-S1 (después). El destino caliente se prefetchea al pasar el puntero; el frío navega sin hover previo.

| Métrica | Antes | Después |
|---|---|---|
| TTFB navegación caliente | 153 ms | 153 ms |
| LCP navegación caliente | 700 ms | 728 ms |
| LCP navegación fría | 684 ms | 712 ms |
| Enlace `rel="prefetch"` tras hover | no | sí |
| View Transition cross-document | no | sí (`pagereveal.viewTransition`) |
| Navegación sin JS | MPA | MPA |

Lectura: la View Transition se dispara y el panel sigue navegando sin JS. El LCP sube 20–28 ms (3–4 %) por el snapshot cross-document; no se pudo verificar el ahorro real del prefetch porque el dev server de Astro no cachea el HTML. El AC "evita el full reload" no se cumple al pie de la letra: la navegación sigue siendo cross-document (decisión de ADR-0130 para no romper los scripts), pero ya no muestra el blanco y queda cubierta por la transición. Repetir la medición contra el deploy queda como pendiente del ADR.

