---
item: BOT-S3
estado: hecho
adr: ADR-0039
prd: PRD-BOT-01
fecha: 2026-10-16
---
BOT-S3 hecho: el job diario del bot rubro quiosco une `vencimientos` (CAT-S4 15/7/3d) y `rotacion` (RT6 dormidos) en UN mensaje de WhatsApp por comercio y día, con la promo propuesta para los lotes a ≤3 días (motivo "vencer") y para los dormidos (motivo "dormido"); el núcleo puro `src/jobs/bot-quiosco.ts` gatea cada sección por los módulos del tenant (`leerModulosBot`), sin novedades no envía, respeta opt-in/pausa e idempotencia por `bot_quiosco:{tenant}:{fecha}`, y `POST /api/jobs/bot-quiosco` corre con `correrJob` (X-Job-Secret, tenant de gateJob) sin marcar enviado cuando faltan credenciales Cloud API.
