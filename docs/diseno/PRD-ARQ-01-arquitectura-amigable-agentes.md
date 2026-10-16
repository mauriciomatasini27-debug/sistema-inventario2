---
id: PRD-ARQ-01
tipo: prd
estado: propuesto
modulos: [persistencia]
depende_de: [ADR-0016, ADR-0062, ADR-0064, ADR-0065, PRD-COM-01]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-ARQ-01 - Arquitectura amigable para agentes

Fuente: skills `correct` y `architect` de pstack en `/poteto-mode` (OpenCode, `.opencode/pstack-opencode.md`), sobre el historial de `main` (49 commits hasta `0cec0f0`), los mensajes de commit, los "Pendientes" y la "Evidencia" de los ADR 0050 a 0063 y los arreglos a mano de la rama `chore/github-setup` (`dec03df`, `dfdf79e`). Uso en este sistema: todo el código de cualquier comercio, sin reglas por rubro. Restringido por ADR-0065. Tipo arquitectura según ADR-0016.

## Problema

Los agentes repiten los mismos errores en cada grupo de trabajo y los ADR los arrastran como "preexistentes". Once ADR seguidos (0053 a 0063) aceptaron con "`tsc --noEmit`: 1 error preexistente" y "2 failed (caja-c11 preexistentes)". Cuando un error se arrastra, el siguiente agente lo copia o lo toma como normal. El arreglo tiene que estar en la estructura (tipos, módulos, helpers) y en CI, no en la memoria de quien revisa.

## Relevamiento (conteos reales)

Prioridad (frecuencia × impacto): 1, 2, 5, 8, 4, 3, 9, 7, 6. La columna # es un identificador. Conteos al 2026-10-13 sobre `main`; cada prototipo se hizo en la rama descartable `wt/arq-proto` y se borró.

