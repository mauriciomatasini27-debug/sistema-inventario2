# PRD-BOT-01 - Bot único con módulos por rubro + resumen mensual

Fuente: `07-canales-whatsapp-email/bot-whatsapp-parte-*.md` (B1-B15), ADR-0012, `src/modules/whatsapp/*`. Gap: el bot asume rubro quiosco; sin resumen mensual; sin acciones propuestas por rubro.

## Épica BOT-E1. Rubro y módulos (reusa B1 vinculación)

- BOT-S1. `tenant_bot_modules(tenant_id, modulo, activo)` + rubro en onboarding. AC: Given rubro `quiosco` When termina onboarding Then activa `rotacion` + `vencimientos`; Dueño puede prender/apagar desde `/panel`. Depende de: nada.
- BOT-S2. Router por módulo. AC: Given módulo apagado When llega intención de ese módulo Then responde `no disponible en tu plan/rubro` sin ejecutar. Reusa código 6 dígitos + opt-in + número central. Depende de: BOT-S1.

## Épica BOT-E2. Módulos por rubro

- BOT-S3. Quiosco: `rotacion` (RT6) + `vencimientos` (CAT-S4 15/7/3d). AC: Given lote a 3d When corre job Then avisa + propone promo. Depende de: CAT-S3.
- BOT-S4. Pyme: `flujo_caja` (C1-C18) + `cobranza` (FC1-FC9). AC: Given cliente con saldo > tope o mora 14d When corre job Then lista deudores + propone recordatorio `wa.me`. Depende de: PERS-S4.
- BOT-S5. Fábrica: `ordenes_produccion` (`production_orders`, consumo de insumos). AC: Given orden confirmada When consulta `¿cómo va la OP 12?` Then estado + faltantes de insumo. Depende de: CAT-S1.
- BOT-S6. Logística: `entregas` (`deliveries`, estado por reparto). AC: Given reparto con entrega fallida When cierra el día Then avisa + propone reprogramar. Depende de: BOT-S1.

## Épica BOT-E3. Resumen mensual + acciones

- BOT-S7. Job mensual día 1 09:00 TZ del tenant, WA + email (mismo snapshot, idempotente por `tenant+mes+canal`). AC: Given mes cerrado When corre Then 1 resumen por canal con opt-in; reintento no duplica. Depende de: BOT-S1.
- BOT-S8. Acciones propuestas (máx 3, deterministas, sin IA en P1) con botón. AC: Given acción `reponer X` When toca Then crea borrador (nunca ejecuta pago ni pedido solo). Depende de: BOT-S7.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Feliz | quiosco con lote a 3d | resumen + promo propuesta |
| Fallo | módulo apagado | no ejecuta, responde no disponible |
| Fallo | job mensual corre 2 veces | 1 solo envío por canal |