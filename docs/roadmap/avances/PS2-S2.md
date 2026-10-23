---
item: PS2-S2
estado: hecho
adr: "0113"
prd: PRD-PS-01
fecha: 2026-10-23
---
PS2-S2 hecho: se quitan los agentes de OpenCode `poteto-agent` y `comment-sicko` (sin skill tras ADR-0113) de `opencode.json`, sus prompts, `modelos-por-skill.json` y el sheet; quedan `pstack-worker` y `pstack-judge`, y `tests/pstack-wiring.test.ts` falla si un agente apunta a un prompt inexistente o si vuelve un agente quitado.
