---
id: GUIA-CAJA-01
tipo: spec
estado: aceptado
modulos: [caja]
depende_de: [ADR-0004]
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Detalles de runtime del módulo caja que el código no expresa y que no son decisiones de arquitectura.
---
# Gotchas de runtime del módulo caja

Guía de referencia. Fecha: 2026-11-21. Fuente: poda de comentarios de `src/modules/cash/` (ADR-0064).

Son comportamientos de la plataforma o del runtime. No son decisiones: por eso no van en un ADR. Tampoco van en `GLOSSARY.md`, que solo define términos del dominio.

- **`Math.abs` no acepta `bigint`.** El valor absoluto de un delta de centavos se calcula con un ternario (`v < 0n ? -v : v`). Ver `absBigint` en `src/modules/cash/turnos.ts`.
- **`Response.json` no serializa `bigint`.** Las filas de movimientos salen con `montoCentavos` como string de centavos. Ver `filaMovimientoJson` en `src/modules/cash/registro_movimiento.ts`.
- **`$500 = 50000n` centavos.** La tolerancia de turnos se guarda como `bigint` exacto; no se usan floats para dinero (ADR-0004).
