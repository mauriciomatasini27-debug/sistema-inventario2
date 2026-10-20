---
item: DASH-S9
estado: hecho
adr: ADR-0038
prd: PRD-DASH-01
fecha: 2026-10-19
---
DASH-S9 hecho: máquina pura `src/lib/asistente-chat.ts` con los 5 estados (`inactivo`, `enviando`, `respondiendo`, `error`, `sin_cupo`), doble envío ignorado, timeout de 20 s con `AbortController`, `Reintentar` con la misma pregunta y `sin_cupo` terminal; el drawer usa esa máquina como única fuente de estado, el GET de `/api/asistente` suma el medidor de cupo con la fórmula compartida de `src/lib/plan-panel.ts` (lo que DASH-S8 dejó pendiente para el drawer), el POST con cupo agotado responde 429 `codigo: "sin_cupo"` (elegido sobre 200 para que el cliente lo distinga por status; `preguntar` expone `motivo: "sin_cupo"` sin cambiar WhatsApp y no gasta cupo ni llama al LLM) con la explicación y `reinicia_el`, y tests unitarios, de ruta y e2e cubren estados, medidor y 360 px en claro y oscuro.