| # | Patrón | Conteo | Commits de ejemplo | Impacto | Arreglo (orden poteto) | Prototipo | Talla |
|---|---|---|---|---|---|---|---|
| 1 | Contexto de handler falso en tests (`{...} as never`) | 458 casts en tests; 19 llamadas sin `request` en 9 archivos; 2 tests rotos arrastrados en 11 ADR | aceptados con el fallo en `ff349d8`, `8a10729` … `f90aae3`; parche de síntoma en `dec03df` (gate tolera `request` indefinido) | Alto: el gate offline recibe `undefined`; los tests esconden bugs de contrato | 1) helper tipado `ctx(url, init)` que siempre arma `Request` y devuelve `APIContext`; 2) arch-test: 0 `as never` nuevos en llamadas a handlers (trinquete); 3) skill `verify-inventario` lo nombra | `caja-c11` pasa (2/2 que fallaban) sin tocar `offline-gate.ts` | M |
| 2 | Fecha UTC usada como día local de Buenos Aires | 14 `toISOString().slice(0,10)` en `src` + 5 en tests; 2 `fechaBA()` duplicados (`mora-diaria.ts`, `whatsapp-aviso-matutino.ts`) y unos 12 helpers de fecha más con nombres distintos (`fechaHoy`, `fecha_jornada_ar`, `dia_iso_en_zona`, `iso_mas_dias`, …); 1 test que falla todas las noches después de las 21:00 ART | aceptado roto en `4328fb0`, `6d02250`, `f093c0f`, `dc0152e`, `c0e1b65`, `05e2f82`, `f90aae3`; arreglo a mano `dfdf79e` | Alto: vencimientos, mora y resúmenes cambian de día 3 h antes | 1) módulo único `src/lib/fecha-ar.ts` con tipo marcado `FechaAR` y `fechaAR()`; las firmas de dominio piden `FechaAR`; 2) arch-test que prohíbe `toISOString().slice(0,10)` en `src`; 3) nada en docs | Con `hoyIso: FechaAR` en `ejecutar_vencimientos_servicios` el compilador marca 5 sitios, entre ellos el test con el bug; el arch-test lista los 14; `vencimientos` pasa 4/4 con `fechaBA` | S |
| 3 | Finales de línea mezclados (CRLF) | 28 de 49 commits agregan líneas CRLF; 116 archivos versionados con CRLF en `src`, `tests`, `docs`, `scripts`; sin `.gitattributes` | `ff349d8` (71 líneas), `aeb7201` (167), `c1b4704` (166), `f90aae3` (159) | Medio: diffs ruidosos, reemplazos de texto de los agentes que fallan, conflictos | 1) `.gitattributes` `* text=auto eol=lf` + un commit de renormalización; 2) CI falla si `git ls-files --eol` muestra `crlf`; 3) nada | `git add --renormalize` toca 191 archivos (80 en `src`/`tests`), diff solo de fin de línea | S |
| 4 | Error de tipos arrastrado (`exactOptionalPropertyTypes`) y CI sin `tsc` | 1 error vivo (`tests/nivel5-admin.test.ts:17`), citado como "preexistente" en 11 ADR (0053 a 0063) | arreglo a mano `dfdf79e` | Medio: normaliza un `tsc` en rojo; el próximo error pasa inadvertido | 1) mismo helper `ctx()` de #1 (arma `RequestInit` sin `body: undefined`); 2) CI con `npm run typecheck` y `npm test` obligatorios en `main` (trinquete: 0 errores, 0 fallos); 3) plantilla de ADR sin la frase "preexistente" | Con el cambio `tsc --noEmit` da 0 errores | S |
| 5 | Estado en memoria que esquiva la base | 428 referencias `store.` (376 líneas) en `src/lib/repos` sobre 65 mapas; ≥10 mapas con tabla homónima (`payment_orders`, `purchase_orders`, `outbox`, `suppliers`, …) más `locations`, `product_photos`, `stock_counts` (ADR-0062); 8 ADR con "queda en memoria" | `aeb7201`, `c1b4704`, `4328fb0`, `dc0152e`, `c0e1b65`, `05e2f82`, `f90aae3` | Alto en multi: datos que se pierden al reiniciar | 1) cada repo recibe un puerto `Almacen<T>` con implementación Postgres y otra en memoria solo para tests/dev; una tabla existente prohíbe el mapa en memoria; 2) arch-test trinquete: refs `store.` en repos ≤ 428 y bajando, y 0 mapas con tabla homónima nuevos; 3) checklist del PRD de cada grupo | Script de cruce mapas↔`pgTable` encuentra 10 de 65 mapas con tabla | L |
| 6 | Comentarios falsos u obsoletos (tablas o módulos "que no existen") | 2 vivos (`payments/beneficiarios.ts:4`, `payments/ordenes.ts:21` dicen que `purchases` no existe; `src/modules/purchases/` existe); 1 borrado tarde (`ff349d8`: "no hay tabla") | `53cbfcc`, `ff349d8` | Medio: el agente copia la afirmación como verdad | 1) borrar el comentario cuando la estructura lo vuelve innecesario (el puerto de #5 hace explícito qué es memoria); 2) arch-test: comentarios "no existe"/"sin tabla" que nombran un path o tabla existente fallan; 3) PRD-COM-01/ADR-0064 | `rg` encuentra exactamente los 2 | S |
| 7 | Tests que siembran por flujos que dependen de base viva | 13 archivos de tests PG que se saltean sin `PG_TEST_URL`; 28 tests salteados en `f90aae3` | serie `pers2-*` (`2b926a1` en adelante) | Medio: la suite "verde" no ejerce Postgres | 1) fábricas de semilla por repositorio (`sembrar.<dominio>()`) que escriben por el mismo puerto, sin pasar por rutas; 2) job de CI con Postgres de servicio que corre `pers2-*` sin saltear; 3) nada | No prototipado en este corte (necesita servicio Postgres en CI); se mide al activar el job | M |
| 8 | Doble camino "base o memoria" copiado en cada función | 151 `esModoMulti` en 26 archivos; un `try` con caída a memoria por función de repo | `2b926a1` lo introduce; `ff349d8`, `8a10729`, `7d66902`, `aeb7201`, `c1b4704`, `4328fb0`, `6d02250`, `f093c0f`, `dc0152e`, `c0e1b65`, `05e2f82`, `f90aae3` lo copian | Alto: en single la falla de base cae a memoria sin aviso; cada rama nueva es otro lugar para equivocarse | 1) el mismo puerto `Almacen<T>` de #5: el modo se elige una vez al armar el repo, no en cada función; 2) arch-test trinquete de `esModoMulti` fuera de `src/lib/repos/_almacen.ts`; 3) nada | Conteo verificado por la sesión `correct` y a mano; prototipo de estructura cubierto por #5 | L |
| 9 | `as never` en `src` para callar a Drizzle en columnas JSON | 20 en 11 archivos (`payload`, `detalle`, `porMedio`, `conteos`) | `aeb7201`, `c1b4704`, `4328fb0`, `7d66902` | Medio: el tipo del JSON no existe y nadie valida lo que se guarda | 1) `jsonb(...).$type<T>()` en el esquema y tipo de dominio en la firma; 2) arch-test: 0 `as never`/`as any` nuevos en `src`; 3) nada | `auth_events.detalle` con `$type<Record<string, unknown> \| null>()`: se borra el cast de `control-db.ts:269` y `tsc` no suma errores | S |

## Épica ARQ-E1. Eliminar por estructura

Requisito ARQ-R1: el error no se puede escribir, o el compilador lo marca.

