---
id: PRD-CAT-01
tipo: prd
estado: hecho
modulos: [inventario]
depende_de: [ADR-0012]
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: docs/03-inventario-precios/inventario-parte-.md (F1, F2, F9, F12, F13), ADR-0012. Gap: sin products
  CRUD, sin /api/lots|/api/locations; inventorycounts sin sector; sin locations/promotions tablas.
---
# PRD-CAT-01 - Catálogo, lotes FEFO, ubicaciones y conteo

Fuente: `docs/03-inventario-precios/inventario-parte-*.md` (F1, F2, F9, F12, F13), ADR-0012. Gap: sin `products CRUD`, sin `/api/lots|/api/locations`; `inventory_counts` sin sector; sin `locations/promotions` tablas.

## Épica CAT-E1. Productos + códigos (F1, F2)

- CAT-S1. `POST/GET/PATCH /api/products` + búsqueda (difusa + código). AC: Given alta con código duplicado/comercio When guardo Then 409; foto 800px/200KB + placeholder iniciales. Tablas: `products`, `product_codes`, `product_photos`. Depende de: nada.
- CAT-S2. Escaneo HID>cámara>texto>foto + alta corta precargada. AC: Given código inexistente When escaneo Then alta corta con código precargado; empleado sin permiso → `pendiente revisión`. Depende de: CAT-S1.

## Épica CAT-E2. Lotes FEFO (F12)

- CAT-S3. `POST /api/lots` + `POST /api/stock/ingreso` + FEFO auto. AC: Given `controla_vencimiento` on When ingreso sin fecha Then rechaza; stock=Σlotes=Σmovs; venta descuenta FEFO multi-mov. Tablas: `stock_lots`, `stock_movements(lot_id)`. Depende de: CAT-S1.
- CAT-S4. Alertas 15/7/3d + baja `vencido` merma. AC: Given lote a 3d When corre job Then alerta + expone a bot promos. Depende de: CAT-S3.

## Épica CAT-E3. Ubicaciones + conteo (F9, F13)

- CAT-S5. `POST/GET /api/locations` + `products(location_id)`. AC: Given ubicación duplicada When creo Then 409; masiva auditada sin mover stock. Tablas: `locations`. Depende de: CAT-S1.
- CAT-S6. `POST /api/counts + /:id/confirmar`. AC: Given empleado cuenta When confirma Then `listo revisar`; Dueño confirma → `ajuste_conteo` + motivo. Offline líneas, confirma online. Tablas: `stock_counts/lines`. Depende de: CAT-S5.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Feliz | ingreso con lote + venta | FEFO descuenta el que vence antes |
| Fallo | conteo con diff | ajuste auditado con contó/confirmó |
