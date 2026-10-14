# Avances del roadmap

Cada PR de implementación agrega un archivo `docs/roadmap/avances/<número-ADR>.md`. Nunca se edita `docs/ROADMAP.md` a mano: el workflow lo regenera en `main` con `npm run roadmap`.

## Formato

Front-matter con `item`, `estado`, `adr`, `prd`, `fecha` (formato `AAAA-MM-DD`) y exactamente una línea de texto no vacía después del `---` de cierre.

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

- `npm run roadmap`: regenera la sección en `docs/ROADMAP.md`.
- `npm run roadmap -- --validate`: solo valida los avances, no escribe.
- `npm run roadmap -- --check`: sale 1 si la sección está desactualizada, no escribe.
