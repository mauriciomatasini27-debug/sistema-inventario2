---
item: DS-S15
estado: hecho
adr: ADR-0009
prd: PRD-DS-02
fecha: 2026-10-17
---
DS-S15: la tabla virtualizada de `/panel/stock` y `/panel/precios` (`TablaCatalogo.tsx`) pasa a `.875rem` con celdas `.45rem` centradas, header sticky en `--tema-fondo` con peso 600 y borde de 2px (deep 15%), filas transparentes con hover naranja 6% y fila seleccionada deep 10% sin transiciones, y SKU/cantidades en peso 500 con `--tema-enfasis` (star-glow en claro y ámbar en oscuro, porque deep como texto no pasa AA); decisión: "seleccionada" es la fila del SKU elegido en el formulario de la página (select de precios, SKU de lote o ingreso en stock) vía `marcarSkuSeleccionado` en `catalogo-panel.ts`, con `data-seleccionada` y `aria-current` (sin clic nuevo en filas ni `aria-selected`, porque la tabla no es grid); roles nuevos en `tema.css`, `--color-naranja`, 7 pares en `check:contrast`, trinquete `tests/ds-s15-listas.test.ts` y spec `tests/e2e/ds-s15-listas.spec.ts`.
