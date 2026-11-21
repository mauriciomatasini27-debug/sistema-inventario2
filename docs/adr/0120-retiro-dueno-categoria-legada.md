---
id: ADR-0120
tipo: adr
estado: aceptado
modulos: [caja]
depende_de: [ADR-0004]
reemplaza: []
reemplazado_por: ""
modifica: [ADR-0004]
modificado_por: []
resumen: |
  `tipo_retiro` explícito convive con la categoría legada `retiro_dueno`; si no viene el tipo, se deriva de la categoría.
  Ambas vías exigen Dueño. No se migra la categoría en este corte.
---
# ADR-0120 - Retiro de Dueño: tipo explícito y categoría legada

Estado: aceptado. Fecha: 2026-11-21. Fuentes: ADR-0004 (C15), poda de comentarios de `src/modules/cash/`.

## Decisión

`registrar_movimiento` acepta `tipo_retiro` explícito y, cuando no viene, deriva el tipo efectivo de `categoria_id === "retiro_dueno"`. Las dos vías exigen Dueño: un Empleado no puede registrar un retiro de Dueño por ninguna de las dos. `puede_registrar` usa la misma derivación para que la regla valga también en la sync offline.

## Por qué

La categoría `retiro_dueno` ya está en filas persistidas y en callers antiguos, y el camino offline todavía la produce. Eliminarla exigiría una migración durable y un corte coordinado. Mantener las dos vías con una sola regla de permiso evita ese cambio y deja una única fuente de verdad para el rol.

## Alternativa descartada

Migrar o dropar la categoría legada en una sola entrega. Se descarta porque es difícil de revertir y porque rompe los callers offline que aún la emiten.

## Qué cambia

ADR-0004 (C15) queda aclarado con este matiz; no se toca el esquema ni se agrega migración.
