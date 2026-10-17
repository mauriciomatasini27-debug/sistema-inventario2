---
id: ADR-0042
tipo: adr
estado: aceptado
modulos: [bot]
depende_de: [ADR-0041, PRD-BOT-02]
reemplaza: []
reemplazado_por: ""
resumen: |
  Toda salida y entrada de WhatsApp pasa por una interfaz WhatsAppTransport (enviar, recibir, estado). El núcleo
  puro (router.ts, consulta.ts, envio.ts) no importa adaptadores. Adaptadores: cloud (productivo, ADR-0041) y
  fake (tests y dev). Implementado 2026-10-16 (BOT2-S5); el envío real espera el alta Meta de ADR-0041.
---
# ADR-0042 - Interfaz WhatsAppTransport intercambiable

Estado: aceptado (2026-10-16). Fecha: 2026-10-12. Fuentes: PRD-BOT-02 (BOT2-S5), `src/modules/whatsapp/router.ts`, `src/modules/whatsapp/consulta.ts`, `src/modules/whatsapp/envio.ts`, ADR-0041.

## Decisión

Toda salida y entrada de WhatsApp pasa por una interfaz `WhatsAppTransport` (`enviar`, `recibir`, `estado`). El núcleo puro (`router.ts`, `consulta.ts`, `envio.ts`) no importa adaptadores. Adaptadores: `cloud` (productivo, ADR-0041) y `fake` (tests y dev).

## Por qué

Mantiene el núcleo testeable sin red y permite cambiar de proveedor (por ejemplo a un BSP) sin tocar lógica de negocio.

## Qué cambia

`src/modules/whatsapp/transport.ts` (interfaz), `cliente-cloud.ts` la implementa, `transport-fake.ts` para tests; el webhook normaliza el payload antes de llegar al router.

## Alternativa descartada

Llamar a Cloud API directo desde el router: acopla negocio con proveedor y rompe los tests puros.

## Pendientes

Arch-test: `router.ts` y `consulta.ts` sin imports de adaptadores.