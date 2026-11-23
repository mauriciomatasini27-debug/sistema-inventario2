---
item: WA-ESTADOS-WEBHOOK
estado: en curso
adr: —
prd: —
fecha: 2026-11-22
---
WA-ESTADOS-WEBHOOK: la ruta del webhook guarda los estados de Meta (sent, delivered, read, failed) en whatsapp_usage con compare-and-swap que nunca retrocede; la migración 0059 suma entregado_en, leido_en, fallo_codigo y fallo_motivo, está aprobada por Mauri y aplicada en el clúster local, y queda pendiente de aplicar en las bases reales.
