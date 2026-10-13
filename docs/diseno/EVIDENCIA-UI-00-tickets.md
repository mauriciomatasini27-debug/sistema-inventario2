# EVIDENCIA-UI-00 - Tickets T-UI-04, T-UI-05, T-UI-07

Fuente: corridas del 2026-10-12 con `check-contrast.mjs`, `review-scope.mjs` y grep sobre `src/pages`.

## T-UI-05 Contraste medido

5 de 7 pares pasan AA, medido con luminancia WCAG sobre tokens de `global.css`.

| Par | Ratio | Veredicto |
|---|---|---|
| Texto void sobre canvas | 15.99 | PASS |
| Blanco sobre void | 17.40 | PASS |
| Blanco sobre trust | 7.27 | PASS |
| Blanco sobre star-glow | 5.60 | PASS |
| Trust sobre canvas | 6.68 | PASS |
| CTA llama blanco sobre star-warm | 3.92 | SOLO-GRANDE, hallazgo abierto |
| Muted ash sobre canvas | 3.38 | SOLO-GRANDE, hallazgo abierto |

CTA llama no llega a 4.5 en texto normal, opciones: texto dark sobre llama o llama solo en títulos grandes.

Decisión medida 2026-10-12: dark sobre llama da 4.44 y tampoco pasa, negro sobre llama da 5.36 pero es duro, glow con blanco da 5.60 y se adopta. `Button` primario pasa a `bg-star-glow` con blanco y hover con `brightness-90`, la llama queda para gradiente y deco. Excepción a DS-S1 registrada con números.

Muted no llega a 4.5, opciones: oscurecer ash para texto o reservarlo para deco y grande.

## T-UI-04 Copy y errores

| Página | Estado | Antes | Después |
|---|---|---|---|
| venta `#estado`, `#balance` | Anuncio a lector | divs planos | `role=status` en ambos |
| alta/estado aviso | `alert()` bloqueante | `alert(...)` línea 91 | div `#aviso` con `role=status` |
| alta `#error`, estado `#error` | Ya anunciaban | `role=alert` presente | Sin cambio, verificado |
| panel, admin catches | Fallback con texto | Escriben demo sin códigos http | Sin cambio, conforme |

Restos sin installs: `prompt()` en estado línea 81 pide campo inline con diseño, `#a00` en páginas standalone vive fuera de `global.css` y su tokenización va con el port de esas páginas.

## T-UI-07 Gate por PR

Procedimiento: correr `npm run review:scope [base]`, sale target más base más head más archivos visuales con importadores.

Límite conocido: importadores matchean por nombre y pueden traer hits de palabra, el revisor confirma cada uno.

Regla: PR visual no mergea con `HIGH` abierto en la tabla única de `better-interface`.