- Historia ARQ-S1. Helper `tests/helpers/ctx.ts` que arma `APIContext` completo con `Request` real; migrar los 458 casts por archivo. AC: Given un test llama un handler When usa `ctx()` Then `request` nunca es `undefined` y no hay `as never`. ADR: 0065. Talla M. Depende de: nada.
- Historia ARQ-S2. Módulo `src/lib/fecha-ar.ts` con `FechaAR` marcado; borrar los dos `fechaBA()` y migrar los 14 sitios. AC: Given una firma de dominio pide `FechaAR` When paso `toISOString().slice(0,10)` Then `tsc` falla. ADR: 0065. Talla S. Depende de: nada.
- Historia ARQ-S3. `.gitattributes` con `eol=lf` y commit de renormalización aislado. AC: Given clono el repo When corro `git ls-files --eol` Then no hay `crlf` en el índice. ADR: 0065. Talla S. Depende de: nada.
- Historia ARQ-S4. Puerto `Almacen<T>` por repositorio con implementación Postgres y en memoria elegida una vez al armar el repo (borra las 151 ramas `esModoMulti`); los mapas con tabla pasan a la base. AC: Given existe la tabla When el repo escribe Then no hay mapa en memoria para ese dato. ADR: 0065. Talla L. Depende de: ARQ-S5.

- Historia ARQ-S9. Columnas JSON tipadas con `$type<T>()` y borrar los 20 `as never` de `src`. AC: Given guardo un JSON When el tipo no coincide Then `tsc` falla. ADR: 0065. Talla S. Depende de: nada.

## Épica ARQ-E2. Trinquetes en CI

Requisito ARQ-R2: lo que ya se arregló no vuelve.

- Historia ARQ-S5. CI en `main` con `npm run typecheck` y `npm test` obligatorios (se apoya en el workflow de `chore/github-setup`). AC: Given un PR con 1 error de tipos When corre CI Then el PR queda bloqueado. ADR: 0065. Talla S. Depende de: ARQ-S1, ARQ-S2.
- Historia ARQ-S6. Arch-tests: sin `toISOString().slice(0,10)`, sin `as never` nuevos en llamadas a handlers, sin CRLF, refs `store.` en repos que solo bajan, comentarios "no existe" que nombran algo existente. AC: Given agrego cualquiera de esos patrones When corro `npm test` Then falla con archivo y línea. ADR: 0065. Talla S. Depende de: ARQ-S1 a ARQ-S3.
- Historia ARQ-S7. Job de CI con Postgres de servicio para `tests/pers2-*` sin saltear. AC: Given CI corre When termina Then 0 tests salteados por `PG_TEST_URL`. ADR: 0065. Talla M. Depende de: ARQ-S5.

## Épica ARQ-E3. Instrucciones (último recurso)

- Historia ARQ-S8. La plantilla de "Evidencia de aceptación" de los ADR no admite "preexistente": un fallo se arregla o tiene issue enlazado. AC: Given un ADR dice "preexistente" sin issue When se revisa Then no se acepta. ADR: 0065. Talla S. Depende de: ARQ-S5.

## Fases

1. Fase 1 (S, un PR cada una, sin cambios de comportamiento): ARQ-S3 CRLF, ARQ-S1 helper `ctx()` en los 9 archivos sin `request` primero, ARQ-S2 `FechaAR` (absorbe los helpers de fecha duplicados), ARQ-S9 JSON tipado. Deja `tsc` en 0 y `npm test` sin fallos.
2. Fase 2 (S): ARQ-S5 CI obligatorio y ARQ-S6 arch-tests como trinquetes.
3. Fase 3 (M): resto de la migración de ARQ-S1 y ARQ-S7 Postgres en CI.
4. Fase 4 (L, por dominio como PERS-S4): ARQ-S4 puerto `Almacen<T>`, empezando por los 10 mapas con tabla.
5. Fase 5 (S): ARQ-S8 y ajuste de la skill `verify-inventario`.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Feliz | Handler con `ctx()` | `GET(ctx("/api/cash/export"))` | 200 con CSV |
| Fallo | Fecha UTC | `toISOString().slice(0,10)` pasado a `FechaAR` | `tsc` falla |
| Fallo | CRLF | archivo nuevo con `\r\n` | CI falla |
| Regresión | 21:00 a 23:59 ART | `tests/vencimientos.test.ts` | pasa a cualquier hora |
| Regresión | Mapa con tabla | `store.paymentOrders` nuevo en un repo | arch-test falla |

Arch-tests: AT1 sin fecha UTC como día, AT2 sin `as never` nuevo en handlers, AT3 sin CRLF, AT4 trinquete de `store.` en repos, AT5 comentarios "no existe" verificados.
