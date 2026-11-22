# 02: Lote genérico para toda entrada de stock

**Spec:** #398 · **ADR:** ADR-0123

**What to build:** Toda mercadería que entra al comercio queda representada por un Lote real. La carga inicial, la importación, los conteos y el entorno de ejemplo crean o actualizan un Lote genérico sin vencimiento, y el movimiento apunta a él. Desaparece el Lote virtual que hoy se inventa para vender stock semilla.

**Blocked by:** 01 (escritor único).

**Status:** ready-for-agent

- [ ] Cargar stock inicial crea un Lote genérico sin vencimiento y su movimiento apunta a él.
- [ ] Importar stock, confirmar conteos y sembrar el entorno de ejemplo crean o actualizan Lotes reales.
- [ ] Vender mercadería que entró sin Lote descuenta el Lote genérico persistido; no se genera ningún Lote virtual.
- [ ] El Historial, el Stock disponible y la suma de los Lotes siguen siendo iguales después de cada entrada.
