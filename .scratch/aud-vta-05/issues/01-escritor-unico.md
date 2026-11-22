# 01: Escritor único del Historial y las proyecciones

**Spec:** #398 · **ADR:** ADR-0124

**What to build:** Una venta al contado deja el Historial de stock, el Stock disponible y el resto del Lote elegido por FEFO como tres vistas de una sola escritura. El escritor de stock pasa a ser el único lugar que registra el movimiento y actualiza ambas proyecciones, y el camino de venta delega en él la escritura. Es el paso de expansión del seam: los escritores actuales siguen funcionando y serán migrados por los tickets siguientes.

**Blocked by:** None (can start immediately).

**Status:** cerrado
**Claim:** libre
**Avance:** docs/roadmap/avances/AUD-VTA-01.md
**Rama:** mauri/aud-vta-05-integration (solo local; worktree `/tmp/opencode/aud-vta-05/integration`)

- [x] Una venta al contado registra el movimiento en el Historial, actualiza el Stock disponible y descuenta el resto del Lote elegido por FEFO en una sola transacción.
- [x] Si falla la actualización del Lote, no quedan ni el movimiento ni el cambio de Stock disponible.
- [x] El escritor acepta una condición de resto suficiente y bloquea la fila cuando la operación lo exige.
- [x] Dos ventas concurrentes sobre el mismo SKU no dejan resto negativo ni Stock disponible distinto de la suma de Lotes.
- [x] Las rutas existentes de venta y de fiado responden igual y sus pruebas siguen pasando.
