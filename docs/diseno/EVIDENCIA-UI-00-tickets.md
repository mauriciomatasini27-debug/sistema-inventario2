---
id: EVIDENCIA-UI-00
tipo: spec
estado: propuesto
modulos: []
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: "Fuente: corridas del 2026-10-12 con check-contrast.mjs, review-scope.mjs y grep sobre src/pages."
---
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

Un archivo es visual si está bajo `src/` y termina en `.astro`, `.css`, `.tsx` o `.jsx` (`esArchivoVisual` en `scripts/cadena/interface-review-lib.mjs`). Un PR con al menos un archivo visual con status distinto de `removed` tiene que traer en el cuerpo una sección cuyo encabezado markdown contenga `interface-review` (cualquier nivel, case-insensitive) con la tabla y el veredicto de los skills `interface-review`/`better-interface`.

Bloquea el merge: falta la sección, falta el veredicto (`Approve`/`Block`), el veredicto es `Block`, o queda una fila `HIGH` abierta. No cuentan las filas con Status `Pre-existing`, las de la tabla bajo un subencabezado `Pre-existing`, ni las cerradas: Status con `Resuelto`, `Corregido` o `Fixed` (p. ej. `Regression · Resuelto`), o la severidad tachada `~~HIGH~~`. La palabra suelta en `Why` no cierra nada.

`npm run review:scope [base]` lista target, base, head y los archivos visuales con sus importadores (el match por nombre puede traer hits de palabra, el revisor confirma cada uno).

`npm run review:gate -- --body-file <cuerpo.md> [--base origin/main]` corre el gate local antes de abrir el PR: imprime `no aplica` / `OK` / `BLOQUEADO` más motivos y sale 0/1. Antes de mergear, `node scripts/cadena/puede-mergear.mjs <PR>` agrega estos motivos a los de `No mergear` y migraciones.

Ejemplo mínimo de sección en el cuerpo del PR:

```markdown
## interface-review

| Severity | Domain | Status | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| LOW | Writing | Introduced | `src/pages/venta.astro:12` | `Entrar` | `Ingresar` | copy |

**Verdict:** Approve
```
