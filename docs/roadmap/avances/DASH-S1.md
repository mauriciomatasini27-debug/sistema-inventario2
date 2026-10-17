---
item: DASH-S1
estado: hecho
adr: ADR-0039
prd: PRD-DASH-01
fecha: 2026-10-17
---
DASH-S1 hecho: /panel/bot/config con estado de vinculación por persona (vinculado, pendiente con expira_en, pausado con pausado_hasta) desde el núcleo puro src/modules/whatsapp/vinculos-panel.ts y el endpoint read-only nuevo GET /api/whatsapp/vinculos (sesión + membership, Dueño ve a todos y Empleado solo se ve a sí mismo, sin hash ni número completo); CTA Vincular WhatsApp con estado vacío de un solo botón, form de celular + Generar código (6 dígitos, 10 min, cuenta regresiva mm:ss con aria-live, regenera sin recargar al vencer; relee el estado cada 5 s mientras el código vive para mostrar el paso a vinculado sin recargar), y toggles de módulos reusando BotModulosCard; decisión: opt-in solo lectura (lo da cada persona por WhatsApp con ALTA, el Dueño no lo cambia), sin migración y sin tablas nuevas, endpoint read-only nuevo sobre el plano de control; sin botón Desvincular porque la respuesta no expone el número completo que exige POST /api/whatsapp/desvincular; lógica de cliente en src/lib/bot-config-panel.ts; sin pill nuevo (queda para DASH-S12); omitidos historial (DASH-S2) y destinatarios (DASH-S5).
