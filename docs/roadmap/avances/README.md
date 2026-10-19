# Avances del roadmap

Cada PR de implementación agrega un archivo `docs/roadmap/avances/<número-ADR>.md`. Nunca se edita `docs/ROADMAP.md` a mano ni se commitea en la rama: `docs/ROADMAP.md`, `docs/ESTADO.md`, `docs/INDEX.md` y `docs/graph.json` los regenera `main` (ADR-0076). En una rama de trabajo `npm run roadmap` / `docs:estado` / `docs:index` no escriben (usá `--forzar` para previsualizar) y `npm run verify` falla en la guarda `docs:generados` si la rama trae un generado.

## Formato

Front-matter con `item`, `estado`, `adr`, `prd`, `fecha` (formato `AAAA-MM-DD`) y exactamente una línea de texto no vacía después del `---` de cierre.

## Ítems chicos

Ítems chicos (sin decisión de arquitectura nueva) llevan solo `docs/roadmap/avances/<id>.md` con id `P<n>-<m>` (p.ej. `P1-6`) y una sección `## Decisión` de 5–10 líneas, sin ADR ni PRD: `adr` y `prd` son opcionales y se muestran como `—` en la tabla. PRD + ADR completos solo para decisiones reales de arquitectura o producto.

Ejemplo chico:

```markdown
---
item: P1-6
estado: hecho
fecha: 2026-10-14
---
P1-6: descripción en una línea.

## Decisión
línea 1
línea 2
línea 3
línea 4
línea 5
línea 6
```

## Ejemplo

```markdown
---
item: ROAD1-S1
estado: hecho
adr: ADR-0076
prd: PRD-ROAD-01
fecha: 2026-10-14
---
ROAD1-S1: validación de avances con `npm run roadmap`.
```

## Comandos

- `npm run roadmap`: regenera la sección en `docs/ROADMAP.md` (en una rama de trabajo no escribe; eso lo hace `main`).
- `npm run roadmap -- --validate`: solo valida los avances, no escribe.
- `npm run roadmap -- --check`: sale 1 si la sección está desactualizada, no escribe.
