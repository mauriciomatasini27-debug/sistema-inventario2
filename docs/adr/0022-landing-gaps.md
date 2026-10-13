# ADR-0022 - Landing cierre gaps vs ModoOps (PRD Gaps E1-E13)

Estado: aceptado. Fecha: 2026-10-11. Fuente: PRD - Landing Page - Gaps vs ModoOps v1.0 (E1-E13), ADR-0010, ADR-0021, auditoría pstack 3 workers. Implementado: B0, B1, E1-E3, E11-E12, E4+E5+E7, E6 (37 tests landing en verde, `astro build` OK).

## Decisión

Cerrar los gaps P0/P1 del PRD adoptando el arco canónico ModoOps (18 secciones) adaptado a kiosco, más Checklist como micro-compromiso (19 en total). Las 8 secciones existentes quedan intactas como base; las 10 faltantes se agregan como extensiones. Sin backend propio.

## Qué se adopta

De ModoOps se traen, adaptados a kiosco: Ejemplo ficticio espejo (E1), Contraste Hoy-vs-Con con 4 pares (E2), Circuito 5 pasos Depósito-Salón-Venta-Cobro-Factura (E3), Descubrimiento pago con agenda 3 días — o Demo con agenda y entregable si el modelo queda SaaS (E4), Garantía con validez en días (E5), Después + Crecer (E7), Migración acotada + ambiente de prueba + Fiscal con contador (E11), alcance/hitos/validez + capacitación cuantificada + datos/salida (E12). Bloque técnico: head SEO canónico + OG PNG + canonical (E8), parseUtm + whatsappWithUtm con source (E9), nav sin `/panel`/`/venta` + brand `href=/` + FloatingWhatsApp con UTM (E10). Higiene E13: sin placeholders, precios con moneda/IVA/vigencia, glosario comerciante, FAQ propio con `details/summary`.

`business.ts` sigue única fuente (crecen `ejemplo`, `contraste`, `circuito`, `descubrimiento`, `migracion`, `fiscal`, `garantia`, `despues`, `crecer`, `seo`, `faq` propio). Landing estática con Formspree doble form; sin neón ni glass.

## Qué cambia

Orden pasa de 8 a 19 secciones: Hero / Problema / Ejemplo / Contraste / Circuito / Solución / Checklist (lead-magnet E6) / Descubrimiento / Camino (=Path) / Planes (se conserva adaptado a kiosco) / Migración / Fiscal / Público (=Audience con lead) / CómoTrabajamos (4 reglas cuantificadas) / Después / Crecer / Garantía / FAQ / Contacto. Camino, Público y CómoTrabajamos se reescriben en contenido sin cambiar contrato estructural. Contacto cede FAQ a sección propia y conserva doble form. E6 no crea ruta `/oficina`: el micro-compromiso se resuelve con lead-magnet (checklist/cotizador) y CTA intermedio en Hero + tras Solución. Plazo ~5 días en bloques A/B/C con DoD por épica (sección + copy en `business.ts` + test vitest en verde).

## Alternativa descartada

Portar `PuenteOficina` con ruta `/oficina` y backend/chat propio. Se descarta porque introduce backend donde ADR-0010/0021 fijaron estático + Formspree, y el PRD admite sustituto de igual valor (E6-R1). Reescribir la landing desde cero o romper las 8 existentes: se descarta porque pierde BaseLayout, Section, Button y `business.ts` ya probados.

## Pendientes

Heredadas: features exactas por plan a validar con negocio (2 cajas, 1 almacén, venta celular, soporte); conciliar `Discovery` contra `PathNebula/SupportModel/Faq` del snapshot; `site` prod, OG image, PDF espejo, dominio más Pages (heredados de LP-S7/ADR-0021).

Nuevas (DoD día-1): `site` prod en `astro.config` (no `localhost:4321`) + canonical/og:url absolutos (E8-R3); OG PNG real <300KB en `public/images` + `twitter:summary_large_image`, `theme-color`, `skip-link` (E8-R1/R2); foto local real en reemplazo del provisorio (E8-R2); PDF espejo mismo copy que web; dominio + Pages; `/oficina` o sustituto explícito con CTA intermedio en Hero/Solución (E6-R1/R2).

