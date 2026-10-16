---
id: PRD-ADAP-01
tipo: prd
estado: propuesto
modulos: [inventario]
depende_de: [ADR-0006, ADR-0013, PRD-CP-01, PRD-LP-01, PRD-NEG-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-ADAP-01 - Adaptación ModoOps a Sistema de Inventario (R2)

Fuente: PRD-LP-01, PRD-CP-01, PRD-NEG-01, Parte 3 sec 6 (separado de ModoOps salvo aprendizajes y Tema papel). Restringido por ADR-0013, ADR-0006.

## Épica AD-E1. Landing Inventario

Requisito AD1: portar estructura y fuente única, con dominio de inventario.

- Historia AD-S1. Copiar `BaseLayout`, `global` con `@theme`, `Section`, `Button`, `SectionHeading` y `business.ts` como fuente única. AC: Given cambio el teléfono en `business.ts` When rebuild Then Hero, Contacto y footer muestran el nuevo sin otro edit. ADR: 0013. Talla M. Depende de: nada.
- Historia AD-S2. Armar Hero con valor de inventario: stock en tiempo real, 1 almacén, 2 cajas y venta celular. AC: Given cargo en 360px When leo el Hero Then veo stock en tiempo real, 1 almacén, 2 cajas y venta celular sin scroll horizontal. ADR: 0013. Talla M. Depende de: AD-S1.
- Historia AD-S3. Reescribir Problema, Solución, Camino y Público con dominio kiosco, con planes propios y precio destacado, sin copiar marca GalaxyGroup ni copy de Odoo o fiscal AR. AC: Given leo las cuatro secciones When busco `GalaxyGroup`, `Odoo` o `fiscal AR` Then no hay ninguna mención. ADR: 0013. Talla M. Depende de: AD-S1.

## Épica AD-E2. Control plane Inventario

Requisito AD2: copiar modelo, mora y logs, mapeados a PA1-PA14 solo datos de gestión según Ley 25.326.

- Historia AD-S4. Copiar modelo Tenant con estados, historias MVP, mora con gracia de 14 días y logs. AC: Given comparo el panel con PRD-CP-01 When reviso estados, mora y logs Then coinciden campo por campo con gracia de 14 días. ADR: 0013, 0006. Talla M. Depende de: AD-S1.
- Historia AD-S5. Mapear a PA1-PA14 con tabla de kioscos con vencimiento y backup, botones instalar, suspender y reactivar, y logs a auditoría, sin leer negocio del tenant. AC: Given entro al panel como admin When intento ver ventas o stock de un kiosco Then el acceso se deniega y solo veo contadores técnicos. ADR: 0006. Talla M. Depende de: AD-S4.
- Historia AD-S6. Dejar fuera billing automático, drill-down e impersonación. AC: Given recorro el panel When busco cobro automático, drill-down o impersonación Then ninguna de las tres existe. ADR: 0013, 0006. Talla S. Depende de: AD-S5.

## Épica AD-E3. Negocio Inventario

Requisito AD3: copiar marca blanca, catálogo cerrado y configurador, con precios SaaS.

- Historia AD-S7. Copiar marca blanca con venta de Inventario y anexo técnico con el stack real, catálogo cerrado por módulos validados, configurador interno con lista cerrada y techo de horas, y descubrimiento pago publicado con ancla contra aceptación. AC: Given leo la propuesta When busco el stack real Then solo aparece en el anexo técnico y el alcance trae lista cerrada con techo. ADR: 0013. Talla M. Depende de: AD-S4.
- Historia AD-S8. Adaptar precios a SaaS por planes Básico, Plus y Pro más Mercado Pago, en vez de ancla de 800 y abono de 45 de Odoo. AC: Given abro la lista de precios When busco `800` o `45` de Odoo Then no aparecen y solo figuran Básico, Plus y Pro con Mercado Pago. ADR: 0013. Talla S. Depende de: AD-S7.

## Épica AD-E4. Qué no se trae

Requisito AD4: sin backend Odoo y sin Odoo en marketing.

- Historia AD-S9. Excluir backend Odoo, `odoo-bin`, bases `modoops_*`, POS Odoo, contabilidad Odoo, eCommerce, MRP y CRM. AC: Given reviso el repo When busco `odoo-bin` o `modoops_*` Then no hay ninguna coincidencia. ADR: 0013. Talla S. Depende de: nada.
- Historia AD-S10. Verificar que nada de Odoo aparezca en marketing. AC: Given leo landing y propuesta When busco `Odoo` Then no aparece fuera del anexo técnico. ADR: 0013. Talla S. Depende de: AD-S3, AD-S9.

## Épica AD-E5. Fases con demo

Requisito AD5: tres fases, cada una con demo y criterios.

- Historia AD-S11. Entregar Fase 0 con landing Inventario de 8 secciones y contacto Formspree. AC: Given corro el build When navego Then las 8 secciones renderizan y el envío llega a Formspree. ADR: 0013. Talla M. Depende de: AD-S2, AD-S3.
- Historia AD-S12. Entregar Fase 1 con panel PA con tenants, mora de 14 días y logs. AC: Given suspendo un kiosco en mora When reviso auditoría Then figuran gracia de 14 días y el acto con resultado. ADR: 0013, 0006. Talla L. Depende de: AD-S5, AD-S11.
- Historia AD-S13. Entregar Fase 2 con catálogo y configurador SaaS, con demo y criterios LP6, CP6 y NEG6 por fase. AC: Given cierro cada fase When pido su demo Then hay criterios LP6, CP6 y NEG6 verificados por escrito. ADR: 0013. Talla M. Depende de: AD-S8, AD-S12.

## Dependencias externas

AD-S1 y AD-S9 no esperan a nadie. AD-S4 espera a la estructura copiada. Fase 1 espera a Fase 0 y Fase 2 espera a Fase 1. La mora de 14 días rige para AD-S4, AD-S5 y AD-S12 según ADR-0006.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Fase 0 completa | Build landing más envío Formspree | 8 secciones en orden y lead visible en Formspree |
| Fallo | Propuesta fuera de catálogo | Alcance con módulo no validado | Bloqueo con mensaje de catálogo cerrado |
| Regresión | Marca limpia | Grep en web y marketing | Nada de Odoo, `odoo-bin`, bases `modoops_*` ni GalaxyGroup fuera del anexo |

Arch-tests: AT1 sin imports a backend Odoo desde la web (lint de imports). AT2 panel solo toca datos de gestión (falla si lee negocio tenant, igual que CP-01 AT1).
