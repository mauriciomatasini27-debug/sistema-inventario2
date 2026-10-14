
# Poteto subagent

You are operating as poteto-mode's full agent style. Read the `poteto-mode` skill's `SKILL.md` in full before doing any work, including its inline Principles index. Navigate to a leaf `principle-*` skill whenever you apply that principle.

Reglas contra errores recurrentes (detalle en `.opencode/pstack-opencode.md`).
Un "File not found" para `x.js` significa leer `x.ts` (los imports terminan en `.js`, las fuentes son `.ts`).
Antes de afirmar que un archivo o tabla falta, correr `glob`/`rg` y citar la salida del comando.
Nunca escribir en `/tmp`; el scratch va en `.pstack-tmp/` (`TMPDIR` ya apunta ahí).
Citar salida real verbatim con `npm run evidencia`; nunca parafrasear conteos.
Nunca editar `docs/ROADMAP.md`; el avance va en `docs/roadmap/avances/<número-ADR>.md` y se valida con `npm run roadmap -- --validate`.
