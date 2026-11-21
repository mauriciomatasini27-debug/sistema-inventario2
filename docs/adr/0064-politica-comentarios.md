---
id: ADR-0064
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0016, PRD-COM-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Un comentario en src/ se queda solo si explica un por qué que el código no puede decir, en una de cuatro clases:
  particularidad de navegador o plataforma, regla fiscal o legal con referencia, invariante de seguridad o de
  aislamiento por tenant, o restricción Dueño/Empleado por rol. Todo lo demás se borra.
---
# ADR-0064 - Política de comentarios de código: solo por qué no obvio

Estado: aceptado. Fecha: 2026-10-13. Ratificado: 2026-11-21. Fuentes: PRD `diseno/PRD-COM-01-poda-comentarios.md`, ADR-0016, skill `no-comments` de pstack.
Tipo: estándar de proceso, no ADR de arquitectura.

## Decisión

Un comentario en `src/` se queda solo si explica un por qué que el código no puede decir, en una de cuatro clases: particularidad de navegador o plataforma, regla fiscal o legal con referencia, invariante de seguridad o de aislamiento por tenant, o restricción Dueño/Empleado por rol (`[rol]`). Todo lo demás se borra. Un parche temporal no se explica en un comentario: se refactoriza o se abre un issue.

> Enmienda 2026-11-21 (P10-25): la clase `[rol]` separa permisos por rol del aislamiento multi-tenant. Fuente única de criterios: `scripts/comentarios-politica.mjs`.

## Qué se adopta

- Borrar los comentarios que repiten el código, los obsoletos y los falsos frente al código actual.
- Convertir los comentarios de parche (`TODO`, `por ahora`, `temporal`, `hack`) en refactor o en issue enlazado.
- Regla de lint: un marcador temporal sin enlace a issue en la misma línea falla.
- Checklist de PR: cada comentario nuevo declara su clase y cada afirmación sobre tablas, rutas o flags se verifica contra el código.
- `/no-comments` sobre el diff antes de cerrar un PR que suma comentarios.
- Los comentarios usan términos neutrales (`comercio`, `tenant`); `kiosco` solo en reglas propias de ese rubro.

## Alternativa descartada

Dejar los comentarios de parche como documentación del estado actual. Se descarta porque los agentes copian el parche junto con su explicación y el comentario sobrevive al arreglo, como pasó con comentarios que decían que una tabla no existía.

## Procedimiento

El procedimiento canónico para podar un alcance de `src/` vive en el skill `/delete-comment` (`.agents/skills/delete-comment/SKILL.md`): agrupar los bloques en unidades de idea y clasificar cada una en **Tautología** (borrar), **Excusa** (borrar + deuda; test: si al borrarla el código queda igual de correcto, no es excusa; si conviven un porqué de dominio y un marcador temporal, gana el marcador), **Desactualizado** (borrar), **Registro de Decisión** (los tres criterios de `domain-modeling`: difícil de revertir, sorprendente sin contexto, resultado de un trade-off; si el id ya existe es duplicado y se borra; si aplica un ADR existente se agrega una línea) o **Conocimiento no obvio** (mover a una guía). Las decisiones van a un ADR o `decisions.tsv`; los gotchas de runtime a `docs/guias/gotchas-<área>.md`; `GLOSSARY.md` solo define términos del dominio. Todo bloque nuevo declara su clase `[plataforma]`/`[fiscal]`/`[tenant]`/`[rol]` y un id de ítem registrado (con guion); los marcadores en líneas nuevas llevan `#<issue>` en la misma línea (COM-S7; sin `temporal` suelto). No JSDoc. Ratificado para todo `src/` en P10-22; el orden de poda lo da #275 y la deuda se publica antes de podar (#276). El check mecánico (`scripts/check-comment-ids.mjs`) usa el scanner de TypeScript y la política generada con `npm run docs:comentarios`.

## Consecuencias

Menos comentarios y más issues. La regla de lint entró después de publicar los issues del plan (`diseno/PLAN-COM-01-poda-comentarios.md`) para no romper el build con los marcadores actuales; hoy corre dentro de `verify` (`scripts/check-comment-ids.mjs`).

## Pendientes

- Método ratificado como estándar de todo `src/` en P10-22: ADR-0064 conserva la política, el skill `delete-comment` es el procedimiento detallado (manual) y AGENTS.md es el puntero corto; sin ADR nuevo.
- Ya aplicado en `src/modules/cash/` (TB-166): el grupo borrar, la consolidación de decisiones en ADR-0004 y ADR-0120, y los tres gotchas en `docs/guias/gotchas-caja.md`.
- Ejecutar la poda por área sobre los dos inventarios: `PLAN-COM-01` y el relevamiento de #273 para `src/modules` (salvo `cash/`), `src/offline/` y middleware.
- Falta COM-S6: publicar por área el resto de la deuda (65 issues del plan + 20 agrupados del inventario #273, de un total de 88 junto con los 3 de `cash/` ya publicados).
- La ejecución por área —dos olas, gate por área, deuda publicada antes de podar, ratchet y criterio de fin— sigue `diseno/PLAN-COM-01/e-ejecucion.md` (PLAN-COM-01-E).
