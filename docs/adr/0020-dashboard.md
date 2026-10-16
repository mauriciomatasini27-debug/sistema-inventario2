---
id: ADR-0020
tipo: adr
estado: aceptado
modulos: []
depende_de: [ADR-0008, ADR-0009]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# ADR-0020 - Dashboard principal índice/nav estilo Crextio en Astro

Estado: aceptado. Fecha: 2026-10-10. Fuente: `PRD - Indice y Navegacion Dashboard Principal para Sistema de Inventario.docx`. Cierra el hueco "solo se ve Venta mostrador": `/` pasa a ser índice visual, la venta actual se conserva.

## Decisión

Home dashboard en `/` con estética Crextio (crema, tarjetas blancas, tarjeta oscura, acento amarillo) implementado 100% en Astro + islas, consumiendo solo los GET/POST ya existentes. La venta mostrador (`src/pages/index.astro`) se mueve a `/venta` sin cambiar su lógica offline. Ningún pill lleva a 404: lo no implementado enlaza a placeholder explícito.

## UI/UX craft

Réplica fiel del layout de referencia, contenido de kiosco: barra superior con pills (Dashboard activo negro, resto gris sobre crema), saludo `Hola {nombre}`, tira KPI con barra segmentada 70/10/15/5 + tres números grandes, grilla de 5 tarjetas con flecha ↗ cada una (Turnos | Últimos movimientos | Reporte calor oscuro | Ventas por mes | Dona por medio). Orden móvil 360px: saludo, KPIs, venta, movimientos, calor, gráfico, dona, turnos; desktop ≥1024px grilla 3+2 como la imagen. Táctil ≥44px, focos visibles, pills con scroll horizontal, tabla semántica, reduced-motion. Cada widget tiene estados cargando/vacío/error y nunca rompe el layout si la DB cae.

## Capacidades

El dashboard solo ordena y resume: saludo por sesión, KPIs (tickets hoy, stock bajo, ventas mes), turnos de caja, últimos 3–5 movimientos con pill de estado, heatmap de ventas por hora, ventas por mes (Efectivo vs Digital, selector año visual), dona de composición por medio 70/30, y accesos a Stock, Precios, Proveedores, Fiado y Reportes. Sin agregados server en P0: se calculan en cliente y se marcan `demo` hasta tener endpoint. Carga en paralelo, ningún widget bloquea a otro, primer paint <2s en dev.

## Componentes (Astro, tema papel)

`layouts/DashboardLayout.astro` (fondo papel, slots barra/saludo/grilla) + islas: `TopPills`, `KpiStrip`, `ShiftTimeline`, `MovementsTable` (reusa lista `.875rem` y pills de ADR-0009), `HeatCard` (dark con puntos), `SalesChart` (SVG doble serie + tooltip), `MixDonut` (SVG). Venta se embebe como `SaleCard` o ruta `/venta` con su outbox intacto. Fases: F0 tokens + layout + venta movida; F1 las 5 tarjetas; F2 pantallas full por módulo. Cada fase con captura 360px y desktop.

## Colores (mapeo a ADR-0008, sin tokens nuevos)

Papel `#f7f5f2`, canvas `#efecea`, texto `#1a1a1a`, tarjeta oscura `deep #1a1a1a` con muted `72%`, acento `llama yellow #ffd600` (segmentos, puntos, badges), hover `#ffe033`, estados: pagado verde papel, pendiente ámbar `ember #ffb300`, ausente/impago gris. CTA siempre llama con texto blanco 600 como en ADR-0008. Radios `card 12px`, `pill 999px`, blur barra `16px` (POS 20px). Sin morado, sin neón, sin glass por fila.

## Alternativas descartadas

Librería de charts pesada (Recharts/ECharts): se descarta en P0 por peso y por necesitar solo dos gráficos; SVG propio alcanza. SPA React separada: se descarta porque pierde SSR/islas Astro y duplica el front actual. Rediseñar APIs para el dashboard: se descarta, el índice solo consume lo existente.

## Criterios de aceptación

Comparación visual lado a lado aprobada; cero 404 desde pills/flechas; con DB caída render degradado; venta (cobrar 201, sync, balance) verde en E2E Slice-0; 360px sin scroll horizontal salvo pills.

## Fuera de corte

Pantallas full de Caja, Stock, Precios, Proveedores, Fiado y Reportes (P1); KPIs configurables; búsqueda global; personalización y atajos.
