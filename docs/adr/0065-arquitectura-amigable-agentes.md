# ADR-0065 - Errores recurrentes de agentes se eliminan por estructura y trinquetes de CI

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-ARQ-01-arquitectura-amigable-agentes.md`, ADR 0050 a 0064, skills `correct` y `architect` de pstack.

## Decisión

Cada error que un agente repitió más de una vez se ataca en este orden: primero se vuelve imposible o lo marca el compilador (tipos, módulos únicos, helpers de test), después un arch-test o paso de CI que solo deja bajar el conteo, y recién al final una instrucción en docs o skill. Un fallo de `tsc` o de `npm test` no se acepta como "preexistente" en un ADR.

## Qué se adopta

- `tests/helpers/ctx.ts`: los tests llaman handlers con un `APIContext` completo con `Request` real; se dejan de usar los casts `as never`.
- `src/lib/fecha-ar.ts`: tipo marcado `FechaAR` y `fechaAR()` en `America/Argentina/Buenos_Aires`; las firmas de dominio que esperan un día lo piden por tipo.
- `.gitattributes` con `eol=lf` y un commit de renormalización.
- CI obligatorio en `main` con `npm run typecheck`, `npm test` y un job con Postgres de servicio para `tests/pers2-*`.
- Arch-tests trinquete: fecha UTC como día, `as never` en llamadas a handlers, CRLF, referencias `store.` en `src/lib/repos`, comentarios "no existe" que nombran algo existente.
- Repositorios con puerto de almacenamiento; un mapa en memoria no puede guardar un dato que ya tiene tabla.

## Alternativas descartadas

Solo instrucciones en skills o en `AGENTS.md`: ya existían reglas equivalentes y los mismos errores se repitieron en 11 ADR seguidos. Arreglar cada síntoma donde aparece (por ejemplo que el gate offline tolere `request` indefinido, como en `dec03df`): oculta el contrato roto del test y el patrón sigue en 19 llamadas más. ESLint con reglas propias: suma una dependencia y una configuración; los arch-tests en vitest ya existen (`tests/pers2-arch.test.ts`) y alcanzan para estos patrones.

## Consecuencias

Un PR grande de fin de línea sin cambios de comportamiento y una migración de tests por archivo. CI se vuelve bloqueante: un PR con un error de tipos no entra. Los conteos de cada trinquete quedan en el arch-test y solo pueden bajar.

## Pendientes

Fases 1 a 5 de PRD-ARQ-01. Medir tests salteados por `PG_TEST_URL` cuando exista el job con Postgres.
