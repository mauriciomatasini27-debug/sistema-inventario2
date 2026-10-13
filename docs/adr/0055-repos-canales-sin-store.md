# ADR-0055 - Repositorios de canales en `src/lib/repos/whatsapp.ts` y `email.ts`: rutas `whatsapp/*` y `email/*` sin `store`

Estado: propuesto. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E6), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Un repositorio por canal en `src/lib/repos/`. Las lecturas de catálogo (precios, stock, proveedores) reusan los repositorios de dominio que ya existen cuando cubren el caso y si no se agregan al repositorio del canal. Los mapas sin tabla todavía (por ejemplo la lista del viernes si no tiene tabla) quedan en memoria dentro del repositorio, marcados con un comentario, hasta que tengan tabla.

## Qué cambia

`src/lib/repos/whatsapp.ts`, `src/lib/repos/email.ts`; rutas `whatsapp/*` y `email/*` sin `store`; `tests/pers2-canales.test.ts` con arch-test y tests contra Postgres local.

## Alternativa descartada

Un solo repositorio de canales: mezcla dos dominios que cambian por motivos distintos.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.
