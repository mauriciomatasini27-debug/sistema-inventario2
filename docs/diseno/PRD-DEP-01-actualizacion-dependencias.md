---
id: PRD-DEP-01
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0065, ADR-0067, ADR-0072]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-DEP-01 - Actualización de dependencias

Fuente: PRs de Dependabot #6 a #19 (abiertos 2026-10-14), alertas de Dependabot del repositorio y `npm audit` sobre `main` (`c02e702`). Uso en este sistema: base técnica común a cualquier comercio, sin reglas por rubro. Restringido por ADR-0067 a ADR-0072 y ADR-0065 (CI obligatorio). Tipo mantenimiento y seguridad.

## Problema

Dependabot abrió 14 PRs sueltos, varios repetidos o encadenados entre sí, y ninguno se puede fusionar tal cual: 7 fallan en `npm ci` y 1 en tests. `npm audit` sobre `main` da 25 vulnerabilidades (3 críticas en el árbol, 4 alertas críticas en GitHub), todas en paquetes que solo se arreglan con un salto de versión mayor.

Fallos de CI medidos (job `ci`, corrida del 2026-10-14):

| PR | Paquete | Falla | Causa |
|---|---|---|---|
| #7, #9, #11, #12, #13, #14 | typescript, zod, vitest 4, sharp+astro, astro+node, drizzle | `npm ci` `EUSAGE`: `Missing: esbuild@0.28.2 from lock file` | Lockfile generado por Dependabot fuera de sincronía con `package.json` |
| #19 | astro 7 solo | `npm ci` `ERESOLVE`: `peer astro@"^4.2.0" from @astrojs/node@8.3.4` | Sube `astro` sin subir `@astrojs/node` |
| #17 | actions/checkout v7 | `npm test`: `expected [ 200, 422 ] to include 409` en `tests/pers2-compras-pagos.test.ts` | Ver DEP-S1 |
| #6, #8, #10, #15, #16, #18 | — | verde | — |

Alertas críticas abiertas y PR que las cierra:

| Alerta | Paquete | Corregido en | Lo trae |
|---|---|---|---|
| #39 GHSA-5gmw-xhrv-c9v3 (RCE por prototype pollution en opciones del worker) | tinypool | 2.1.1 | vitest 5 (#10, #15, #8) |
| #38 GHSA-85c8-ppgw-ccpr (RCE por prototype pollution en `run()`) | tinypool | 2.1.2 | vitest 5 (#10, #15, #8) |
| #19 GHSA-5xrq-8626-4rwp (lectura y ejecución de archivos con Vitest UI) | vitest | 3.2.6 | vitest 5 (#10, #15, #8, #11) |
| #34 GHSA-26w7-cxv4-gfx2 (RCE por optimización de imágenes AVIF) | astro | 7.2.8 | astro 7 + @astrojs/node 11 (#12, #13; #19 roto) |

## Épica DEP-E1. Dependencias al día sin romper CI

Requisito DEP-R1: cada salto mayor entra en su propio PR, en una pila, con CI verde y un ADR aceptado con evidencia. No se fusiona un PR de Dependabot con el lockfile roto: se regenera en una rama propia.

- Historia DEP-S1. GitHub Actions a la última mayor (`actions/checkout` v7, `actions/setup-node` v7, `actions/upload-artifact` v7, `github/codeql-action` v4) en un solo PR, más la política de agrupación de `dependabot.yml`. AC: Given el PR When corre CI Then `ci` y `analyze` en verde; Given el test de #17 falla otra vez Then se documenta si es intermitente o del cambio. ADR: 0067. Talla S. Depende de: nada.
- Historia DEP-S2. Vitest 2 a 5 (arrastra `@vitest/mocker` 5 y `tinypool` 2.1.2+). Cierra 3 alertas críticas. AC: Given `npm audit` Then sin `tinypool` ni `vitest` críticos; Given la suite Then los mismos 877 tests pasan. ADR: 0068. Talla S. Depende de: DEP-S1.
- Historia DEP-S3. Astro 4 a 7 con `@astrojs/node` 11 y `sharp` 0.35 (vía Astro). Cierra la alerta crítica restante y las altas de `astro`, `@astrojs/node`, `sharp`, `vite`, `braces` y `micromatch`. AC: Given `npm run build` Then completa; Given el servidor `dist/server/entry.mjs` When pido cada página estática y `/api/health` Then mismos códigos que en `main`. ADR: 0069. Talla M. Depende de: DEP-S2.
- Historia DEP-S4. Drizzle ORM 0.36 a 0.45. Cierra GHSA-gpj5-g38j-94v9 (alta, inyección SQL en identificadores). AC: Given `tests/pers2-*` contra Postgres Then pasan. ADR: 0070. Talla S. Depende de: DEP-S3.
- Historia DEP-S5. Zod 3 a 4. AC: Given `tsc --noEmit` Then 0 errores (hoy 9 con zod 4: `z.record` de un argumento y `unknown` en `email/send`); Given respuestas 400 de validación Then mismo cuerpo que hoy. ADR: 0071. Talla M. Depende de: DEP-S4.
- Historia DEP-S6. TypeScript 5.9 a 7 (compilador nativo). AC: Given `npm run typecheck` Then 0 errores; Given `build` y tests Then verdes. ADR: 0072. Talla S. Depende de: DEP-S5.

