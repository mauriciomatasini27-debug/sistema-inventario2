---
id: PRD-LANDING-01
tipo: prd
estado: en curso
modulos: [landing, precios]
depende_de: [ADR-0010, ADR-0012, ADR-0021, ADR-0022, ADR-0029, ADR-0030, ADR-0032, ADR-0038, ADR-0046, ADR-0047]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: PRD-PLAN-01 (tabla de planes, PLAN-E6 embudo, PLAN-S15 prueba 14 días, PLAN-S16 chat como captación),
  PRD-PLAN-02 (rangos y PLAN2-S4 condiciones de publicación), ADR-0047, docs/01-fundacion/costos-por-cliente.md
  (referencia 15/35/59 USD), PRD-LP-01 (LP-S2 fuente única business.ts, LP-S5 un solo precio público), PRD-LP-02
---
# PRD-LANDING-01 - Planes y precios en la landing (R2)

> Estado al 2026-10-20: en curso. LAND-S4, S9 y S12 están cumplidos; LAND-S1/S3 (precio estructurado y nota ARS/BNA), S5 (tabla comparativa), S6 ("Próximamente") y S10 (lead con consentimiento) siguen pendientes; LAND-S11 (reducir a 13 secciones) quedó diferido. El chat de landing todavía no lee planes.

Fuente: PRD-PLAN-01 (tabla de planes, PLAN-E6 embudo, PLAN-S15 prueba 14 días, PLAN-S16 chat como captación), PRD-PLAN-02 (rangos y PLAN2-S4 condiciones de publicación), ADR-0047, `docs/01-fundacion/costos-por-cliente.md` (referencia 15/35/59 USD), PRD-LP-01 (LP-S2 fuente única `business.ts`, LP-S5 un solo precio público), PRD-LP-02 (LP2-S1 features por plan, LP2-S2 nota de cotización, AT3), PRD-LP-03, PRD-LP-04, PRD-NEG-01 (NEG-S8 Descubrimiento como único precio), PRD-OP-01 (OP-S4 landing E13), PRD-DASH-01 (DASH-S10 `ChatLanding.astro`), PRD-UI-01 a PRD-UI-07, `docs/diseno/SPEC-UI-00-implementacion.md`, `docs/09-frontend-landing-diseno/landing-gaps-modoops.md` (E1-E13), `docs/README.md` sección 09, ADR-0010, ADR-0021, ADR-0022, ADR-0029, ADR-0030, ADR-0046, `src/pages/index.astro`, `src/layouts/BaseLayout.astro`, `src/components/sections/*.astro`, `src/components/sections/Planes.astro`, `src/components/ui/FloatingWhatsApp.astro`, `src/data/business.ts:44-75,168-171`. Fecha extracción: 2026-10-12. Restringido por ADR-0047, ADR-0010, ADR-0012, ADR-0032 a ADR-0038, ADR-0046.

## Estado actual de la landing

`src/pages/index.astro` arma 18 secciones en este orden: Hero, Problema, Ejemplo, Contraste, Circuito, Solucion, Checklist, Descubrimiento, Camino, Planes, Migracion, Fiscal, Publico, ComoTrabajamos, Despues, Crecer, Garantia, Faq, Contacto, más el chat `ChatLanding.astro`.

Ya existe una sección `Planes` (`Planes.astro`, `#planes`) que lee `business.planes`: Básico `Consultar`, Plus `Precio a confirmar` destacado, Pro `A medida`, con nota "Precios de lista en ARS + IVA, validez 20 días" (`business.ts:171`). El precio de Plus sigue pendiente de P9-5/PLAN-02. Las features actuales (cajas, celular, reposición, soporte) no coinciden con la tabla de PRD-PLAN-01, y `$29.000` (~USD 19 a 1.535) no coincide con ningún rango de PRD-PLAN-02. Este PRD no crea la sección: la rediseña y le hace lugar.

