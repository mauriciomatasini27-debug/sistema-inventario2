# 04: Un mismo escritor en memoria y con base

**Spec:** #398 · **ADR:** ADR-0123

**What to build:** El escritor único rige también en el modo memoria: la venta descuenta el Lote además del Stock disponible y del Historial. Si hay base configurada y falla, la operación falla en lugar de espejarse en memoria; si no hay base configurada, la memoria es el modo legítimo y la escritura es atómica. Desaparece la divergencia entre modos.

**Blocked by:** 01 (escritor único).

**Status:** ready-for-agent

- [ ] En modo memoria la venta descuenta el Lote además del Stock disponible y del Historial.
- [ ] Si hay base configurada y falla, la operación responde error y no queda rastro en memoria.
- [ ] Si no hay base configurada, la escritura en memoria es atómica.
- [ ] No existen dos implementaciones del escritor: memoria y base pasan por la misma.
