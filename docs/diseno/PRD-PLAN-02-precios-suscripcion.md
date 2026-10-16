---
id: PRD-PLAN-02
tipo: prd
estado: propuesto
modulos: [bot, fiscal, precios]
depende_de: [ADR-0018, ADR-0041, ADR-0045, ADR-0047, PRD-ALR-01, PRD-BOT-02, PRD-CAJA-01, PRD-CAT-01, PRD-DASH-01, PRD-FE-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: PRD-PLAN-01, ADR-0047 (no fija montos; cita 15/35/59 USD solo como referencia de
  costos-por-cliente.md), docs/01-fundacion/costos-por-cliente.md,
  docs/02-identidad-onboarding/onboarding-parte-2.md (cupo Básico 100 mensajes), PRD-NEG-01 (único precio
---
# PRD-PLAN-02 - Precios de la suscripción: rango por plan, costos y mercado (R2)

Fuente: PRD-PLAN-01, ADR-0047 (no fija montos; cita 15/35/59 USD solo como referencia de `costos-por-cliente.md`), `docs/01-fundacion/costos-por-cliente.md`, `docs/02-identidad-onboarding/onboarding-parte-2.md` (cupo Básico 100 mensajes), PRD-NEG-01 (único precio público hoy: Descubrimiento), PRD-DASH-01, PRD-UX-01, PRD-BOT-02, PRD-ALR-01, PRD-IA-01, PRD-LP-04, PRD-CAJA-01, PRD-CAT-01, PRD-FE-01, relevamiento de `src/` (`src/lib/store.ts` en memoria, `src/modules/whatsapp/cliente-cloud.ts`, `src/pages/api/billing/webhooks/mercadopago.ts`, `src/modules/fiscal/*`). Fuentes externas consultadas el 2026-10-12 (URLs en cada tabla). Fecha extracción: 2026-10-12. Restringido por ADR-0047, ADR-0041, ADR-0045, ADR-0018.

> Nota 2026-10-12: decisión del dueño: se elimina Descubrimiento (sin precio de servicio ni implementación; la carga de datos va incluida en el onboarding), ver PRD-LANDING-01; revisable.

## Estado actual: nada cobrable todavía

| Pieza | Estado al 2026-10-12 |
|---|---|
| Inventario, ventas, caja, ticket, fiado | Hay código y rutas API, pero la fuente de verdad es `src/lib/store.ts` en memoria; sin persistencia productiva |
| Bot de WhatsApp | Módulos en `src/modules/whatsapp/*` y adaptador Cloud API real; sin número central dado de alta en Meta (ADR-0041 pendiente) |
| Alertas de stock bajo | Jobs de WhatsApp existen; umbrales (`min_stock`) sin código |
| Asistente IA | Sin código (no hay `src/modules/asistente`) |
| Chat de landing | Sin código (no hay `ChatLanding.astro` ni `api/landing-chat.ts`) |
| Planes y cupos | Sin código (todo PRD-PLAN-01) |
| Cobro | Solo `api/billing/webhooks/mercadopago.ts` (firma HMAC, idempotencia en memoria); sin suscripciones |
| Factura ARCA | Núcleo y adaptador WSAA/WSFEv1 escritos y testeados contra fake homo; sin homologación real verificada |

## Precio sugerido por plan

Tipo de cambio: BNA oficial venta ARS 1.535 por USD al 2026-10-12 (https://www.ambito.com/finanzas/dolar-hoy-cuanto-cotiza-este-lunes-12-octubre-n6332655).

| Plan | USD/mes | ARS aprox./mes | Costo operativo estimado (supuesto) | Condición |
|---|---|---|---|---|
| Básico | 15 – 20 | 23 – 31 mil | ~USD 3 | 20 solo con factura ARCA funcionando |
| Plus | 30 – 35 | 46 – 54 mil | ~USD 7 – 8 | Bot con número Meta y alertas por WhatsApp funcionando |
| Pro | 49 – 59 | 75 – 91 mil | ~USD 13 | 59 solo con asistente IA funcionando; si no, 49 |

## Supuestos de costo operativo

Todos los volúmenes son supuestos, no medidos.

| Concepto | Valor | Fuente | Estado |
|---|---|---|---|
| WhatsApp utility Argentina | USD 0,0260 por mensaje | Tabla de Meta reproducida en https://whautomate.com/whatsapp-pricing-updates y https://waply.online/guides/whatsapp-api-pricing-2026/ | A verificar en https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing |
| WhatsApp service Argentina | USD 0,0260 desde 2026-10-01, después de 1.000 gratis por número (compartidos entre todos los tenants) | Ídem | A verificar en la página oficial |
| WhatsApp marketing Argentina | USD 0,0618 | Ídem | A verificar; no se usa en los planes |
| LLM barato | Claude Haiku 5.5: USD 0,10 por millón de tokens de entrada, USD 0,50 por millón de salida | https://platform.claude.com/docs/en/about-claude/pricing | Verificado 2026-10-12 |
| Base de datos | Supabase Pro USD 25/mes | https://supabase.com/pricing | Verificado 2026-10-12 |
| Servidor | Hetzner CX22 ~€4,35 – 4,49/mes | https://vpsfor.dev/posts/hetzner-cx22-pricing-2026/ | Fuente secundaria, a verificar |
| Hosting por tenant | ~USD 0,6 | Supuesto: 50 tenants repartiendo Supabase más servidor | Supuesto |
| Básico | 100 mensajes ≈ USD 2,6 más hosting | Cupo de `onboarding-parte-2.md` | Supuesto |
| Plus | ~65 plantillas (USD 1,7, `costos-por-cliente.md`) más ~200 servicio (USD 5,2) más ~200 consultas IA (~USD 0,1) más hosting | — | Supuesto |
| Pro | ~65 plantillas más ~400 servicio (USD 10,4) más IA (~USD 0,5) más hosting | — | Supuesto |
| No incluido | Comisión de Mercado Pago, IVA, IIBB | — | A definir |

## Competencia en Argentina

Precios publicados, consultados el 2026-10-12.

| Producto | ARS/mes | Nota | URL |
|---|---|---|---|
| IntegralShop | 7.000 / 10.000 (promo; regular 14.000 / 20.000) | ARCA como add-on | https://www.integralshop.com.ar/precios/ |
| Alegra POS | 19.999 / 27.999 / 40.999 / 68.999 más IVA | Factura incluida | https://www.alegra.com/argentina/pos/precios/ |
| AlmaZen (Paikan) | 35.000 / 55.000 / 85.000 | Sin factura ARCA | https://www.paikan.com.ar/sistemas/kiosco-almacen/ |
| Tranquiosco | 35.000 / 49.000 / 75.000 más implementación 150.000 | Alertas de stock en plan medio | https://tranquiosco.com/ |
| Vantyx kiosco | desde 44.900 | Factura incluida | https://vantyx.net/sectores/comercio/kiosco/ |
| Tero POS | 50.000 más IVA (~60.500 con IVA) | Incluye ARCA y bot de WhatsApp | https://pos.terominds.com/ |

Sin datos verificados: Tango Punto de Venta no publica el monto (https://www.gpsystem.com.ar/tango-punto-de-venta/precios/), Bsale no publica para Argentina, y las páginas de precios de Xubio y Contabilium dieron 404.

Lectura: los POS específicos de kiosco cobran 35 – 60 mil ARS (USD 23 – 39).

## Valor percibido por plan

- Básico: mostrador, stock, caja y fiado con offline. Compite con POS de kiosco simples. A USD 15 queda por debajo de AlmaZen y Tranquiosco; sin ARCA no sostiene USD 20 porque Alegra, Vantyx y Tero incluyen factura.
- Plus: consulta de stock por WhatsApp y alertas, lo que casi ningún competidor trae. Tero es la referencia directa (~60.500 con IVA con bot y ARCA); USD 35 (~54 mil) queda en línea.
- Pro: asistente IA y módulos de rubro. A USD 59 (~91 mil) supera al tope de AlmaZen (85 mil); solo se justifica con la IA andando.

## Épica PLAN2-E1. Validar y publicar precios

Requisito PLAN2-1: ningún precio se publica sin verificar costos oficiales y sin que el plan tenga sus funciones andando.

- Historia PLAN2-S1. Verificar tarifas de WhatsApp en la página oficial de Meta y registrar la tarifa en configuración (no hardcodeada, AT2 de PLAN-01). AC: Given abro la tabla oficial de Meta When comparo Argentina utility y service Then la configuración coincide y lleva fecha de consulta; Given difiere de 0,026 Then se recalcula el costo por plan. ADR: 0047, 0041. Talla S. Depende de: nada.
- Historia PLAN2-S2. Medir costo real con 3 a 5 tenants piloto durante un mes con `usage_counters` (PLAN-S10). AC: Given cierra el mes piloto When comparo costo real contra los supuestos 3 / 7-8 / 13 USD Then el desvío queda documentado y, si supera 30%, se ajusta el rango. ADR: 0047. Talla M. Depende de: PLAN-S10, PLAN2-S1.
- Historia PLAN2-S3. Regla de margen: precio en USD del plan mayor o igual a 4 veces su costo operativo medido (supuesto de este PRD). AC: Given costo medido de Plus de USD 9 When reviso el precio Then Plus no baja de USD 36 o se recorta su cupo. ADR: 0047. Talla S. Depende de: PLAN2-S2.
- Historia PLAN2-S4. Condiciones de publicación: Básico a USD 20 solo con factura ARCA en producción; Pro a USD 59 solo con asistente IA en producción, si no USD 49; ningún plan pago antes de persistencia real, número Meta y cobro. AC: Given el asistente no está en producción When armo la tabla pública Then Pro figura a USD 49 o no figura; Given `store.ts` sigue siendo la fuente Then no se publica ningún precio. ADR: 0047, 0018, 0045. Talla S. Depende de: PLAN2-S3, PERS-S4.
- Historia PLAN2-S5. Precio en ARS: se publica en ARS con el tipo de cambio BNA venta del día de cierre de lista y ajuste periódico a definir (`inventario-parte-1.md:49`). AC: Given cambio de lista When recalculo Then queda registrado tipo de cambio, fecha y fuente. ADR: 0047. Talla S. Depende de: PLAN2-S4.

## Dependencias externas

Tarifa oficial de Meta (a verificar). Precio del LLM (verificado el 2026-10-12, puede cambiar). Comisión e impuestos de Mercado Pago (decisión pendiente, PLAN-S13). Factura ARCA en producción para Básico a USD 20 (PRD-FE-01). Asistente IA en producción para Pro a USD 59 (PRD-IA-01). Persistencia real (PRD-PERS-01).

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Tarifa verificada | Tabla oficial Meta igual a 0,026 | Configuración con fecha, costo sin cambios |
| Feliz | Piloto dentro de supuestos | Costo medido de Plus USD 7,5 | Rango 30 – 35 confirmado |
| Fallo | Tarifa distinta | Meta publica otra tarifa | Recalcular costos y rangos |
| Fallo | Margen insuficiente | Costo medido de Pro USD 18 | Pro sube o recorta cupo |
| Fallo | Función faltante | Pro sin asistente en producción | Pro a USD 49 o fuera de la tabla |
| Regresión | Nada cobrable | `store.ts` como fuente | Ningún precio publicado |

Arch-tests: AT1 ningún precio ni tarifa hardcodeado en `src/` (mismo lint que PLAN-01 AT2). AT2 la tabla pública de precios se genera desde `plans` y la configuración de tarifas, nunca a mano. AT3 todo precio publicado lleva tipo de cambio, fecha y fuente.
