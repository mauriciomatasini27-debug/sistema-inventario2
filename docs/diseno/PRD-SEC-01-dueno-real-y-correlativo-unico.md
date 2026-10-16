---
id: PRD-SEC-01
tipo: prd
estado: propuesto
modulos: []
depende_de: [ADR-0024, ADR-0031, ADR-0051, ADR-0064, ADR-0066]
reemplaza: []
reemplazado_por: ""
resumen: ""
---
# PRD-SEC-01 - Dueño real, online real y correlativo único de tickets

Fuente: hallazgos de `diseno/PLAN-COM-01-poda-comentarios.md` (comentarios falsos frente al código). Uso en este sistema: rutas de cualquier comercio, sin reglas por rubro. Restringido por ADR-0066, ADR-0064, ADR-0051, ADR-0031 (AU10) y ADR-0024. Tipo seguridad.

## Problema

Cuatro comentarios prometen controles que el código no hace. `payment-orders/confirm-paid` y `cancel` dicen "solo Dueño" pero no leen la sesión y el repositorio pasa siempre rol `dueno`. `fiscal/settings` dice "Dueño+reauth" pero toma el tenant del header `x-tenant-id` con `demo` por defecto y sin sesión. `prices/adjustments` dice que lo sensible exige online pero el repositorio pasa siempre `online: true`. `sync/promote` numera tickets con un contador en memoria aparte de `ticket_counters`, que usan las ventas, así que dos tickets pueden salir con el mismo número.

## Épica SEC-E1. Controles reales en rutas sensibles

Requisito SEC-R1: el control que dice el comentario lo hace el código, o el comentario se va.

- Historia SEC-S1. Confirmar pago y cancelar orden de pago exigen sesión válida y membership dueño activa del tenant resuelto por el servidor. AC: Given no hay sesión When llamo `POST /api/payment-orders/confirm-paid` o `cancel` Then 403 sin tocar la orden; Given sesión de empleado Then 403; Given sesión de dueño Then el flujo sigue como hoy. ADR: 0066. Talla S. Depende de: nada.
- Historia SEC-S2. Configuración fiscal exige sesión de dueño y reauth reciente (AU10), y resuelve el tenant como el plano de datos (`tenantDeRequest`): sin `demo` por defecto en multi, falla cerrado. AC: Given sin sesión When `POST /api/fiscal/settings` Then 403; Given dueño con reauth vieja Then 401 `reauth_requerida`; Given multi sin tenant resoluble Then 403; Given dueño con reauth fresca Then 201 con el tenant resuelto, nunca `demo` por header. ADR: 0066. Talla S. Depende de: nada.
- Historia SEC-S3. El ajuste de precios deriva `online` del request con la puerta offline (`exigirOnlineParaSensible`, marcas de grant, cuarentena y device). AC: Given el request trae `x-offline-grant` o `x-cuarentena: 1` When `POST /api/prices/adjustments` Then 403 y no se registra ajuste; Given sin marcas offline Then 201 como hoy. ADR: 0066. Talla S. Depende de: nada.

## Épica SEC-E2. Correlativo único de tickets

Requisito SEC-R2: ventas y sync comparten un solo correlativo.

- Historia SEC-S4. `promoverOperacion` toma el número de `ticket_counters` (fila `mostrador`) con lock dentro de la misma transacción que escribe `id_mappings` y confirma el `outbox`; en memoria y single sigue con el contador del store compartido con ventas. AC: Given ventas y promociones intercaladas When reviso los números Then no hay duplicados en DB ni en memoria. ADR: 0066. Talla M. Depende de: nada.

## Dependencias externas

Ninguna. No toca Supabase ni secretos.

## Estrategia prueba

| Tipo | Caso | Entrada | Resultado esperado |
|---|---|---|---|
| Fallo | Confirmar pago sin sesión | `Request` real sin cookie | 403 |
| Fallo | Cancelar orden como empleado | Cookie de sesión de empleado | 403 |
| Fallo | Fiscal sin reauth | Dueño con `reauthAt` de hace 20 min | 401 `reauth_requerida` |
| Fallo | Fiscal multi sin tenant | `TENANT_MODE=multi`, sin membership | 403 |
| Fallo | Ajuste con grant offline | Header `x-offline-grant` | 403 |
| Feliz | Dueño online | Sesión de dueño, sin marcas | 201 |
| Regresión | Ventas y sync intercalados | Ventas + promote en memoria y en PG local | Números de ticket sin duplicados |

Arch-tests: AT1 los handlers se prueban con `Request` reales, no con repos sueltos. AT2 test de no duplicados entre ventas y sync.
