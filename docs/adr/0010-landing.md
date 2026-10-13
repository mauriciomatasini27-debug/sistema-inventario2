# ADR-0010 - Landing ModoOps a Inventario

Estado: aceptado. Fecha: 2026-10-10. Fuente: PRD-LP-01.

## Decisión

Reutilizar arquitectura landing Astro de ModoOps con copy y marca de Inventario.

## Qué se adopta

8 secciones fijas con mismo copy en web y PDF. Hero con valor en 5s más 3 CTA. BaseLayout con SEO, Section con `dark|linen|white`, Button siempre `<a>`, SectionHeading. `business.ts` como única fuente de copy, precios y contacto. Contacto Formspree con `.env` y `/?enviado=1#contacto`.

Tokens landing propios: void, canvas, linen alternado, ash, trust solo acentos. Display `48/1.05`, contenido `1120px`, pill `80px`, cards `20px`. Sin neón ni glass.

## Qué cambia

Hero con stock en tiempo real, 1 almacén, 2 cajas y venta celular. Problema y solución con dominio kiosco. Planes SaaS con price highlight en vez de descubrimiento $155. Sin marca GalaxyGroup ni Odoo.

## Alternativa descartada

Landing nueva desde cero. Se descarta porque pierde BaseLayout, Section, Button y `business.ts` ya probados más el PDF espejo.

## Pendientes

`site` astro.config, favicon, OG, PDF mismo copy, dominio más Pages. Conciliar `Discovery` contra `PathNebula/SupportModel/Faq` del snapshot.

## Contrato business.ts (tipado, única fuente)

```ts
export type SectionVariant = "dark" | "linen" | "white";
export interface Contacto {
  telefono: string;
  email: string;
  wa: string;
  formspreeIdEnv: "PUBLIC_FORMSPREE_FORM_ID";
}
export interface Plan {
  nombre: string;
  precioUnico: string;
  destacado?: boolean;
}
export interface Business {
  marca: string;
  heroTitulo: string;
  heroSubtitulo: string;
  contacto: Contacto;
  planes: Plan[];
}
export const business: Business = {
  marca: "Inventario",
  heroTitulo: "Stock en tiempo real",
  heroSubtitulo: "1 almacén, 2 cajas y venta celular",
  contacto: {
    telefono: "+54 11 0000 0000",
    email: "contacto@inventario.example",
    wa: "https://wa.me/541100000000",
    formspreeIdEnv: "PUBLIC_FORMSPREE_FORM_ID",
  },
  planes: [{ nombre: "Descubrimiento", precioUnico: "$155", destacado: true }],
};
```

Reglas: ningún componente importa copy, precios o contacto desde otro módulo. Cambio en `business.ts` se refleja en Hero, Contacto y footer tras rebuild (LP-S2). `Button` siempre renderiza `<a>`, `Section` solo acepta `SectionVariant`.

Estados Formspree del formulario de contacto:

| Estado | Condición | Vista |
|---|---|---|
| `idle` | Form sin enviar | Form habilitado |
| `sending` | POST en curso | Botón deshabilitado, sin doble envío |
| `ok` | Respuesta 2xx | Redirect a `/?enviado=1#contacto` con mensaje de éxito |
| `error` | Respuesta no 2xx o red caída | Mensaje con reintento, campos conservados |

El `form_id` llega solo por `.env` con `PUBLIC_FORMSPREE_FORM_ID`. Sin el env, Contacto muestra `mailto:` y `wa.me` como respaldo.

## Contratos API

La landing es estática y no expone endpoints propios. El formulario publica al endpoint de Formspree con el id del env. El query `?enviado=1#contacto` es solo estado de vista, sin backend.

## Eventos

Sección presente con aclaración: `lead_enviado` existe solo en Formspree, sin outbox propio. Sin eventos internos ni consumidores. No hay reintento en cola propia: el reintento es manual desde el estado `error`.

## Errores E1-E4

- E1 falta `PUBLIC_FORMSPREE_FORM_ID`: build avisa y Contacto muestra `mailto:` y `wa.me` como respaldo.
- E2 Formspree responde error: estado `error` con reintento, campos conservados.
- E3 doble envío: botón deshabilitado en `sending`, un lead por clic sostenido.
- E4 copy fuera de `business.ts`: se rechaza en revisión, fuente única obligatoria.

## Fuera de corte

`site` astro.config, favicon, OG image, PDF espejo, dominio más Pages, conciliación `Discovery` contra `PathNebula/SupportModel/Faq`, planes SaaS con highlight fuera de Descubrimiento, backend propio de leads.
