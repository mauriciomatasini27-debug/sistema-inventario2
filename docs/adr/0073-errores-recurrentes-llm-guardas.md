---
id: ADR-0073
tipo: adr
estado: aceptado
modulos: [persistencia]
depende_de: [ADR-0064, ADR-0065, PRD-ARQ-01, PRD-DEP-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0073 - Guardas estructurales para errores recurrentes de agentes LLM

Estado: aceptado. Fecha: 2026-10-14. Fuentes: ADR-0065 y PRD `diseno/PRD-ARQ-01-arquitectura-amigable-agentes.md`, sesiones de OpenCode del proyecto (136 sesiones en `/workspace/si*`), commits `cdf849c`, `dec03df`, `dfdf79e` y `475c82c`, "Evidencia de aceptación" de ADR 0053 a 0066, `decisions.tsv`, sesión de zod 4 de PRD-DEP-01 (PR #26), skill `correct` de pstack.

## Decisión

Los errores que los agentes repiten y que ADR-0065 no cubre se cierran con un arch-test o un script, y recién después con una línea en `.opencode/pstack-opencode.md`, `.opencode/poteto-agent.prompt.md` o la skill `verify-inventario`. Los que ya cubren las fases de PRD-ARQ-01 (fecha UTC, CRLF, siembra con base viva, casts en tests) solo se referencian.

## Relevamiento (conteos reales)

| # | Error | Conteo | Guarda |
|---|---|---|---|
| E1 | Escribir en `/tmp` desde `opencode run` (rechazado sin aviso) | 4 sesiones; `cdf849c` | `.opencode/pstack-run.sh` crea `.pstack-tmp/` y exporta `TMPDIR`; `.gitignore`; `tests/arch/pstack-run.test.ts` |
| E2 | Evidencia parafraseada ("1 error preexistente" sin el error) | 11 ADR (0053 a 0063) | `npm run evidencia` (`scripts/evidencia.mjs`) imprime las líneas reales de `tsc`, vitest y build más el sha; `tests/evidencia.test.ts`; paso en `verify-inventario` |
| E3 | Comentario "no existe"/"no hay tabla" sobre algo que existe | 32 apariciones en 18 sesiones; 2 vivos (`payments/ordenes.ts:21`, `payments/beneficiarios.ts:4` decían que `purchases` no existe) | `tests/arch/sin-comentario-falso.test.ts` (cruza con `pgTable` de `src/db/schema*.ts` y rutas de `src/`); los 2 comentarios corregidos |
| E4 | Fecha UTC como día de Argentina; arreglo revertido | 59 apariciones en 15 sesiones; `dfdf79e` | ADR-0065 (`FechaAR`, AT1) |
| E5 | Renormalizar CRLF/LF de archivos enteros | 127 apariciones en 27 sesiones; sesión zod 4: 856 y 280 líneas de diff por 2 líneas reales | ADR-0065 (`.gitattributes`, AT3); regla en `pstack-opencode.md` |
| E6 | Tests que siembran por rutas con base viva | 13 archivos PG salteados sin `PG_TEST_URL`; `tests/tmp-s*-live.test.ts` en `decisions.tsv` | ADR-0065 (job con Postgres) |
| E7 | Errores tragados (`catch {}`, `.catch(() => null)`) | 9 en `src` hoy | `tests/arch/sin-errores-tragados.test.ts`: lista explícita de 9, uno nuevo falla con "loguear o relanzar" |
| E8 | Volver temprano y pasar `online: true` literal | `prices/adjustments` hasta `475c82c`; 24 apariciones en 15 sesiones; 0 hoy | `tests/arch/sin-online-literal.test.ts`: 0 literales `online: true/false` en `src/pages/api` y `src/lib/repos` |
| E9 | Afirmar que un archivo falta cuando existe | 98 "not found/no existe" en 53 sesiones; 4 lecturas de `x.js` con `x.ts` presente; 2 `Skill "poteto-mode" not found` | Reglas en `pstack-opencode.md` y `poteto-agent.prompt.md`: `.js` en imports es `.ts` en disco; `glob`/`rg` y citar salida antes de negar |
| E10 | Castear para callar tipos en tests | 458 `as never`; sesión zod 4 usó `as APIContext` | ADR-0065 (`ctx()`, AT2) |

## Alternativa descartada

Solo reglas en prompts: E3, E8 y E2 ya tenían reglas equivalentes en ADR-0064 y en skills y se repitieron. ESLint: mismo motivo que ADR-0065; los arch-tests en vitest alcanzan.

## Consecuencias

Un `catch {}` nuevo, un `online` literal o un comentario falso rompen `npm test` en CI. `TMPDIR` solo llega a las herramientas cuando `pstack-run.sh` arranca el servidor de OpenCode; con un servidor ya levantado sigue valiendo la regla escrita.

## Pendientes

- Bajar la lista de E7 (9) a 0 con logging o relanzando.
- E6 sigue en PRD-ARQ-01 fase 3.

## Evidencia de aceptación (2026-10-14)

- Sesión OpenCode `/poteto-mode /correct` + `/tdd` con `opencode/muse-spark-1.3-contributor-free`; cada arch-test se vio fallar con un caso plantado antes de pasar.
- `npm run evidencia` con Postgres local: `tsc: 0 errores`; `Test Files  122 passed (122)`; `Tests  888 passed (888)`; `[build] Complete!`.
- Tras fusionar `main` (fase 2 de ARQ, `121f9ce`): el trinquete AT5 bajó de 10 a 8 por los 2 comentarios corregidos; `tests/arch/baselines.json` ajustado a 8. `npm run check:arch` 20 passed; `npm run evidencia`: `Test Files  129 passed (129)`, `Tests  917 passed (917)`, `tsc: 0 errores`, build OK.
- Prueba a mano: agregar `} catch {}` y `// sin tabla \`payment_orders\`` en un archivo de `src/lib` hace fallar E7 y E3 (`Tests  2 failed | 4 passed (6)` en `tests/arch`); se borró el archivo.
