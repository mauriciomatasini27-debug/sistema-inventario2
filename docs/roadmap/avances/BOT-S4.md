---
item: BOT-S4
estado: hecho
adr: ADR-0039
prd: PRD-BOT-01
fecha: 2026-10-16
---
BOT-S4 hecho: el job diario del bot rubro pyme une `flujo_caja` (caja de hoy contra los pagos pendientes a 7 días, con faltante y fiado a cobrar) y `cobranza` (deudores con saldo sobre su tope o con 14+ días de atraso, con link `wa.me` de recordatorio) en UN mensaje de WhatsApp por comercio y día; el núcleo puro `src/jobs/bot-pyme.ts` gatea cada sección por los módulos del tenant (`leerModulosBot`), sin novedades no envía, respeta opt-in/pausa e idempotencia por `bot_pyme:{tenant}:{fecha}`, y `POST /api/jobs/bot-pyme` corre con `correrJob` (X-Job-Secret, tenant de gateJob) sin marcar enviado cuando faltan credenciales Cloud API.
