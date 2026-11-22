# 04: Un mismo escritor en memoria y con base

**Spec:** #398 · **ADR:** ADR-0124

**What to build:** El escritor único rige también en el modo memoria: la venta descuenta el Lote además del Stock disponible y del Historial. Si hay base configurada y falla, la operación falla en lugar de espejarse en memoria; si no hay base configurada, la memoria es el modo legítimo y la escritura es atómica. Desaparece la divergencia entre modos.

**Blocked by:** 01 (escritor único).

**Status:** cerrado
**Claim:** libre
**Avance:** docs/roadmap/avances/AUD-VTA-04.md
**Rama:** mauri/aud-vta-05-integration (solo local; worktree `/tmp/opencode/aud-vta-05/integration`)

- [x] En modo memoria la venta descuenta el Lote además del Stock disponible y del Historial.
- [x] Si hay base configurada y falla, la operación responde error y no queda rastro en memoria.
- [x] Si no hay base configurada, la escritura en memoria es atómica.
- [x] No existen dos implementaciones del escritor: memoria y base pasan por la misma.
