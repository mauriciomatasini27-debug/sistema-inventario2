---
id: ADR-0118
tipo: adr
estado: aceptado
modulos: [integraciones]
depende_de: [ADR-0065, ADR-0102, ADR-0103]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Un solo módulo posee el flujo de ingesta Gmail (sincronizarGmail en gmail-sync.ts); seam PersistenciaGmail con adapters DB y memoria; repos dueños de su persistencia; procesar_email (código muerto) eliminado.
---

# ADR-0118 - Módulo de ingesta Gmail

Estado: aceptado. Fecha: 2026-11-19. Mergeado en main (PR #256, 2026-11-19). Fuentes: improve-codebase-architecture candidate 2, grilling (spec #252).

## Decisión

1. `src/modules/integraciones/gmail-sync.ts` es el módulo profundo; no se crean archivos ni carpetas nuevas. `ingesta_gmail.ts` queda como núcleo de dominio interno del módulo (helpers puros, sin cambios de contrato).
2. El seam es `PersistenciaGmail` (antes `PersistenciaSyncGmail`), con la misma forma de cuatro métodos: `existeLog`, `registrarLog`, `guardarBorrador`, `avanzarCursor`. El contrato vive en el módulo; los adapters lo implementan.
3. Los adapters son: `crearPersistenciaGmailDb(tenantId)` (dentro de `src/lib/repos/gmail-ingesta.ts`, sin archivos nuevos), que concentra el mapping module↔repos; los repos conservan toda su persistencia. Y `crearPersistenciaGmailMemoria()` (exportado por el módulo) para tests, sin DB ni `process.env`.
4. `jobs/gmail.ts` consume `crearPersistenciaGmailDb`; su adapter escrito a mano (`persistenciaDe`) se borra.
5. `procesar_email()` se elimina: era código muerto en producción (ningún caller lo ejecutaba) y sus tests cubrían un path que no corre. El pipeline real siempre crea un borrador; los escenarios relevantes se re-cubren contra el pipeline real en el seam test.
6. Fuera de scope: renovación/detención del watch (`renovarWatchGmail`, `detenerWatchGmail`), lifecycle de borradores del panel (`gmail-borradores.ts`), cola de jobs (`gmail-cola.ts`) + dedupe por messageId (GGL-P0-HUECOS), webhook y routes.
7. No hay migración de DB, ni cambio de schema, ni cambio de comportamiento en los caminos de producción.

## Por qué

- Entender el ciclo de vida de un mensaje Gmail requería saltar entre seis archivos; el mapping module↔repos vivía duplicado a mano en el job (y de forma distinta en los tests).
- El seam ya existía pero no tenía un dueño: ningún lugar declaraba qué es persistir en Gmail más allá de cuatro métodos.
- Los tipos se filtraban a través del seam (el job conocía `$inferSelect` y valores intermedios de los repos), haciendo frágil cualquier cambio de persistencia.
- El código muerto con tests verdes daba falsa confianza sobre el comportamiento real de ingesta.
- Concentricar el flujo en un módulo con un seam único permite tests end-to-end del pipeline vía adapter de memoria (mismo patrón validado en codigo-producto y tenant, ADR-0065).

## Qué cambia

- `gmail-sync.ts`: seam `PersistenciaGmail` (rename) + `crearPersistenciaGmailMemoria()` exportado.
- Nuevo `crearPersistenciaGmailDb(tenantId)` en `gmail-ingesta.ts` (sin archivos nuevos): factory DB (solo mapping; los repos dueños de su persistencia). El `connectionId` viaja dentro del borrador (`BorradorSync`), por eso la factory no lo recibe aparte.
- `jobs/gmail.ts`: consume la factory; pierde ~40 líneas de mapping a mano.
- `ingesta_gmail.ts`: eliminado `procesar_email()`; helpers intactos.
- `tests/gmail-sync.test.ts`: reescrito contra el adapter de memoria; "no reprocesa un message-id duplicado" cubre el reintento a dos corridas.
- `GLOSSARY.md` gana "Ingesta Gmail". ADR-0118 (este).

## Pendientes

- Watch/cola/dedupe y el lifecycle de borradores del panel quedan para PRs propios (GGL-P0-HUECOS sigue abierto).
