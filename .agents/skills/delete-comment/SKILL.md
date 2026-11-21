---
name: delete-comment
description: Podar y clasificar los comentarios de un alcance concreto, moviendo decisiones a ADR y deuda técnica a un issue. Procedimiento estándar de todo src/ (ADR-0064, P10-22).
disable-model-invocation: true
---

# /delete-comment

Repetir la poda de comentarios sobre un módulo o sección de `src/`. Es el procedimiento estándar ratificado en P10-22: ADR-0064 conserva la política (qué y por qué), este skill es el procedimiento detallado y AGENTS.md es el puntero corto. La norma la pone ADR-0064 y la política de PRD-COM-01.

<!-- comentarios-politica-reglas:inicio -->
Escribí solo el porqué no obvio en una línea `// <id> [clase]: …`. Si no hay porqué, borrá el comentario.

### Clases (elegí una)

- **`[plataforma]`** — ¿lo obliga navegador/runtime/librería? Ejemplo: `// P1-6 [plataforma]: service worker no expone headers en offline`.
- **`[fiscal]`** — ¿hay norma citada? Ejemplo: `// ADR-0089 [fiscal]: RG 4291 exige QR en el pie del comprobante`.
- **`[tenant]`** — ¿evita que un comercio vea/escriba datos de otro? Ejemplo: `// TB-165 [tenant]: el tenant_id sale de la sesión, nunca del body`.
- **`[rol]`** — ¿evita que un Empleado haga algo de Dueño? Ejemplo: `// P10-24 [rol]: el Empleado no ve precios de costo`.

Si ninguna pregunta da sí, el comentario se va.

### COM-S7

Con marcadores `TODO, FIXME, HACK, XXX, parche temporal, por ahora` en línea nueva, abrí un issue y poné `#<número>` en la misma línea.

### Formato

Preferí `//` de una línea. JSDoc no suma en `src/` (ADR-0064): pasá el porqué a `//`.

### Criterio (manual)

Tautología, excusa, obsoleto y registro de decisión los juzgás vos en los pasos de este skill; el check solo valida forma.
<!-- comentarios-politica-reglas:fin -->

Un parche temporal se refactoriza o se registra como deuda; nunca se explica en un comentario.

## Pasos

1. **Fijar el alcance** en una frase (un módulo, un directorio). Listar todos los bloques `//`, `/* */`, JSDoc e inline de ese alcance. Agrupar en unidades de idea: bloques contiguos que repiten un mismo porqué cuentan como uno solo.

2. **Clasificar cada unidad** en una de cinco categorías:

   - **Tautología** — repite lo que el código ya muestra. Acción: borrar.
   - **Excusa** — existe para normalizar un atajo. Test: si al borrarla el código queda igual de correcto, no es excusa; si estaba ahí para explicar por qué el código *no hace lo que debería*, sí lo es. Precisión extra: si conviven un porqué de dominio válido y un marcador temporal (`Slice-0`, `P1`, `por ahora`, `no agrega migración`), el marcador gana. Acción: borrar + deuda.
   - **Desactualizado** — habla de código, librería o dato que ya no es relevante. Acción: borrar.
   - **Registro de Decisión** — porqué no obvio con alternativa real. Antes de crear un ADR verificar los tres criterios de `domain-modeling`: difícil de revertir, sorprendente sin contexto, resultado de un trade-off. Si el id ya está en `docs/adr/` o `decisions.tsv`, es duplicado: borrar. Si es aplicación de un ADR existente, agregar una línea a ese ADR y borrar. Recién si no cabe en ninguno, crear ADR nuevo.
   - **Conocimiento no obvio** — detalle de librería o runtime que no es decisión. Acción: moverlo a `docs/guias/gotchas-<área>.md`; nunca a `GLOSSARY.md` (ese archivo solo define términos del dominio).

3. **Aplicar** cada acción. Verificar cada afirmación del comentario contra el código real antes de decidir: un comentario falso se borra igual. Si el destino es deuda, publicarla como issue real con `gh` y respetar la clasificación `ready-for-agent`/`ready-for-human`; el borrador local de `PLAN-COM-01-D` fue solo la etapa previa a esa publicación (#276). COM-S7 ya está activo: todo marcador en línea nueva exige `#<issue>` en la misma línea.

4. **Cerrar** con `npm run docs:check`, `npm run typecheck`, `npm run check:arch` y `npm run verify`. El check de comentarios ya corre dentro de `verify` y solo evalúa comentarios nuevos: id registrado, clase `[plataforma]`, `[fiscal]`, `[tenant]` o `[rol]`, sin JSDoc.

Criterio de terminación: no queda ningún bloque del alcance sin clasificar, cada uno tiene su destino aplicado, y los cuatro comandos pasan.
