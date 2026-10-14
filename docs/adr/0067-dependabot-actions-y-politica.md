# ADR-0067 - GitHub Actions a la última mayor y política de PRs de Dependabot

Estado: propuesto. Fecha: 2026-10-14. Fuentes: PRD `diseno/PRD-DEP-01-actualizacion-dependencias.md`, PRs #6, #16, #17 y #18, ADR-0065.

## Decisión

Las cuatro Actions suben juntas en un PR propio: `actions/checkout` v4 a v7, `actions/setup-node` v4 a v7, `actions/upload-artifact` v4 a v7 y `github/codeql-action` v3 a v4. `.github/dependabot.yml` pasa a agrupar: todas las Actions en un PR; npm patch y minor en un PR semanal; cada mayor de npm en su propio PR, con los paquetes que viajan juntos en el mismo grupo.

## Qué cambia

- `.github/workflows/ci.yml` y `.github/workflows/codeql.yml`: solo los tags de `uses:`.
- `.github/dependabot.yml`: grupos `actions`, `npm-menores` (patch y minor), `astro` (`astro`, `@astrojs/*`, `sharp`), `vitest` (`vitest`, `@vitest/*`), `drizzle` (`drizzle-orm`, `drizzle-kit`).
- Regla de trabajo: patch y minor con CI verde se fusionan sin ADR; una mayor lleva ADR propuesto, rama propia y evidencia de CI para aceptarse; un PR de Dependabot con lockfile roto o `ERESOLVE` se reemplaza por una rama propia con `npm install` y se cierra con un comentario que apunta al reemplazo.

## Cambios que rompen (changelogs oficiales)

- `actions/checkout`, `setup-node` y `upload-artifact` nuevos corren sobre el runtime Node 24 de Actions; en runners de GitHub no cambia nada. `upload-artifact` v4+ no permite subir dos veces al mismo nombre de artefacto (ya era así en v4).
- `github/codeql-action` v4 corre sobre Node 24 y deja de publicar v3; `init` y `analyze` mantienen sus entradas.

## Riesgo y vuelta atrás

Riesgo bajo: no toca código ni dependencias npm. Vuelta atrás: revertir el commit; los tags v4 y v3 siguen publicados.

## Alternativa descartada

Fusionar los 4 PRs de Dependabot uno por uno: #17 toca `ci.yml` y `codeql.yml` a la vez y #6 también `ci.yml`, así que se pisan; y el patrón de 14 PRs sueltos por semana se repetiría sin grupos.

## Consecuencias

Menos PRs por semana y uno por mayor. Una mayor nunca entra sin ADR.
