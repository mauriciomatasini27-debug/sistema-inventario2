# Trazabilidad pantalla → handler → repo → columna

Fecha: 2026-11-23. Historia: AUD-S5 de PRD-AUD-03, restringida por ADR-0127.
Alcance: primera pasada sobre las 8 pantallas de ADR-0127 (panel, venta, caja, stock,
proveedores, servicios, pagos, fiscal). Solo lectura de código: no se cambió ninguna pantalla ni
ninguna consulta.

## Formato

Un archivo por módulo (`trazabilidad-<modulo>.md`) con cuatro secciones:

1. **Campos persistidos**: el campo que el usuario carga y el camino hasta la columna.
   `Campo en pantalla | Payload | Handler | Repo | Columna | Estado`.
2. **Solo lectura**: lo que la pantalla muestra y de dónde sale.
3. **Columnas del módulo sin pantalla**: columnas de negocio que ninguna pantalla de la primera
   pasada llena o muestra.
4. **Hallazgos**: numerados `<módulo>-<n>`, con la evidencia y la decisión.

Estados:

| Estado | Significado |
|---|---|
| `ok` | el campo llega a una columna de la base |
| `ok (dominio)` | el campo entra a la lógica y no necesita columna propia; se explica por qué |
| `huérfano` | la pantalla lo manda y no llega a ninguna columna (hallazgo) |
| `sin pantalla` | la columna existe y ninguna pantalla de la pasada la llena o muestra (hallazgo o nota) |

Nivel de detalle (pendiente de ADR-0127): **campo a campo para lo que se persiste**, y
pantalla a pantalla para lo que solo se lee. Los diálogos secundarios y las pantallas fuera de la
lista quedan anotados como no auditados en cada archivo, no se infieren.

## Resumen

| Módulo | Archivo | Campos persistidos | Hallazgos |
|---|---|---|---|
| panel | `trazabilidad-panel.md` | 0 (solo lectura) | 1 |
| venta | `trazabilidad-venta.md` | 21 | 3 |
| caja | `trazabilidad-caja.md` | 22 | 2 |
| stock | `trazabilidad-stock.md` | 23 | 3 |
| proveedores | `trazabilidad-proveedores.md` | 14 | 2 |
| servicios | `trazabilidad-servicios.md` | 12 | 2 |
| pagos | `trazabilidad-pagos.md` | 0 (no hay pantalla) | 1 |
| fiscal | `trazabilidad-fiscal.md` | 3 | 2 |

Total: 95 campos trazados, 16 hallazgos. Ningún campo de las pantallas relevadas quedó sin
columna sin estar reportado: los que no persisten son `huérfano` con hallazgo (venta-1, venta-2,
caja-1, stock-1, stock-2, fiscal-1) o `ok (dominio)` con la explicación.

## Cómo se re-corre

Es una auditoría de código, no un script: el registro se rehace leyendo la pantalla, su handler y
el repo. Las piezas que se usaron para armarlo y sirven para repetirlo:
- Payloads por pantalla: buscar `fetch("/api/...` y `body: JSON.stringify(` en
  `src/pages/**/*.astro` y `src/components/**/*.astro`.
- Contrato de cada handler: el `z.object({...})` del archivo en `src/pages/api/**`.
- Columna: el `insert(...)` del repo, o el nombre de la columna en `src/db/schema*.ts`.
- Para confirmar que una columna no tiene pantalla: `npm run check:columnas` dice que existe, y
  `grep` del nombre en `src/pages` y `src/components` dice si alguien la usa.

El registro de trazabilidad se complementa con el **checklist de navegación** de AUD-S6
(`checklist-navegacion.md`): donde el registro dice qué campo debería llegar a qué columna, el
checklist prueba que la pantalla carga, guarda y relee con el payload real. Los dos se re-corren
en cada iteración de diseño.