Orden sugerido: E13 higiene + E8 SEO base (0.5d) → E9 UTM + E10 nav (0.5d) → E1-E3 arco espejo (1d) → E11-E12 confianza (1d) → E4-E5-E7 oferta/garantía (1d) → E6 + FAQ propio (1-2d).

## Contrato business.ts (tipado, única fuente)

```ts
export interface Ejemplo { eyebrow: string; title: string; fictitious: string; body: string; signs: string[]; closing: string; }
export interface ContrasteRow { hoy: string; con: string; }
export interface Contraste { title: string; lead: string; rows: ContrasteRow[]; }
export interface Circuito { title: string; lead: string; steps: string[]; }
export interface Descubrimiento { title: string; lead: string; agenda: string[]; closing: string; }
export interface Garantia { title: string; lead: string; detail: string; }
export interface Despues { title: string; lead: string; detail: string; }
export interface Crecer { title: string; lead: string; detail: string; }
export interface Seo { site: string; title: string; description: string; ogImage: string; ogImageAlt: string; locale: string; twitterCard: string; }
export function parseUtm(search: string): string;
export function whatsappWithUtm(source: string): string;
```

Reglas: todo copy visible se importa desde `business.ts`; `faq` y `features` según ADR-0021; precios web solo desde `publicPricing`/`planes[].precioUnico` (el resto vive en propuesta); SEO/OG solo desde `seo` con `ogImage` PNG <300KB (WhatsApp no renderiza SVG); `UTM_STORAGE_KEY` propia (`inventario_utm`, no reutilizar `modoops_utm`); allowlist UTM `utm_source,utm_medium,utm_campaign,utm_content,utm_term,gclid,fbclid`.

## Contratos API

Sin endpoints propios. Landing 100% estática. Doble form Formspree: consulta + newsletter → `POST https://formspree.io/f/{PUBLIC_FORMSPREE_FORM_ID}`, newsletter reutiliza el mismo id salvo `PUBLIC_NEWSLETTER_FORM_ID` definido. Query params solo estado de vista: `?enviado=1#contacto`, `?newsletter=1#contacto`. Sin routing ni SSR.

## Eventos

Sin outbox propio. `lead_enviado` (consulta) y `newsletter_suscripcion` existen solo en Formspree. `cta_whatsapp` (click `wa.me` con `whatsappWithUtm(source)`) solo en plausible/analytics. UTM persiste solo en `sessionStorage`, con degradación silenciosa si está bloqueado o hay SSR.

## Errores E1-E6

- E1 placeholders (`example`/`0000`) o falta `PUBLIC_FORMSPREE_FORM_ID`: build falla o muestra respaldo `mailto:` + `wa.me`. No deploy con placeholders.
- E2 monto fuera de `publicPricing`/`planes` o sin nota de validez: remover o llevar a propuesta.
- E3 `sessionStorage` bloqueado/SSR: `whatsappWithUtm` degrada a `parseUtm(location.search)` o `''`; nunca rompe el link `wa.me`.
- E4 `/panel`/`venta` indexables: `noindex` + fuera de sitemap; solo `/` indexable.
- E5 error Formspree: estado `error` visible con reintento y campos conservados en ambos forms.
- E6 string visible hardcodeado fuera de `business.ts`: mover y tipar; se rechaza en revisión.

## Fuera de corte

Canvas three.js (~600KB, choca con "sin neón ni glass"); testimonios (ModoOps no tiene); backend propio de leads (sigue Formspree, reintento manual); tienda online / mayorista como alcance día-1 (solo `Crecer`: "se anota y se cotiza"); facturación propia si se aclara por fuera (E11-R3: "se coordina con tu contador", sin `Fiscal.astro` hasta definir); ruta `/oficina` salvo que negocio la pida (entonces entran `puenteOficina` + `seoOficina`).
