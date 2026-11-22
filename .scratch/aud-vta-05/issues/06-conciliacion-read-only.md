# 06: Conciliación read-only de los tres números

**Spec:** #398 · **ADR:** ADR-0123

**What to build:** Un comando que permite detectar desvíos entre Lotes y stock sin leer código ni modificar datos. Compara, por comercio y SKU, el Stock disponible, la suma de los Lotes y la suma del Historial, excluye la sobreventa marcada y avisa con código de salida cuando algo no cuadra. El desvío histórico se reporta, nunca se repara.

**Blocked by:** 03 (sobreventa marcada), 05 (devolución al Lote original).

**Status:** ready-for-agent

- [ ] El comando reporta por comercio y SKU el Stock disponible, la suma de Lotes y la suma del Historial.
- [ ] La salida es estructurada y el código de salida es 1 con desvío y 0 sin desvío.
- [ ] La sobreventa marcada se excluye del cálculo.
- [ ] El comando no escribe en la base: se puede ejecutar en producción sin efectos.
- [ ] El desvío histórico se reporta sin repararlo.