## Planes y funciones

Fuente: PRD-PLAN-01. Estado de implementación según PRD-PLAN-02.

| Función | Básico | Plus | Pro |
|---|---|---|---|
| Inventario, ventas, caja, ticket, fiado, offline | Sí | Sí | Sí |
| Alertas de stock bajo por email | Sí | Sí | Sí |
| Consulta de stock por WhatsApp | 100 mensajes/mes | Cupo a definir | Cupo a definir |
| Alertas por WhatsApp y aviso matutino | — | Sí | Sí |
| Módulos de rubro del bot | — | quiosco | Todos |
| Asistente IA `Preguntale al negocio` | — | Cupo chico | Cupo mayor |
| Factura electrónica ARCA | A confirmar (condiciona USD 20) | A confirmar | A confirmar |

## Montos

ADR-0047 no fija precios: los 15/35/59 USD aparecen solo como referencia de `costos-por-cliente.md`. Publicar cualquier monto depende de PLAN2-S4 (persistencia real, número Meta, cobro, ARCA para Básico a 20, asistente IA para Pro a 59). Tipo de cambio: BNA oficial venta ARS 1.535 por USD al 12/10/2026.

| Plan | Referencia `costos-por-cliente.md` | Rango sugerido PRD-PLAN-02 | ARS aprox. (1.535) |
|---|---|---|---|
| Básico | USD 15 | USD 15 – 20 | 23 – 31 mil |
| Plus | USD 35 | USD 30 – 35 | 46 – 54 mil |
| Pro | USD 59 | USD 49 – 59 | 75 – 91 mil |

Mientras PLAN2-S4 no se cumpla, las tarjetas muestran `Precio a confirmar` y ningún número.

## Secciones a quitar, fusionar o reemplazar

Decisión del dueño 2026-10-12, revisable: se elimina el servicio Descubrimiento y su precio. No hay costo de implementación ni de alta: el cliente se suscribe a un plan y la carga de sus datos está incluida en el onboarding.

Propuestas, no cambios: ningún doc de landing se modifica en este PRD.

| Sección actual | Propuesta | Por qué | Fuente |
|---|---|---|---|
| Descubrimiento | Quitar y reemplazar por la prueba gratis de 14 días más la carga de datos incluida en el onboarding, dentro de Planes | Decisión del dueño 2026-10-12 (revisable): no hay precio de servicio ni de implementación; el cliente se suscribe y la carga inicial es parte del alta | Decisión del dueño 2026-10-12, `landing-gaps-modoops.md` E4, PRD-NEG-01 NEG-S8, PRD-PLAN-01 PLAN-S15 |
| Camino | Fusionar en Planes como "Cómo empezar" (alta, prueba, elegir plan) | Es onboarding; repite el CTA de prueba | `landing-gaps-modoops.md` E3-R3 |
| Despues + Crecer | Fusionar en una sola sección o quitar Crecer | Crecer hace upsell que pasa a la tabla comparativa | `landing-gaps-modoops.md` E7 |
| Solucion | Fusionar en Contraste | Contraste Hoy vs Con ya cubre la solución con 4 pares | `landing-gaps-modoops.md` E2 |
| ComoTrabajamos | Fusionar en Migracion | Alcance e hitos son de proyecto; en SaaS queda la carga inicial | `landing-gaps-modoops.md` E11, E12 |
| Garantia | Reemplazar por línea bajo Planes: "Sin permanencia, cancelás cuando quieras, tus datos quedan" | La reversión de riesgo pasa a ser la prueba y la baja libre | `landing-gaps-modoops.md` E5, PRD-PLAN-01 PLAN-S5 |
| FloatingWhatsApp | Reemplazar por `ChatLanding.astro` | Chat como captación sin perder WhatsApp | PRD-DASH-01 DASH-S10, PRD-LP-04 |
| Hero, Problema, Ejemplo, Contraste, Circuito, Checklist, Planes, Migracion, Fiscal, Publico, Faq, Contacto | Mantener | Conversión P0 o condición del Básico (Fiscal) | `landing-gaps-modoops.md` E1-E3, E11, E13; PRD-LP-02 LP2-S3, LP2-S4 |

