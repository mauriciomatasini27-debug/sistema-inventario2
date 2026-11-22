# 05: Devolución al Lote original

**Spec:** #398 · **ADR:** ADR-0123

**What to build:** Una devolución devuelve la mercadería a los Lotes de los que salió. El adaptador recupera los Lotes consumidos por la venta original a través de la clave de idempotencia y reingresa a ellos en la misma transacción que registra la devolución. El reparto es proporcional a lo consumido por SKU y el sobrante por redondeo va al Lote de vencimiento más cercano. El formulario y el núcleo de devolución no cambian.

**Blocked by:** 01 (escritor único), 02 (Lote genérico).

**Status:** cerrado
**Claim:** libre
**Avance:** docs/roadmap/avances/AUD-VTA-05-T05.md
**Rama:** mauri/aud-vta-05-integration (solo local; worktree `/tmp/opencode/aud-vta-05/integration`)

- [x] Una devolución total reingresa a los Lotes consumidos por la venta original.
- [x] Una devolución parcial reparte el reingreso proporcionalmente por SKU y el sobrante va al Lote de vencimiento más cercano.
- [x] El reingreso y el registro de la devolución ocurren en una sola transacción.
- [x] Devolver mercadería sin Lote identificado reingresa a un Lote genérico.
- [x] El formulario de devoluciones y el núcleo de devolución conservan su contrato.
