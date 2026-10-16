---
id: PRD-LP-04
tipo: prd
estado: propuesto
modulos: [landing, persistencia]
depende_de: [ADR-0010, ADR-0022, ADR-0036, ADR-0046, PRD-DS-01, PRD-LP-01, PRD-LP-02, PRD-LP-03]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: PRD-LP-01, PRD-LP-02, PRD-LP-03, docs/09-frontend-landing-diseno/landing-gaps-modoops.md,
  src/data/business.ts, .agents/skills/better-accessibility/SKILL.md. Fecha extracción: 2026-10-12. Restringido
  por ADR-0010, ADR-0022, ADR-0036, ADR-0046.
---
# PRD-LP-04 - Chat flotante en la landing para clientes (R2)

Fuente: PRD-LP-01, PRD-LP-02, PRD-LP-03, `docs/09-frontend-landing-diseno/landing-gaps-modoops.md`, `src/data/business.ts`, `.agents/skills/better-accessibility/SKILL.md`. Fecha extracción: 2026-10-12. Restringido por ADR-0010, ADR-0022, ADR-0036, ADR-0046. Gap: la landing solo tiene formulario Formspree y contacto; sin respuesta inmediata.

## Épica LP4-E1. Widget que responde y deriva

Requisito LP4-1: el visitante resuelve dudas comunes al instante y, si no alcanza, llega a WhatsApp en un toque.

- Historia LP4-S1. Botón flotante abajo a la derecha que abre un panel de chat; usable a 360 px; foco atrapado, cierre con `Esc`, mensajes en `aria-live`. AC: Given landing a 360 px When abro el chat Then no tapa el CTA principal y cierra con `Esc`. ADR: 0036. Talla S. Depende de: nada.
- Historia LP4-S2. LLM barato con contexto fijo: FAQ, planes y precios públicos, rubros, cómo empezar. AC: Given pregunta de precio When respondo Then uso solo el texto de la FAQ; Given dato que no está Then no invento y derivo. ADR: 0046. Talla M. Depende de: LP4-S1.
- Historia LP4-S3. Derivación: botón `wa.me` al número comercial con mensaje precargado, más link al formulario. AC: Given dos respuestas sin resolver o pedido de humano When ocurre Then muestro el botón de WhatsApp. ADR: 0022. Talla S. Depende de: LP4-S2.

## Épica LP4-E2. Aislamiento estricto y costo acotado

Requisito LP4-2: el chat no toca datos internos del sistema y su gasto tiene techo.

- Historia LP4-S4. Endpoint propio `/api/landing-chat` sin acceso a DB de control ni de tenant, sin function calling, sin variables del sistema; clave LLM separada con tope de gasto mensual. AC: Given `¿cuánto vendió el kiosco X?` When llega Then respondo que no tengo esa información. ADR: 0046. Talla S. Depende de: LP4-S2.
- Historia LP4-S5. Límite por IP y sesión (20 mensajes por día) y sin guardar datos personales salvo que el visitante los deje para contacto, con aviso Ley 25.326. AC: Given mensaje 21 When envío Then derivo a WhatsApp sin llamar al LLM. ADR: 0006. Talla S. Depende de: LP4-S4.

## Dependencias externas

LP4-S1 espera a tokens de PRD-DS-01. LP4-S3 espera al número comercial real en `business.ts:36-39` (Landing E13). LP4-S2 espera FAQ cerrada de PRD-LP-02.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Duda de rubro | `¿sirve para mi almacén?` | Respuesta desde FAQ más CTA |
| Feliz | Derivación | `quiero hablar con alguien` | Botón WhatsApp con mensaje precargado |
| Fallo | Inyección | Prompt pidiendo datos internos | Respuesta genérica, cero acceso |
| Fallo | Abuso | 21 mensajes en un día | Corta y deriva, sin LLM |
| Regresión | Landing | Lighthouse y `astro build` | Sin baja de performance ni CTA tapado |

Arch-tests: AT1 `/api/landing-chat` no importa `src/lib/db.ts` ni `store.ts`. AT2 la clave del chat no es la misma que la del asistente interno.