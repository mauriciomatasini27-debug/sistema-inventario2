# 07: Modelo formal de Lotes y stock

**Spec:** #398 · **ADR:** ADR-0124

**What to build:** Una verificación formal separada de la del Historial de sincronización de venta. El modelo comprueba la invariante de los tres números, la propagación de fallo de base, la devolución al Lote original y que toda baja de Lote tenga su movimiento. Incluye una configuración de quiebre que demuestra que el modelo detecta el bug que esta decisión corrige.

**Blocked by:** 01 (escritor único), 03 (sobreventa marcada), 04 (memoria y fallos), 05 (devolución al Lote original).

**Status:** cerrado
**Claim:** libre
**Avance:** docs/roadmap/avances/AUD-VTA-05-T07.md
**Rama:** mauri/aud-vta-05-integration (solo local; worktree `/tmp/opencode/aud-vta-05/integration`)

- [x] El modelo cubre la invariante de los tres números, la propagación de fallo de base, la devolución al Lote original y toda baja con su movimiento.
- [x] Las cuatro leyes se cumplen en la configuración principal.
- [x] Una configuración de quiebre reproduce el espejo tras fallo de base y la herramienta encuentra la violación esperada.
- [x] El modelo está documentado y corre con el comando de verificación formal, sin entrar en la verificación principal.
