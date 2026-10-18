---
id: ADR-0090
tipo: adr
estado: propuesto
modulos: [fiscal]
depende_de: [ADR-0018, PRD-FE-01]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: |
  Cierra P9-2. Mauri designa contador y abogado para responder las preguntas [a verificar] de PRD-FE-01 antes
  del 2026-12-01, y el sistema mantiene delegación a un computador fiscal único con custodia en KMS.
---
# ADR-0090 - Encuadre legal-fiscal y certificados ARCA

Estado: propuesto. Fecha: 2026-10-18. Fuentes: ADR-0018 (FiscalProvider, delegación, KMS), PRD-FE-01 (FE1-FE16, sección [a verificar]), `docs/06-fiscal-arca/facturacion-electronica-arca.md`, RG 5616, P9-2. Decisión propuesta para aprobación de Mauri.

## Decisión

Mauri designa un contador y un abogado para cerrar las preguntas [a verificar] de PRD-FE-01 antes del 2026-12-01, fecha límite de la RG 5616 para informar `CondicionIVAReceptorId`. El sistema sigue con delegación a un computador fiscal único del proveedor (ADR-0018, D2) y custodia la clave y el TA en KMS (ADR-0018, D8). La conservación de comprobantes queda en 10 años salvo que el asesor fije otro plazo.

El abogado define quién responde ante ARCA por los comprobantes emitidos: el comercio como emisor, el proveedor como delegado, o ambos por contrato. Esa respuesta queda escrita antes de emitir la primera factura de producción.

## Por qué

Las preguntas abiertas son de encuadre fiscal y de responsabilidad legal, no de código. Sin contador no se confirma el modo a pedido por condición, el plazo de conservación ni la letra de la NC cuando cambió la condición del emisor. Sin abogado no queda firme quién responde ante ARCA. La fecha del 2026-12-01 obliga a cerrar el encuadre antes de construir sobre el núcleo fiscal, que hoy solo corre contra el fake de homologación.

## Qué cambia

Nada de código todavía. Al aprobarse, P9-2 deja de estar bloqueado por decisión y pasa a ejecución por PRD-FE-02. Se agrega una tarea de Control Plane por comercio para la delegación, ya prevista en ADR-0018.

## Pendientes

Designar el contador y el abogado. Confirmar si el sistema conserva comprobantes 10 años de su lado o alcanza el resguardo del comercio. Confirmar el circuito de homologación con el computador del proveedor y subir el certificado.
