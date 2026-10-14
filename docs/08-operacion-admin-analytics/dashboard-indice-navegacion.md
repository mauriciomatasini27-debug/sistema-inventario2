> Origen: `PRD - Indice y Navegacion Dashboard Principal para Sistema de Inventario.docx` | Convertido a Markdown el 2026-10-11. Original archivado en `docs/_origen-docx/`. Código: `src/pages/panel.astro`, `src/pages/index.astro`, `src/components/`

---

# PRD - Índice y Navegación Dashboard Principal para Sistema de Inventario

Documento nuevo: define el índice/nav principal (home dashboard) con estética lo más parecida posible a la imagen de referencia estilo Crextio, adaptada al kiosco/comercio. Hoy el front solo expone / (Venta mostrador, src/pages/index.astro) y todo lo demás son endpoints JSON bajo /api/*. Este PRD crea la puerta de entrada visual que ordena y hace visibles esas rutas.

Principio rector: se opera al 100% desde el celular, pero el dashboard escala a desktop en grilla. Replica el layout de la imagen (barra superior con pills, saludo, tira de KPIs, grilla de 5 tarjetas, tarjeta oscura) cambiando solo el contenido de dominio: ventas, caja, stock, precios, proveedores, fiado y reportes.

Referencia visual: imagen Crextio aportada por el dueño (fondo crema #F5F1E8, tarjetas blancas redondeadas, acento amarillo #F5C518 aprox, tarjeta oscura #1A1A1A, tipografía system-ui). La fidelidad visual es requisito P0; el contenido de RR.HH. de la imagen se mapea 1-a-1 a comercio (ver sección 4).

## 1. Resumen / visión general

### 1.1 Problema

El usuario abre localhost:4321 y solo ve Venta mostrador. Las demás capacidades (caja, tickets, precios, proveedores, órdenes de pago, fiado, facturas, servicios, WhatsApp, email, fiscal) existen como APIs pero no se ven ni se pueden navegar. No hay índice, ni menú, ni home que explique qué hay hecho.

### 1.2 Visión

Un dashboard principal en / que replica la imagen Crextio: saludo personalizado, barra superior de navegación por módulos, tira de KPIs del negocio y cinco tarjetas (agenda/turnos, tabla de movimientos, tarjeta oscura de calor, gráfico de ventas, dona de composición). Cada tarjeta es a la vez resumen y puerta de entrada a su módulo. La venta mostrador actual se conserva como tarjeta principal o ruta /venta sin romper su lógica offline.

### 1.3 Propuesta de valor

"Todo lo hecho, visible de un vistazo: entrás al dashboard y de ahí vas a vender, cerrar caja, ver stock, precios, proveedores y fiado, con el estilo moderno de la imagen de referencia."

### 1.4 Alcance del módulo

Incluye: nuevo home dashboard (layout, nav, 5 tarjetas, responsive), mapeo de cada widget a API existente, navegación a módulos, saludo con nombre de sesión, estados vacíos/error cuando la DB no responde. No incluye: rediseñar las APIs, ni crear pantallas completas de cada módulo (solo el índice con resúmenes enlazables), ni autenticación nueva (reusa la existente).

## 2. Objetivos y cómo se miden

## 3. Réplica de la imagen: layout exigido (P0)

La imagen trae, de arriba hacia abajo:

• Barra superior: logo a la izquierda (Crextio → nombre del comercio / Sistema de Inventario); centro: pills de navegación con Dashboard activo en negro; derecha: Setting, búsqueda y avatar. Adaptación: pills = Dashboard, Ventas, Caja, Stock, Precios, Proveedores, Fiado, Reportes. El pill activo es negro con texto blanco; los demás, texto gris sobre crema.

• Saludo grande 'Hello Valentina' → 'Hola {nombre}' (de sesión; fallback 'Hola'). Debajo, tira de KPIs a la izquierda: barra segmentada 70/10/15/5 con etiquetas (en imagen: Interviews/Hired/Project time/Output). Adaptación: Ventas hoy 70% / Tickets 10% / Stock bajo 15% / Caja 5%. A la derecha, tres números grandes con etiqueta debajo (en imagen: 91 Employee, 104 Hirings, 185 Projects). Adaptación: Tickets hoy | Productos con stock bajo | Ventas del mes.

• Fila 1 de tarjetas (3 columnas): Schedule (izq, angosta) | Salary tabla (centro, ancha) | Attendance Report (der, oscura). Adaptación: Turnos de caja (agenda vertical con timeline 09:00–15:00, eventos Daily Sync→Apertura caja, Task Review→Arqueo, Daily Meeting→Cierre) | Últimos movimientos (tabla Nombre→Producto/Cliente, Job Title→Detalle, Net Salary→Importe, Status→Pagado/Ausente/Pendiente con pills de color) | Reporte de calor oscuro (63→ventas hoy, 12→devoluciones/pendientes, matriz de puntos amarillos = ventas por hora).

• Fila 2 de tarjetas (2 columnas anchas + dona): Hiring Statistics (gráfico de líneas doble serie Others/Design por mes Ene–Nov, tooltip 'Others 12') → Ventas por mes (serie Efectivo vs Mercado Pago, selector año 2024) | Employee Composition (dona 345 Total, 70%/30%) → Composición de ventas por medio (dona total del mes, 70% Efectivo / 30% Digital).

• Detalles de estilo: fondo crema, tarjetas blancas con radio ~16px y sombra suave, tarjeta oscura #1A1A1A con puntos amarillos, amarillo acento para segmentos y badges, tipografía system-ui, iconos de flecha ↗ en la esquina de cada tarjeta que enlazan al módulo.

## 4. Mapa índice/nav: de cada widget a qué ruta/API va

Regla P0: ningún pill lleva a un 404. Si la pantalla full es P1, el pill en P0 lleva al dashboard con la tarjeta correspondiente resaltada o a un placeholder explícito 'Próximamente' con link al endpoint JSON.

## 5. Requisitos funcionales

## 6. Requisitos no funcionales

• Responsive: 360px una columna (orden: saludo, KPIs, venta, movimientos, calor, gráfico, dona, turnos); desktop ≥1024px grilla como la imagen (3+2).

• Performance: primer paint < 2s en dev; widgets cargan en paralelo con fetch independiente; ningún widget bloquea a otro.

• Accesibilidad: contraste AA, focos visibles, pills navegables por teclado, tabla con headers semánticos.

• Sin regresión: no se cambian contratos de /api/*; el dashboard solo consume GETs existentes y los POST actuales de venta/sync.

## 7. Priorización y fases

## 8. Criterios de aceptación

• CA1: abrir / muestra barra pills, saludo, tira KPI y las 5 tarjetas con el estilo de la imagen (comparación visual aprobada).

• CA2: cada pill y cada flecha ↗ lleva a algún lado (dashboard anclado o placeholder explícito); cero 404.

• CA3: con la DB caída (auth postgres fallando como hoy) el dashboard igual renderiza con mensajes degradados.

• CA4: la venta (cobrar 201, sync, balance) sigue funcionando desde su tarjeta/ruta; test Vitest/E2E Slice-0 en verde.

• CA5: en 360px no hay scroll horizontal salvo la barra de pills; en desktop la grilla coincide con la imagen.

## 9. Riesgos y supuestos

• Riesgo: APIs sin agregados mensuales/por-hora → se calculan en cliente en P0 y se marcan 'demo' hasta tener endpoint.

• Riesgo: imágenes de avatar de la referencia → se usan iniciales/avatar genérico, sin fotos reales.

• Supuesto: la imagen Crextio es solo referencia estética; el dominio es kiosco (no RR.HH.).

• Supuesto: credenciales de Postgres local se corrigen aparte; el dashboard debe tolerar ese fallo (CA3).

## 10. Trazabilidad con PRDs existentes

Este dashboard no reemplaza ningún PRD: es el índice que los ordena. Consume sin modificar: Caja Digital (turnos/retiros/sueldos/fiado), Ticket de Venta, Gestión de Precios, Facturas de Proveedores, Órdenes de Pago, Fiado y Cuenta Corriente, Consumos de Servicios, Reportes de Rotación, Facturación ARCA, Notificaciones por Email, Bot de WhatsApp, Modo Offline y Panel Multi-Kiosco.

Glosario mínimo: pill = pastilla de navegación; tarjeta oscura = panel de reporte con heatmap; dona = gráfico circular de composición; calor = matriz de puntos por hora.

Campo | Detalle
--- | ---
Producto | Índice/Nav Dashboard Principal (home) del Sistema de Inventario
Autor | Mauricio Matasini
Estado | Borrador para revisión
Referencia visual | Imagen Crextio (dashboard crema/negro/amarillo)
Front actual | src/pages/index.astro = solo / Venta mostrador
APIs a ordenar | /api/sales, /api/cash/*, /api/tickets, /api/prices/*, /api/suppliers, /api/purchase-orders*, /api/credit/*, /api/supplier-invoices/*, /api/payment-orders/*, /api/utility-bills*, /api/fiscal/*, /api/whatsapp/*, /api/email/*, /api/auth/*, /api/tenants*
Fuera de alcance | Pantallas completas de cada módulo; cambios de contrato de las APIs

# | Objetivo | Cómo se mide
--- | --- | ---
O1 | Que todo lo hecho sea visible y navegable desde / | 100% de módulos con tarjeta o pill que enlaza; test manual: desde / se llega a cada módulo en ≤ 2 clics
O2 | Fidelidad visual a la imagen de referencia | Revisión visual lado a lado: barra pills, saludo, tira KPI, grilla 1+3+2 tarjetas, tarjeta oscura con heatmap, dona 70/30; desvíos listados y aprobados
O3 | No romper la venta actual | La venta mostrador sigue funcionando igual (cobrar, sync, balance) ya sea como tarjeta principal o en /venta; E2E Slice-0 en verde
O4 | Útil con y sin DB | Con DB caída cada tarjeta muestra estado degradado (no pantalla blanca); sin red los widgets cachean último valor

Widget en dashboard | Destino front | API que alimenta
--- | --- | ---
Pill Ventas / tarjeta Venta mostrador | /venta (actual index.astro movido o embebido) | POST /api/sales, POST /api/sync/push, GET /api/cash/balance
Pill Caja / tarjeta Turnos | /caja (nueva solo índice en P0, pantalla full P1) | GET /api/cash/shifts, /api/cash/balance, /api/cash/movements, /api/cash/close
Tabla Últimos movimientos | /movimientos (P1) / link a /api tickets | GET /api/tickets, /api/cash/movements, /api/sales/*
Tarjeta oscura Reporte calor | /reportes (P1) | GET /api/cash/balance, /api/returns, /api/tickets
Gráfico Ventas por mes | /reportes#ventas (P1) | GET /api/tickets, /api/sales (agregado mensual)
Dona Composición por medio | /caja#medios (P1) | GET /api/cash/balance (por_medio), /api/sales/medium-corrections
Pill Stock | /stock (P1, solo link en P0) | Tablas schema principal (productos/stock)
Pill Precios | /precios (P1, solo link en P0) | GET /api/prices/preview, /api/prices/adjustments
Pill Proveedores | /proveedores (P1, solo link en P0) | GET /api/suppliers, /api/purchase-orders, /api/supplier-invoices/*
Pill Fiado | /fiado (P1, solo link en P0) | GET /api/credit/balance, /api/credit/sales-on-account, /api/credit/payments
Pills Reportes/Setting/buscar/avatar | Reportes, /api/auth/*, /api/tenants* | Según módulo (rotación, fiscal, email, whatsapp)

# | Funcionalidad | MVP (P0) | Más adelante (P1)
--- | --- | --- | ---
D1 | Barra superior con pills | Logo + 8 pills + setting/buscar/avatar; responsive con scroll horizontal en 360px | Búsqueda global funcional; menú usuario con logout
D2 | Saludo + tira KPIs | Hola {nombre} + barra 70/10/15/5 + 3 números con datos reales o placeholder | KPIs configurables por comercio
D3 | Tarjeta Turnos (Schedule) | Timeline estático con turnos reales si hay API, si no datos demo marcados 'demo' | Gestión de turnos (abrir/cerrar/conciliar)
D4 | Tabla movimientos (Salary) | Últimos 3–5 movimientos con importe y pill de estado; search filtra en cliente | Paginación, filtros server-side, detalle por fila
D5 | Tarjeta oscura calor | 63/12 + matriz de puntos generada por datos o demo; fondo #1A1A1A | Rango de fechas y drill-down por hora
D6 | Gráfico ventas + dona | SVG/Canvas sin librería pesada o librería liviana; tooltip; selector año visual | Comparativas interanuales, exportar
D7 | Venta mostrador preservada | Funciona idéntico (cobrar/sync/balance, offline outbox); accesible desde Dashboard | Venta rediseñada con el nuevo estilo
D8 | Estados degradados | Cada widget con vacío/error/cargando; sin DB muestra mensaje, no rompe layout | Reintento automático y caché con TTL

Prioridad | Significado
--- | ---
P0 - MVP | Dashboard con fidelidad visual, datos reales donde haya API y demo marcado donde no, venta preservada, sin 404
P1 - Post-MVP | Pantallas full de Caja, Stock, Precios, Proveedores, Fiado y Reportes enlazadas desde el dashboard
P2 - Luego | Personalización (KPIs elegibles, temas), notificaciones y atajos de teclado
