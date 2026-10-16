---
id: PRD-LP-01
tipo: prd
estado: propuesto
modulos: [inventario, landing]
depende_de: [ADR-0002, ADR-0008, ADR-0010, PRD-LANDING-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: consultoria/docs/marketing-one-pager.md, landing-architecture.md, DESIGN.md, web/. Restringido por
  ADR-0010, ADR-0008, ADR-0002.
---
# PRD-LP-01 - Landing Inventario (R2)

Fuente: `consultoria/docs/marketing-one-pager.md`, `landing-architecture.md`, `DESIGN.md`, `web/`. Restringido por ADR-0010, ADR-0008, ADR-0002.

## Épica LP-E1. Estructura 8 secciones

Requisito LP1: misma información en landing y PDF, un solo precio público.

- Historia LP-S1. Ensamblar `index.astro` con 8 secciones. AC: Given build Astro When corro build Then las 8 secciones renderizan en orden sin errores. ADR: 0010. Talla M. Depende de: LP-S2.
- Historia LP-S2. Fuente única `business.ts` con copy, precios y contacto. AC: Given cambio el teléfono en `business.ts` When rebuild Then Hero, Contacto y footer muestran el nuevo sin otro edit. ADR: 0010. Talla S. Depende de: nada.
- Historia LP-S3. Componentes `Section`, `Button` y `SectionHeading` con variantes. AC: Given uso `variant=narrow` When render Then ancho 720px. ADR: 0010, 0008. Talla S. Depende de: nada.

## Épica LP-E2. Hero que convierte

Requisito LP2: valor entendido en 5 segundos con 3 CTA.

- Historia LP-S4. Hero con titular, subtítulo PYME y CTA primario, WhatsApp y email. AC: Given viewport 360px When cargo Then titular visible sin scroll horizontal y los 3 links apuntan a `#contacto`, `wa.me/` y `mailto:`. ADR: 0010. Talla M. Depende de: LP-S2, LP-S3.
- Historia LP-S5. Precio público único Descubrimiento. AC: Given leo la página When busco `$` Then hay exactamente un precio publicado. ADR: 0012. Talla S. Depende de: LP-S2.

> Nota 2026-10-12: superado por PRD-LANDING-01 / decisión del dueño: sin precio de servicio ni implementación; revisable.

## Épica LP-E3. Contacto que llega

Requisito LP3 y LP6: formulario Formspree operativo.

- Historia LP-S6. Form con `PUBLIC_FORMSPREE_FORM_ID` y estado `/?enviado=1#contacto`. AC: Given envío válido When post Then redirect a `/?enviado=1#contacto` y el lead aparece en Formspree. ADR: 0010. Talla M. Depende de: LP-S3.
- Historia LP-S7. Tokens landing y pendientes SEO. AC: Given audito paleta When comparo con LP4 Then solo void, canvas, linen, ash y trust como acento. ADR: 0008. Talla S. Depende de: nada. Deuda registrada: `site` astro.config, favicon, OG image, PDF espejo, dominio más Pages.

## Dependencias externas

Ninguna historia arranca sin LP-S2 y LP-S3. LP-S4 espera a LP-S2.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Cambio de teléfono en fuente única | Editar `telefono` en `business.ts` y rebuild | Hero, Contacto y footer muestran el nuevo sin otro edit |
| Fallo | Formspree caído | POST devuelve 500 | Estado `error` con reintento y campos conservados |
| Regresión | Estructura fija | Build Astro | 8 secciones renderizan en orden sin errores |

Arch-tests: AT1 copy, precios y contacto solo se importan desde `business.ts` (lint de imports, falla si otro módulo los define). AT2 `Button` siempre renderiza `<a>` (test de snapshot por variante).