## Épica DEP-E2. Política para próximos PRs de Dependabot

Requisito DEP-R2: los PRs de Dependabot llegan agrupados y con un camino claro según el tipo de salto.

- Historia DEP-S7. `dependabot.yml` agrupa: un PR semanal con todos los patch y minor de npm (`npm-menores`), un PR por mayor con grupos que viajan juntos (`astro` + `@astrojs/*` + `sharp`; `vitest` + `@vitest/*`; `drizzle-orm` + `drizzle-kit`), y un PR con todas las Actions. Las alertas de seguridad abren su propio grupo. AC: Given la próxima corrida semanal Then como máximo un PR de menores de npm y uno de Actions. ADR: 0067. Talla S. Depende de: nada.

Reglas de la política (ADR-0067):

1. Patch y minor con CI verde: se fusionan sin ADR, en el PR agrupado.
2. Mayor: rama propia, ADR propuesto con cambios que rompen según el changelog oficial, riesgo y vuelta atrás; se acepta con evidencia de CI.
3. Lockfile fuera de sincronía o `ERESOLVE`: no se toca el PR de Dependabot; se regenera con `npm install` en una rama propia y se cierra el original con un comentario que apunta al reemplazo.
4. PRs repetidos (misma dependencia, distinta versión o subconjunto de un grupo): se cierra el más viejo apuntando al que lo reemplaza.

## Orden de ejecución (pila)

| Paso | Rama | Base | Cierra PRs | ADR |
|---|---|---|---|---|
| 0 | `docs/dependencias` | `main` | — | 0067-0072 propuestos |
| 1 | `deps/actions` | paso 0 | #6, #16, #17, #18 | 0067 |
| 2 | `deps/vitest-5` | paso 1 | #8, #10, #11, #15 | 0068 |
| 3 | `deps/astro-7` | paso 2 | #12, #13, #19 | 0069 |
| 4 | `deps/drizzle-045` | paso 3 | #14 | 0070 |
| 5 | `deps/zod-4` | paso 4 | #9 | 0071 |
| 6 | `deps/typescript-7` | paso 5 | #7 | 0072 |

Repetidos: #8 (`@vitest/mocker`+vitest 5.0.4), #11 (vitest 4.1.11) y #15 (vitest 5.0.3) quedan reemplazados por #10 (tinypool+vitest 5.0.4) y por el paso 2. #12 (sharp+node+astro) y #13 (astro+node) son el mismo salto; #19 (astro solo) no instala.

## Dependencias externas

Ninguna. No toca Supabase, secretos ni base de producción.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Regresión | Suite completa | `npx vitest run` con `PG_TEST_URL_A/B` | 877 tests verdes en cada paso |
| Regresión | Tipos | `npm run typecheck` | 0 errores |
| Regresión | Build y arranque | `npm run build` + `node dist/server/entry.mjs` | Páginas estáticas y `/api/health` con los mismos códigos que `main` |
| Seguridad | Auditoría | `npm audit` | Sin críticas después del paso 3 |
| Fallo | Validación zod | Body inválido en rutas con `parseBody` | 400 con el mismo formato que hoy |

Arch-tests: los de ADR-0065 siguen en cero o en su trinquete en cada paso.
