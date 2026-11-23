# Checklist de navegación pantalla por pantalla

Fecha: 2026-11-23. Historia: AUD-S6 de PRD-AUD-03, restringida por ADR-0127.
Evidencia: `evidencia-aud-s6/2026-11-23/` (un JSON por pantalla más `resumen.json`).
Registro que este checklist consume: `trazabilidad-README.md` y los `trazabilidad-<módulo>.md`.

## Qué verifica

Para cada una de las 8 pantallas de ADR-0127 el checklist prueba la misma cadena, con el
payload que manda la pantalla (no uno inventado por el auditor):

1. **Carga**: la ruta responde 200, tiene el `h1` esperado y la API que alimenta la pantalla
   responde 200.
2. **Guarda**: el `POST` con el payload de la pantalla devuelve el 201/200 del contrato.
3. **Relee**: un `GET` posterior devuelve el dato guardado (mismo id o mismo valor).

Un paso que falla con un código de hallazgo (`venta-1`, `fiscal-3`, `pagos-1`) es un defecto ya
reportado como issue: el checklist lo sigue marcando hasta que el issue se cierre, y entonces
pasa a verde solo.

## Cómo se corre

Requiere la app levantada con `CONTROL_APP_DEV=1` (el entorno local de ADR-0111) y un tenant
sembrado:

```sh
node scripts/control-app/control-app.mjs levantar
npm run check:navegacion -- --semilla
```

- `--semilla` hace `POST /api/dev/control-app {"accion":"seed"}` antes de recorrer.
- Sin `--semilla` usa el tenant ya sembrado y avisa si no es `control-app`.
- `--dir <carpeta>` cambia la evidencia (default `.agents/skills/control-app/artifacts/<fecha>/aud-s6`).
- `--estricto` sale con 1 si algún paso falla (default informa y sale 0).
- `--json` imprime el resumen en JSON.
- La app no responde: exit 2.

El script no toca código, no aplica migraciones y no usa la base: el entorno local corre con el
almacén en memoria del tenant sembrado. La verificación contra Postgres es AUD-S4
(round-trips por módulo).

## Resultado

8 pantallas, 31 pasos, 28 ok, 0 fallas y **3 hallazgos** (los tres ya tienen issue).

| Pantalla | Ruta | Rol | Pasos | Carga | Guarda | Relee | Resultado |
|---|---|---|---|---|---|---|---|
| panel | `/panel` | dueño | 2 | ok | — (solo lectura) | ok | ok |
| venta | `/venta` | empleado | 5 | ok | ok | ok | **hallazgo venta-1** |
| caja | `/panel/caja` | dueño | 4 | ok | ok | ok | ok |
| stock | `/panel/stock` | dueño | 6 | ok | ok | ok | ok |
| proveedores | `/panel/proveedores` | dueño | 4 | ok | ok | ok | ok |
| servicios | `/panel/consumos` | dueño | 4 | ok | ok | ok | ok |
| fiscal | `/panel/fiscal/delegacion` | dueño | 5 | **hallazgo fiscal-3** | ok (contrato) | ok (contrato) | **hallazgo fiscal-3** |
| pagos | `/panel/pagos` | dueño | 1 | **hallazgo pagos-1** | — | — | **hallazgo pagos-1** |

## Detalle por pantalla

### panel

- Carga: `/panel` → 200, `h1` «Hola · Almacén Control App». API: `GET /api/panel/indice` → 200
  con los módulos del índice.
- Guarda/relee: no aplica. El panel no persiste nada propio; relee KPIs y módulos.
- Evidencia: `evidencia-aud-s6/2026-11-23/panel.json`.

### venta

- Carga: `/venta` → 200, `h1` «Venta mostrador». Catálogo: `GET /api/products?q=CAFE` → 200 con
  `CAFE-001`.
- Guarda: `POST /api/sales` con 2 unidades → 201, ticket definitivo y total. Relee:
  `GET /api/cash/history?limit=20` devuelve el egreso de la venta con el `cash_movement_id` del
  pago.
