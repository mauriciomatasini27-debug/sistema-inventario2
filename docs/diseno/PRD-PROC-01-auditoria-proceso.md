---
id: PRD-PROC-01
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0076, ADR-0083]
reemplaza: []
reemplazado_por: ""
resumen: |
  check:arch corre tests/arch y tests/pers2-arch.test.ts, y después npm test los corre de nuevo. npm run
  evidencia vuelve a correr toda la suite aunque se acabe de correr, y no muestra qué tests cambiaron ni los
  baselines de los trinquetes. Cada ítem chico paga ADR + PRD.
---
# PRD-PROC-01 - Mejoras de proceso de la auditoría

Fuente: auditoría de proceso (2026-10-14). Uso en este sistema: tiempo de CI, evidencia de PRs y costo de documentación de cada ítem. Restringido por ADR-0083 y ADR-0076. Tipo proceso. No cambia código de `src`.

## Problema

`check:arch` corre `tests/arch` y `tests/pers2-arch.test.ts`, y después `npm test` los corre de nuevo. `npm run evidencia` vuelve a correr toda la suite aunque se acabe de correr, y no muestra qué tests cambiaron ni los baselines de los trinquetes. Cada ítem chico paga ADR + PRD.

## Épica PROC1-E1. Una corrida y docs a la medida

- Historia PROC1-S1. `npm test` excluye los archivos de `check:arch`. AC: Given `npm test` When corre Then no incluye `tests/arch/**` ni `tests/pers2-arch.test.ts`; `check:arch` sigue corriéndolos en su paso de CI. ADR: 0083. Talla S.
- Historia PROC1-S2. `evidencia` reutiliza un reporte JSON de vitest y agrega tests cambiados contra `origin/main` y baselines antes/después. AC: Given un reporte JSON When resumo Then cito los conteos del reporte sin correr la suite; Given baselines distintos Then se listan ambos valores. ADR: 0083. Talla S.
- Historia PROC1-S3. Avances chicos `P<n>-<m>` sin `adr`/`prd`, con `## Decisión` de 5 a 10 líneas; regla en `AGENTS.md` y `.opencode/pstack-opencode.md`. AC: Given `P1-6.md` sin adr/prd con Decisión de 6 líneas Then valida; Given Decisión de 3 u 11 líneas, o sin sección Then falla; Given un avance ADR sin adr Then falla como hoy. ADR: 0083. Talla S.

## Fuera de alcance

Editar `docs/ROADMAP.md`. Cambios en `src`. Paralelizar vitest.

## Dependencias externas

Ninguna.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Unidad | Avance chico válido | `P1-6.md` sin adr/prd, Decisión 6 líneas | Valida, render con `—` |
| Error | Decisión fuera de rango | 3 u 11 líneas, o sin sección | Error |
| Unidad | Evidencia desde JSON | Reporte vitest JSON | Conteos del reporte |
| Unidad | Baselines | main vs HEAD | Ambos valores |
| Arch | Sin duplicados | `vitest.config.ts` | Excluye arch |
