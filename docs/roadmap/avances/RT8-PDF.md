---
item: RT8-PDF
estado: hecho
adr: —
prd: MOD-08-REPORTES-ROTACION
fecha: 2026-10-20
---
RT8-PDF hecho: el reporte de rotación se exporta como PDF real con pdfkit (ya dependencia), con núcleo puro `armar_reporte_pdf` y adaptador `generar_reporte_pdf`, identificador único por exportación (`crypto.randomUUID()`), totales compartidos con el CSV vía `totales_rotacion`, cabecera con el nombre del comercio (el núcleo imprime el CUIT si llega, pero la ruta no lo lee porque `/api/analytics` no está en `PREFIJOS_DATOS` y no toca la base del tenant), período, filtros, generación en hora AR, indicadores, filas paginadas con "página N de M" y decimales con coma, sección "Cómo se calculan las métricas" y 500 en castellano si falla; quedan fuera `report_exports` y las tablas `rotation_*` porque piden migración, y la generación en segundo plano para más de 2000 filas (RT8.3); sin PRD ni ADR nuevo.
