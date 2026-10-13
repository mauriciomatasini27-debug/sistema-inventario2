# ADR-0021 - Landing iteración contenido (PRD-LP-02)

Estado: aceptado. Fecha: 2026-10-11. Fuente: PRD-LP-02, auditoría LP-S1/S7 vs `consultoria/web`.

## Decisión

Iterar la landing solo con contenido + micro-interacciones CSS. Sin canvas three.js. 8 secciones intactas.

## Qué se adopta

De ModoOps se traen, adaptados a kiosco: FAQ (4-6 Q dentro de Contacto), lista "No es para vos" en Público, newsletter como segundo form Formspree (`/?newsletter=1#contacto`), detalle de features por plan Básico/Plus/Pro. Reveal on scroll con `IntersectionObserver` respetando `prefers-reduced-motion`, más hovers.

## Qué cambia

Nada estructural: `business.ts` sigue única fuente (crecen `faq`, `planes[].features`, `audience.no`, `footer`). Contacto pasa a doble form. Sin `Odoo`, `GalaxyGroup` ni `$` nuevos (LP-S5 intacto).

## Alternativa descartada

Portar el canvas de nebulosa three.js (~600KB). Se descarta porque choca con "sin neón ni glass" de ADR-0010 y el tema papel claro; el costo visual no compensa. FAQ como 9ª sección: se descarta para no enmendar el contrato de 8 secciones.

## Pendientes

Features exactas por plan a validar con negocio (propuesta inicial desde dominio: 2 cajas, 1 almacén, venta celular, soporte). `site` prod, OG image, PDF espejo, dominio más Pages (heredados de LP-S7).

## Contrato faq (tipado, única fuente)

```ts
export interface FaqItem {
  q: string;
  a: string;
}
export interface Plan {
  nombre: string;
  precioUnico: string;
  destacado?: boolean;
  features: string[];
}
```

Reglas: faq y features solo se importan desde `business.ts`. Newsletter reutiliza `PUBLIC_FORMSPREE_FORM_ID` salvo `PUBLIC_NEWSLETTER_FORM_ID` definido.

## Contratos API

Sin endpoints propios. Newsletter publica a Formspree igual que consulta. `?newsletter=1#contacto` es solo estado de vista.

## Eventos

`lead_enviado` (consulta) y `newsletter_suscripcion` existen solo en Formspree. Sin outbox propio.

## Errores

- E1 sin `PUBLIC_FORMSPREE_FORM_ID`: ambos forms muestran respaldo `mailto:` y `wa.me`.
- E2 Formspree error: estado `error` con reintento, campos conservados, en ambos forms.
- E3 doble envío: botón deshabilitado en `sending`.

## Fuera de corte

Canvas three.js, testimonios (ModoOps no tiene), 9ª sección, backend propio de leads.
