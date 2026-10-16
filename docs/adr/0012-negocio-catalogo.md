---
id: ADR-0012
tipo: adr
estado: aceptado
modulos: [inventario]
depende_de: [PRD-NEG-01]
reemplaza: []
reemplazado_por: ""
resumen: "Copiar marca blanca, catálogo cerrado y configurador interno. Adaptar precios a SaaS."
---
# ADR-0012 - Negocio y catálogo a Inventario

Estado: aceptado. Fecha: 2026-10-10. Fuente: PRD-NEG-01.
Tipo: estándar de proceso, no ADR de arquitectura. Exento de R1 diseño aplicado.

## Decisión

Copiar marca blanca, catálogo cerrado y configurador interno. Adaptar precios a SaaS.

## Qué se adopta

Marca blanca: vender Inventario, stack real solo en anexo técnico. Catálogo igual a universo ofrecible, crece solo con validación. Configurador interno con lista cerrada, exclusiones, hitos y 20 días de validez. Descubrimiento pago como único precio publicado. Ancla contra aceptación con techo de horas.

## Adaptación SaaS

Ancla $800 y abono $45 Odoo se convierten en planes Básico/Plus/Pro con Mercado Pago según costos. Descubrimiento y crédito se recalibran a onboarding SaaS. Capacidad 2 frentes con red a demanda se mantiene como 2 instalaciones en paralelo.

## Qué no se trae

eCommerce, MRP, CRM, B2B, integraciones ML/Tiendanube como base. Solo como add-on con descubrimiento.

## Alternativa descartada

Vender todo el stack sin catálogo. Se descarta porque promete módulos sin validación y rompe techo de horas.
