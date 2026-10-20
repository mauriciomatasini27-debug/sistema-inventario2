---
item: IA-S2-LECTURAS
estado: hecho
adr: ADR-0044
prd: PRD-IA-01
fecha: 2026-10-20
---
IA-S2-LECTURAS hecho: `top_productos`, `margen_producto` y `rotacion_lenta` leen datos reales del tenant (DB-first con espejo en memoria), con cálculo puro testeado y aislamiento por tenant; decisión: el top usa el mes en curso en hora Argentina (ART), el costo faltante devuelve margen nulo sin inventarlo la rotación usa por defecto una ventana de 30 días (en modo memoria, sin fechas, top y rotación toman todo lo registrado) y el drawer sigue en 12 chips como pide DASH-S7: primero una pregunta por herramienta y después las segundas variantes.
