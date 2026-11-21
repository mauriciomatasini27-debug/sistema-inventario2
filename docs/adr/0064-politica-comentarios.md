---
id: ADR-0064
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0016, PRD-COM-01]
reemplaza: []
reemplazado_por: ""
resumen: |
  Un comentario en src/ se queda solo si explica un por qué que el código no puede decir, en una de tres clases:
  particularidad de navegador o plataforma, regla fiscal o legal con referencia, invariante de seguridad o de
  aislamiento por tenant. Todo lo demás se borra.
---
# ADR-0064 - Política de comentarios de código: solo por qué no obvio

Estado: aceptado. Fecha: 2026-10-13. Ratificado: 2026-11-21. Fuentes: PRD `diseno/PRD-COM-01-poda-comentarios.md`, ADR-0016, skill `no-comments` de pstack.
Tipo: estándar de proceso, no ADR de arquitectura.

## Decisión

Un comentario en `src/` se queda solo si explica un por qué que el código no puede decir, en una de tres clases: particularidad de navegador o plataforma, regla fiscal o legal con referencia, invariante de seguridad o de aislamiento por tenant. Todo lo demás se borra. Un parche temporal no se explica en un comentario: se refactoriza o se abre un issue.

## Qué se adopta

- Borrar los comentarios que repiten el código, los obsoletos y los falsos frente al código actual.
- Convertir los comentarios de parche (`TODO`, `por ahora`, `temporal`, `hack`) en refactor o en issue enlazado.
- Regla de lint: un marcador temporal sin enlace a issue en la misma línea falla.
- Checklist de PR: cada comentario nuevo declara su clase y cada afirmación sobre tablas, rutas o flags se verifica contra el código.
- `/no-comments` sobre el diff antes de cerrar un PR que suma comentarios.
- Los comentarios usan términos neutrales (`comercio`, `tenant`); `kiosco` solo en reglas propias de ese rubro.

## Alternativa descartada

Dejar los comentarios de parche como documentación del estado actual. Se descarta porque los agentes copian el parche junto con su explicación y el comentario sobrevive al arreglo, como pasó con comentarios que decían que una tabla no existía.

## Consecuencias

Menos comentarios y más issues. La regla de lint entra después de abrir los issues del plan (`diseno/PLAN-COM-01-poda-comentarios.md`) para no romper el build con los marcadores actuales.

## Pendientes

- Ya aplicado en `src/modules/cash/` (TB-166): el grupo borrar, la consolidación de decisiones en ADR-0004 y ADR-0120, y el check de id con clase en `scripts/check-comment-ids.mjs`.
- Ejecutar la poda por área sobre los dos inventarios: `PLAN-COM-01` y el relevamiento de #273 para `src/modules` (salvo `cash/`), `src/offline/` y middleware.
- COM-S7 ya está activo en `scripts/check-comment-ids.mjs`: todo marcador en línea nueva exige `#<issue>` en la misma línea. Falta COM-S6: publicar por área el resto de la deuda (65 issues del plan + 20 agrupados del inventario #273, de un total de 88 junto con los 3 de `cash/` ya publicados).
