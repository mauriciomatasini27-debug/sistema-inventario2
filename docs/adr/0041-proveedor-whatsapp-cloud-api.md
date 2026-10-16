---
id: ADR-0041
tipo: adr
estado: aceptado
modulos: [bot, compras]
depende_de: [ADR-0007, ADR-0039, ADR-0042, PRD-BOT-02]
reemplaza: []
reemplazado_por: ""
resumen: |
  El bot de stock usa la Cloud API oficial de WhatsApp Business (Meta) directa, con el número central del
  proveedor. Baileys no se usa en ningún ambiente productivo.
---
# ADR-0041 - Proveedor WhatsApp: Cloud API oficial, Baileys descartado

Estado: aceptado (2026-10-12, evidencia: `src/modules/whatsapp/cliente-cloud.ts`). Fecha: 2026-10-12. Fuentes: PRD-BOT-02 (BOT2-S6), `docs/01-fundacion/costos-por-cliente.md` (número central, Cloud API directa), ADR-0007, ADR-0039, `src/modules/whatsapp/cliente-cloud.ts`.

## Decisión

El bot de stock usa la Cloud API oficial de WhatsApp Business (Meta) directa, con el número central del proveedor. Baileys no se usa en ningún ambiente productivo.

## Por qué

Ya existe `cliente-cloud.ts` y la decisión de número central. La Cloud API cobra por mensaje y plantilla, pero el costo es predecible y va dentro del plan. Baileys es un cliente no oficial que emula WhatsApp Web sobre un número personal: puede bloquear el número sin aviso, va contra los términos de WhatsApp y deja al producto sin canal si Meta corta.

## Qué cambia

`cliente-cloud.ts` pasa a ser el adaptador productivo de `WhatsAppTransport` (ADR-0042). Token y `phone_number_id` en variables de servidor. Consultas del vendedor dentro de la ventana de 24 h van como mensaje de servicio.

## Alternativa descartada

Baileys: sin costo por mensaje, pero riesgo de bloqueo del número, incumplimiento de términos y cero soporte. 360dialog/Twilio: quedan como plan B de soporte (ver costos), no como primera opción.

## Pendientes

Alta del número central en Meta, verificación del negocio, plantillas de utilidad aprobadas, verificar precios vigentes en fuente oficial.