Resultado: de 19 a 13 secciones; Planes queda después de Circuito y antes de Checklist.

## Épica LAND-E1. Tarjetas de planes

Requisito LAND-1: los tres planes se leen y comparan en 10 segundos, con Plus destacado y montos solo si están habilitados.

- Historia LAND-S1. Actualizar `business.planes` con nombres, features de la tabla de PRD-PLAN-01 y campo `precio` estructurado (`usd`, `ars`, `fecha_cambio`, `publicado`), sin texto libre de precio. AC: Given `publicado=false` When renderizo `#planes` Then cada tarjeta dice `Precio a confirmar` y no hay `$`; Given `publicado=true` Then la tarjeta muestra ARS grande, USD chico y la fecha del tipo de cambio. ADR: 0047, 0010. Talla S. Depende de: PLAN-S1.
- Historia LAND-S2. Diseño de tarjeta: nombre, precio, una línea de para quién es, 4 a 6 features, CTA. Plus destacado con borde y etiqueta `Recomendado` en texto, no solo color. AC: Given leo las tres tarjetas When comparo Then el destacado se reconoce sin color (lector de pantalla anuncia `Recomendado`). ADR: 0034, 0036, 0047. Talla S. Depende de: LAND-S1.
- Historia LAND-S3. Nota de precio bajo las tarjetas: `Precios en ARS + IVA según tipo de cambio BNA del <fecha>`; sin fecha no se publica. AC: Given precio publicado sin fecha When corro el build Then falla. ADR: 0047, 0035. Talla S. Depende de: LAND-S1, PLAN2-S5.
- Historia LAND-S4. CTA único por tarjeta `Probar 14 días gratis`, sin tarjeta de crédito y con la carga de datos incluida en el onboarding, a `/alta?plan=<nombre>`; secundario `Hablar por WhatsApp`. AC: Given toco el CTA de Plus When llego a `/alta` Then el plan queda preseleccionado y la UTM de origen se conserva. ADR: 0047, 0030. Talla S. Depende de: PLAN-S15.

## Épica LAND-E2. Comparación y upsell

Requisito LAND-2: la diferencia entre planes se ve en una tabla, no en párrafos.

- Historia LAND-S5. Tabla comparativa bajo las tarjetas, colapsada por defecto (`Ver todo lo que incluye cada plan`), filas de PRD-PLAN-01, con `Sí`, `—` y cupos en texto. AC: Given expando la tabla When leo una fila Then cada celda tiene texto, no solo iconos; Given lector de pantalla Then encabezados de fila y columna están marcados. ADR: 0036, 0047. Talla M. Depende de: LAND-S1.
- Historia LAND-S6. Funciones planificadas marcadas `Próximamente` hasta estar en producción (asistente IA, alertas por WhatsApp), nunca prometidas como hechas. AC: Given el asistente no está en producción When leo Pro Then dice `Asistente IA (próximamente)`. ADR: 0047, 0035. Talla S. Depende de: LAND-S5.

## Épica LAND-E3. Mobile y accesibilidad

Requisito LAND-3: a 360 px los planes se recorren sin zoom ni scroll horizontal.

- Historia LAND-S7. A 360 px las tarjetas van apiladas con Plus primero; la tabla pasa a acordeón por plan. AC: Given 360 px When abro `#planes` Then no hay scroll horizontal y el CTA de Plus se ve sin desplazar más de una pantalla. ADR: 0032. Talla S. Depende de: LAND-S2, LAND-S5.
- Historia LAND-S8. Precios con `tabular-nums`, contraste AA, foco visible en CTA y acordeón, motion menor a 300 ms con `reduced-motion`. AC: Given corro `check:contrast` y `check:ui` When terminan Then cero fallas en `#planes`. ADR: 0033, 0034, 0036, 0037. Talla S. Depende de: LAND-S7.

