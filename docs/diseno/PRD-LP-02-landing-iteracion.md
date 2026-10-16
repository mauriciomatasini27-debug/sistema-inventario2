---
id: PRD-LP-02
tipo: prd
estado: propuesto
modulos: [inventario, landing]
depende_de: [ADR-0002, ADR-0008, ADR-0010, ADR-0021, PRD-LANDING-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-LP-02 - Landing Inventario, iteración contenido (R2)

Fuente: auditoría LP-S1/S7 vs `consultoria/web` (ModoOps: 10 bloques, FAQ 4 Q&A, SupportModel 3 fases, Discovery con entregables, newsletter, canvas three.js). Restringido por ADR-0021, ADR-0010, ADR-0008, ADR-0002.

Alcance decidido: solo contenido + micro-interacciones CSS. Sin canvas three.js (choca con "sin neón" de ADR-0010). 8 secciones intactas: FAQ vive dentro de Contacto, sin enmienda al ADR.

## Épica LP2-E1. Planes que se entienden

Requisito LP2-1: cada plan muestra qué incluye, sin agregar precios (LP-S5: un solo `$`).

- Historia LP2-S1. Detalle por plan Básico/Plus/Pro con 3-4 features cada uno, solo desde `business.ts`. AC: Given leo `#planes` When comparo planes Then cada uno lista sus features sin `$` nuevo. ADR: 0010. Talla S. Depende de: nada.
- Historia LP2-S2. Nota de cotización Básico/Pro por local. AC: Given leo la nota When busco `$` Then no hay precio nuevo. ADR: 0010. Talla S. Depende de: LP2-S1.

## Épica LP2-E2. Objeciones cerradas

Requisito LP2-2: el visitante se auto-califica antes del form.

- Historia LP2-S3. Lista "No es para vos si…" en Público (varios locales día 1, desarrollo sin tope, sin tiempo para carga inicial). AC: Given leo `#publico` When termino Then veo Sí y No. ADR: 0010. Talla S. Depende de: nada.
- Historia LP2-S4. FAQ kiosco (4-6 Q: puesta en marcha, 2 cajas, venta celular, stock, soporte, planes) dentro de Contacto, antes del form, solo desde `business.ts`. AC: Given abro `#contacto` When cuento preguntas Then hay 4-6 con copy kiosco, sin `Odoo` ni `GalaxyGroup`. ADR: 0010. Talla M. Depende de: nada.

## Épica LP2-E3. Contacto doble

Requisito LP2-3: captar al que no quiere consultar todavía.

- Historia LP2-S5. Newsletter como segundo form Formspree (reutiliza `PUBLIC_FORMSPREE_FORM_ID`, redirect `/?newsletter=1#contacto`, estado éxito propio). AC: Given me suscribo When post Then redirect a `/?newsletter=1#contacto` con mensaje propio. ADR: 0010. Talla S. Depende de: nada.

## Épica LP2-E4. Vida CSS

Requisito LP2-4: movimiento sin canvas ni dependencias.

- Historia LP2-S6. Reveal on scroll (`IntersectionObserver`, respeta `prefers-reduced-motion`) + hovers en cards y botones. AC: Given scrolleo When una sección entra Then aparece con transición; Given `prefers-reduced-motion` Then todo visible sin animar. ADR: 0008. Talla S. Depende de: nada.

## Dependencias externas

Ninguna historia espera a otra. LP2-S4 y LP2-S5 tocan Contacto: implementar en ese orden para no pisarse.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Plan con features | Leo `#planes` | 3-4 features por plan, un solo `$` en página |
| Feliz | Newsletter | POST válido | Redirect `/?newsletter=1#contacto` con éxito |
| Fallo | Formspree caído | POST devuelve 500 | Estado `error`, campos conservados (ambos forms) |
| Regresión | Estructura fija | Build Astro | 8 secciones en orden, FAQ dentro de `#contacto` |

Arch-tests: AT1 `business.ts` sigue única fuente (extender `tests/landing.test.ts`: faq y features solo importan de `business.ts`). AT2 `Button` siempre `<a>`. AT3 ningún `$` nuevo fuera de `planes[destacado]`.

> Nota 2026-10-12: superado por PRD-LANDING-01 / decisión del dueño: sin precio de servicio ni implementación; revisable.
