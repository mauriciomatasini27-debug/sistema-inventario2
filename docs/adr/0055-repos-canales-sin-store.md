---
id: ADR-0055
tipo: adr
estado: aceptado
modulos: [bot, email, persistencia]
depende_de: [ADR-0024, ADR-0052, ADR-0053, PRD-PERS-02]
reemplaza: []
reemplazado_por: ""
resumen: |
  Un repositorio por canal en src/lib/repos/. Las lecturas de catálogo (precios, stock, proveedores) reusan los
  repositorios de dominio que ya existen cuando cubren el caso y si no se agregan al repositorio del canal.
---
# ADR-0055 - Repositorios de canales en `src/lib/repos/whatsapp.ts` y `email.ts`: rutas `whatsapp/*` y `email/*` sin `store`

Estado: aceptado. Fecha: 2026-10-13. Fuentes: PRD `diseno/PRD-PERS-02-cutover-multi-tenant.md` (PERS2-E6), ADR-0053, ADR-0052, ADR-0024 (PERS-S4, PERS-S5).

## Decisión

Un repositorio por canal en `src/lib/repos/`. Las lecturas de catálogo (precios, stock, proveedores) reusan los repositorios de dominio que ya existen cuando cubren el caso y si no se agregan al repositorio del canal. Los mapas sin tabla todavía (por ejemplo la lista del viernes si no tiene tabla) quedan en memoria dentro del repositorio, marcados con un comentario, hasta que tengan tabla.

## Qué cambia

`src/lib/repos/whatsapp.ts`, `src/lib/repos/email.ts`; rutas `whatsapp/*` y `email/*` sin `store`; `tests/pers2-canales.test.ts` con arch-test y tests contra Postgres local.

## Alternativa descartada

Un solo repositorio de canales: mezcla dos dominios que cambian por motivos distintos.

## Pendientes

Grupos siguientes de PERS-S4 y PERS-S5.

## Evidencia de aceptación (2026-10-13)

- Commits: aeb7201.
- `npm test`: 773 passed, 2 failed (caja-c11 preexistentes), 9 skipped.
- Tests PG con Postgres local (`PG_TEST_URL_A/B`): 7/7 en `tests/pers2-canales.test.ts`. El email encolado en A queda en `email_outbox` de A y no en B; la sesión de WhatsApp de A no se ve en B.
- La lista del viernes (`waFriday`) no tiene tabla y queda en memoria dentro de `src/lib/repos/whatsapp.ts`.
- `tsc --noEmit`: 1 error preexistente. `npm run build`: OK.
- Rutas en `src/pages/api` que importan `store`: 58 → 54.