## Épica LAND-E4. Chat de landing como captación

Requisito LAND-4: el chat responde sobre planes con el mismo dato que la página y deja un lead.

- Historia LAND-S9. El contexto del chat (PRD-LP-04) lee los planes desde `business.planes`; con `publicado=false` responde `Precio a confirmar` y ofrece la prueba. AC: Given pregunto `¿cuánto sale Plus?` When responde Then el texto coincide con la tarjeta y no inventa montos. ADR: 0046, 0047. Talla S. Depende de: LAND-S1, DASH-S10.
- Historia LAND-S10. Lead con consentimiento: al mostrar interés ofrece dejar WhatsApp o ir a `/alta`. AC: Given dejo mi número When confirmo el consentimiento Then queda el lead con UTM y sin otros datos. ADR: 0046. Talla S. Depende de: PLAN-S16.

## Épica LAND-E5. Liberar espacio

Requisito LAND-5: la landing baja de 19 a 13 secciones sin perder conversión P0.

- Historia LAND-S11. Aplicar las fusiones y reemplazos de la tabla de secciones, una por PR, con medición de clics a `#planes` antes y después. AC: Given quito Descubrimiento When mido 2 semanas Then los clics a la prueba no bajan; si bajan, se revierte. ADR: 0010, 0021. Talla M. Depende de: LAND-S4.
- Historia LAND-S12. Superar la regla de "un solo precio público" (LP-S5, AT3 de PRD-LP-02, NEG-S8) a favor de los precios de los planes, por decisión del dueño 2026-10-12 (revisable): sin precio de servicio ni de implementación. Los tests de landing pasan de `un solo $` a `precios solo desde business.planes`; los montos siguen saliendo solo cuando PLAN2-S4 lo habilita. AC: Given leo la landing When busco `$` Then solo aparecen precios de `business.planes` y ninguno de servicio o implementación; Given PLAN2-S4 sin cumplir Then no aparece ningún `$`. ADR: 0047, 0012. Talla S. Depende de: LAND-S1.

## Dependencias externas

Publicar montos espera a PLAN2-S4 y PLAN2-S5. CTA de prueba espera a PLAN-S15 y `/alta` operativo. Chat espera a DASH-S10 y PRD-LP-04. Fusiones esperan a métricas de UTM (landing E9). Dominio, OG y Formspree siguen en E13 de PRD-OP-01.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Precio no publicado | `publicado=false` | `Precio a confirmar`, cero `$` |
| Feliz | Precio publicado | Plus `usd=35`, fecha 12/10/2026 | ARS, USD y fecha visibles, nota IVA |
| Feliz | CTA prueba | Toco `Probar 14 días` en Plus | `/alta?plan=Plus` con UTM |
| Feliz | Chat precio | `¿cuánto sale Plus?` | Mismo texto que la tarjeta |
| Fallo | Precio sin fecha | `publicado=true` sin `fecha_cambio` | Build falla |
| Fallo | Precio de servicio | Aparece un precio de servicio o de implementación | Test de landing falla |
| Fallo | Función no lista | Asistente fuera de producción | `Próximamente` en Pro |
| Regresión | 360 px | `#planes` en mobile | Sin scroll horizontal, Plus primero |
| Regresión | Fusión de secciones | Landing con 13 secciones | Clics a la prueba sin baja |

Arch-tests: AT1 precios y features de planes solo desde `business.planes` (extiende AT1 de PRD-LP-01). AT2 ningún `$` en `src/components/sections/*` fuera de `Planes.astro` (reemplaza AT3 de PRD-LP-02 cuando LAND-S12 cierre). AT3 el contexto del chat importa los planes del mismo módulo que la página.
