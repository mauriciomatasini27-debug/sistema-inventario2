---
id: ADR-0113
tipo: adr
estado: aceptado
modulos: [dev]
depende_de: [ADR-0084, ADR-0085, ADR-0109]
reemplaza: []
reemplazado_por: ""
modifica: [PRD-PS-01]
modificado_por: []
resumen: |
  pstack viene del plugin oficial (cursor/plugins, pstack/skills); el repo deja de versionar su copia.
  `.agents/skills/` guarda solo skills del proyecto. El cableado de modelos free de OpenCode no cambia.
---
# ADR-0113 - pstack desde el plugin oficial

Estado: aceptado. Fecha: 2026-10-23. Fuentes: `.agents/skills/`, `skills-lock.json`, `.opencode/pstack-opencode.md`, `cursor/plugins` (`pstack/skills`).

## Decisión

Las 52 skills de pstack que el repo tenía copiadas en `.agents/skills/` (`poteto-mode`, `poteto-help`, `setup-pstack`, `principle-*`, `how`, `why`, `architect`, `arena`, `tdd`, etc.) se borran junto con sus entradas en `skills-lock.json`. pstack se usa desde el plugin oficial: en Cursor lo carga el plugin; en OpenCode se instala a nivel usuario en `~/.config/opencode/skills/`. El repo guarda solo las 30 skills del proyecto (`control-app`, `verify-*`, `prototype`, `state-machine`, `variant`, diseño y animación).

## Por qué

La copia local era una versión vieja con ajustes y le faltaban skills nuevas del plugin (`in-your-own-words`, `statechart`, `sharpen`, `ketchup`, `make-bot-ui`). Mantener dos copias divergentes cuesta más que instalar el plugin, que se actualiza solo.

## Qué cambia

- `.agents/skills/` y `skills-lock.json`: sin skills pstack.
- `AGENTS.md`, `.opencode/pstack-opencode.md`, `.opencode/poteto-agent.prompt.md` y la guía de OpenCode dicen de dónde salen las skills pstack.
- No cambia: `opencode.json`, `.opencode/pstack-run.sh`, `.opencode/modelos-por-skill.json`, `.opencode/modelos.mjs`, `.opencode/pstack-models.md` ni sus tests (`tests/pstack-wiring.test.ts`, `tests/opencode-modelos.test.ts`, `tests/pstack-fallback.test.ts`, `tests/arch/pstack-run.test.ts`). Ese cableado elige modelos free por rol y por nombre de skill; no lee las carpetas borradas, así que sigue vigente (ADR-0085, ADR-0109).
- Las skills del proyecto que nombran skills pstack (`/poteto-mode`, `principle-*`) las resuelven desde el plugin.

## Pendientes

En una máquina nueva con OpenCode hay que instalar pstack en `~/.config/opencode/skills/`; si falta, `/poteto-mode` no aparece en `opencode debug skill`.
