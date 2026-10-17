---
item: T-UI-03
estado: hecho
adr: ADR-0037
prd: PRD-UX-01
fecha: 2026-10-17
---
T-UI-03: catálogo de `/panel/precios` y `/panel/stock` virtualizado con `TableVirtuoso` sobre la ventana (sin scroll anidado) y precios con `NumberFlow` (react-virtuoso 4.18.19 y @number-flow/react 0.6.2 fijadas, isla de ~26 KB gzip solo en esas dos páginas, `respectMotionPreference`) más `.tnum` en el mismo formato que `formatearCentavos`, store compartido entre el script de la página y la isla, harness dev-only `?data=mil` de 1000 filas con spec Playwright a 360px y reduced motion, y de paso `select`/`input` del panel ya no desbordan a 360px con nombres largos.
