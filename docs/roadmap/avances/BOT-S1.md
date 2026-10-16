---
item: BOT-S1
estado: hecho
adr: ADR-0039
prd: PRD-BOT-01
fecha: 2026-10-16
---
BOT-S1/S2 hechos: módulos del bot por tenant (`rotacion`, `vencimientos`, `flujo_caja`, `cobranza`, `ordenes_produccion`, `entregas`) con defaults por rubro (quiosco `rotacion`+`vencimientos`, pyme `flujo_caja`+`cobranza`, fábrica `ordenes_produccion` y logística `entregas` detrás del flag `BOT_RUBROS_AVANZADOS` apagado), activados al terminar el alta en `POST /api/onboarding/alta`; el Dueño prende/apaga con `PATCH /api/bot-modulos` (rol desde sesión+membership, nunca del body) y un toggle en `/panel`; el router de WhatsApp responde `no disponible en tu plan/rubro` sin ejecutar cuando el módulo está apagado (tests/bot-modulos-rubro.test.ts). Pendiente de migración: la tabla `tenant_bot_modules`; hasta entonces la persistencia es el espejo en memoria de control vía el puerto `Almacen` (`crearAlmacenBotModulos`).
