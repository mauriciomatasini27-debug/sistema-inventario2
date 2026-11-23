---
id: ADR-0127
tipo: adr
estado: propuesto
modulos: [design-system, persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
modifica: []
modificado_por: []
resumen: Cada campo de pantalla se traza en un registro pantalla-handler-repo-columna; los hallazgos se vuelcan como issues y la auditoría es re-corrible.
---
# ADR-0127 - Trazabilidad UI ↔ código ↔ base de datos

Estado: propuesto. Fecha: 2026-11-22. Fuentes: PRD-AUD-03.

## Decisión

La funcionalidad de UI/UX se audita con un registro de trazabilidad por módulo (`docs/roadmap/auditorias/trazabilidad-<modulo>.md`) que mapea cada campo o pantalla a su handler, su repo y su columna. Un campo sin columna, o una columna sin pantalla, es un hallazgo. Los hallazgos se vuelcan como issues de GitHub bloqueados por la épica correspondiente.

## Por qué

"Está funcional" solo se puede afirmar si el dato existe en la base, lo mueve el código y lo muestra la UI (y viceversa). Sin trazabilidad, un campo puede quedar a mitad de camino y nadie lo ve. El registro da una evidencia revisable y re-corrible.

## Qué cambia

- Agrega el formato del registro de trazabilidad y un checklist de navegación por pantalla.
- Cada hallazgo se convierte en issue (bloqueado por la épica de su PRD) hasta quedar cerrado con evidencia.
- La auditoría se re-corre en cada iteración de diseño y el registro se versiona en el repo.

## Pendientes

- (Resuelto en AUD-S5) La primera pasada cubre panel, venta, caja, stock, proveedores, servicios, pagos y fiscal.
- (Resuelto en AUD-S5) Nivel de detalle: campo a campo para lo que se persiste; pantalla a pantalla para lo que solo se lee.

## Implementación (AUD-S5)

- `docs/roadmap/auditorias/trazabilidad-README.md` define el formato y los estados (`ok`, `ok (dominio)`, `huérfano`, `sin pantalla`), y cada módulo tiene su `trazabilidad-<modulo>.md` con cuatro secciones: campos persistidos, solo lectura, columnas del módulo sin pantalla y hallazgos.
- Resultado de la primera pasada: **95 campos trazados y 16 hallazgos** en las 8 pantallas. Ningún campo relevado quedó sin columna sin estar reportado; los que no persisten están como `huérfano` con hallazgo o como `ok (dominio)` con la razón (vuelto, impresión térmica, cola offline).
- Regla de hallazgos (calibra la decisión de arriba): un hallazgo **accionable** (un campo que se pierde, una columna que no se llena, una pantalla que no existe) se crea como issue hija de la épica #462; una **nota** (comportamiento por diseño o decisión de producto) queda en el registro y se revisa en la próxima pasada, sin issue. Hoy: 8 accionables (#474 venta-1, #475 venta-2, #476 caja-1, #477 stock-1, #478 stock-2, #479 servicios-1, #480 fiscal-1, #481 pagos-1) y 8 notas.
- Hallazgos accionables de mayor impacto: `venta-1` (el payload de `/venta` manda `porPeso` y el handler espera `por_peso`, así que una línea por peso de más de 999 g devuelve 422, probado contra los handlers reales), `stock-1` (`controla_vencimiento` del alta solo vive en memoria), `fiscal-1` (el modo de primera factura solo vive en memoria) y `pagos-1` (la pantalla de pagos no existe: el módulo está solo en API).
- El registro no es un test automático: se re-corre leyendo pantalla → handler → repo → columna. El README deja el procedimiento y los comandos (`npm run check:columnas` para confirmar que la columna existe; `grep` en `src/pages` y `src/components` para saber si alguna pantalla la usa).
- Límite declarado: quedan fuera de esta pasada las pantallas fuera de la lista (fiado, precios, devoluciones, ventas pendientes, reportes, alertas, bot, integraciones, usuarios, plan), los diálogos secundarios y la UI móvil. Cada archivo dice qué no auditó.
