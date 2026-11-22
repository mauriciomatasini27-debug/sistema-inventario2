# 03: Sobreventa marcada y excluida del Stock disponible

**Spec:** #398 · **ADR:** ADR-0123

**What to build:** La sobreventa deja de ser una excepción invisible: su movimiento lleva una marca explícita, no descuenta stock y se reporta como excepción esperada. Sigue contabilizándose en caja y en fiado y sigue apareciendo en el informe de rotación, porque la marca no cambia el tipo de movimiento.

**Blocked by:** 01 (escritor único).

**Status:** cerrado
**Claim:** libre
**Avance:** docs/roadmap/avances/AUD-VTA-03.md
**Rama:** mauri/aud-vta-05-integration (solo local; worktree `/tmp/opencode/aud-vta-05/integration`)

- [x] La sobreventa offline queda marcada explícitamente en su movimiento del Historial.
- [x] La sobreventa no descuenta Stock disponible ni resto de Lote.
- [x] La sobreventa sigue sumando a caja y al fiado y aparece en el informe de rotación.
- [x] Las pruebas que hoy asumen el comportamiento sin marca se actualizan y fallan si se quita la marca.