- **Hallazgo venta-1 (#474)**: con un producto por peso y stock suficiente, 2,5 kg con el payload
  de la pantalla (`porPeso: true`) → **422 «Poné un entero entre 1 y 999»**; con el nombre que
  espera el handler (`por_peso: true`) → **201**. Desde `/venta` no se puede cobrar 1 kg o más.
- Evidencia: `evidencia-aud-s6/2026-11-23/venta.json`.

### caja

- Carga: `/panel/caja` → 200, `h1` «Caja». Balance: `GET /api/cash/balance` → 200.
- Guarda: `POST /api/cash/movements` (egreso de arqueo, `device_code: "panel-web"`, payload de la
  pantalla) → 201. Relee: `GET /api/cash/history?limit=10` devuelve el movimiento con su id.
- Observación reproducida: **caja-1 (#476)** — el contrato acepta `nota`, el movimiento se crea
  (201) y la relectura no la devuelve porque `cash_movements` no tiene columna.
- Evidencia: `evidencia-aud-s6/2026-11-23/caja.json`.

### stock

- Carga: `/panel/stock` → 200, `h1` «Stock». Listado: `GET /api/products?panel=1` → 200.
- Guarda: `POST /api/products` (alta con SKU único, precio, código, sector) → 201; ingresar lote:
  `POST /api/stock/ingreso` (con vencimiento) → 201. Relee: `GET /api/products?codigo=<sku>`
  devuelve el producto con el mismo precio; `GET /api/lots?sku=<sku>` devuelve el lote.
- No se prueba acá **stock-1 (#477)**: el flag `controla_vencimiento` del alta vive en el espejo
  de memoria y la relectura es la misma memoria; el round-trip a base lo cubre AUD-S4.
- Evidencia: `evidencia-aud-s6/2026-11-23/stock.json`.

### proveedores

- Carga: `/panel/proveedores` → 200, `h1` «Proveedores». Listado: `GET /api/suppliers` → 200.
- Guarda: `POST /api/suppliers` (CUIT con dígito verificador válido generado por el script,
  nombre, email, teléfono) → 201. Relee: `GET /api/suppliers?q=<nombre>` devuelve el proveedor con
  el mismo CUIT.
- Evidencia: `evidencia-aud-s6/2026-11-23/proveedores.json`.

### servicios

- Carga: `/panel/consumos` → 200, `h1` «Consumos». Listado: `GET /api/service-accounts` → 200.
- Guarda: `POST /api/service-accounts` (servicio, proveedor, titular, como manda la pantalla) →
  201. Relee: `GET /api/service-accounts` devuelve la cuenta con su `account_id`.
- Observación reproducida: **servicios-1 (#479)** — la cuenta releída queda con `alias`,
  `email_origen` y `vencimiento_tipico_dia` en null porque el alta de la pantalla no los pide.
- Evidencia: `evidencia-aud-s6/2026-11-23/servicios.json`.

### fiscal

- Carga: `/panel/fiscal/delegacion` → 200, `h1` «Facturación ARCA».
- **Hallazgo fiscal-3 (#483)**: la pantalla llama `GET /api/fiscal/wizard` **sin** `tenant_id`
  (`src/pages/panel/fiscal/delegacion.astro:39`). En el modo single del entorno local el handler
  exige `tenant_id` y responde **422 «falta tenant_id»**, así que el estado queda en “Cargando…”
  y los botones (delegación y modo de primera factura) no tienen qué accionar. Con
  `?tenant_id=control-app` → 200.
- Guarda/relee por contrato: `POST /api/fiscal/wizard {tenant_id, accion:"avanzar", paso:1}` → 200
  y la relectura devuelve `paso: 1`.
- No se prueba acá **fiscal-1 (#480)** ni fiscal-2: el modo de primera factura y
  `cola_pausada`/`aviso_revocacion` viven en memoria; distinguirlos exige reiniciar el proceso.
- Evidencia: `evidencia-aud-s6/2026-11-23/fiscal.json`.

### pagos

- **Hallazgo pagos-1 (#481)**: `GET /panel/pagos` → **404**. La pantalla no existe en el panel;
  el módulo está solo en API (`/api/payment-orders/*`, `lib/repos/ordenes-pago.ts`, tabla
  `payment_orders`). No hay campo que trazar ni guarda que recorrer.
- Evidencia: `evidencia-aud-s6/2026-11-23/pagos.json`.

## Límites de esta pasada

- **Sin capturas PNG**: el sandbox de esta pasada no puede correr un navegador (Chrome muere al
  crear su canal de mojo y Playwright no puede lanzar con pipes). La evidencia es HTTP + API por
  pantalla, que es lo que prueba carga/guarda/relee; el PNG queda para una corrida con
  `control-app` en una máquina con navegador (los comandos están en el `SKILL.md` de la skill).
- **Modo single**: el tenant sembrado corre con el almacén en memoria. La persistencia en
  Postgres no se re-verifica acá (AUD-S4 la cubre); el checklist sí verifica que el handler
  acepte el payload de la pantalla y que el dato se relea.
- **Sin multi-tenant ni roles finos**: se recorre con dueño y, en venta, con empleado. No se
  prueban permisos de encargado ni tenants cruzados (fuera del alcance de AUD-S6).
- **Pantallas fuera de la lista**: fiado, precios, devoluciones, ventas pendientes, reportes,
  alertas, bot, integraciones, usuarios y plan no se recorren (mismo alcance que AUD-S5).

## Cómo se cierra un hallazgo

Cada hallazgo del checklist mapea a un issue de la épica #462. Cuando el issue se cierra, se
vuelve a correr `npm run check:navegacion -- --semilla --estricto`: el paso pasa a verde y
`--estricto` sale 0. No se edita el JSON de evidencia a mano: se regenera.
