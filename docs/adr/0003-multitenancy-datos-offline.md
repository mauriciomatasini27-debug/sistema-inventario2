---
id: ADR-0003
tipo: adr
estado: aceptado
modulos: [offline, tenant]
depende_de: [ADR-0004]
reemplaza: []
reemplazado_por: ""
resumen: "1 DB Postgres por cliente + 1 base control catálogo. Local SQLite por dispositivo con outbox idempotente."
---
# ADR-0003 - Multitenancy, datos y offline

Estado: aceptado. Fecha: 2026-10-10.

## Decisión

1 DB Postgres por cliente + 1 base control catálogo. Local SQLite por dispositivo con outbox idempotente.

## Control (1)

`tenants`, `tenant_databases`, `users(google_sub UNIQUE)`, `memberships`, `invitations(token_hash)`, `sessions(id_hash)`, `whatsapp_identities`, `whatsapp_usage`, `platform_admins`, `admin_audit_log(hash)`, `billing_*`, `infra_hosts`, `fiscal_computers`, `arca_tokens`, `ops_signals_outbox`.

## Comercio (N)

`products`, `product_codes`, `locations`, `stock_lots`, `stock_movements append-only`, `sales`, `sale_returns`, `suppliers`, `purchase_orders`, `product_cost_history`, `cash_day`, `cash_movements`, `shift_handovers`, `supplier_invoices`, `service_accounts`, `utility_bills`, `payment_orders`, `fiscal_documents`, `notification_preferences/outbox`, `product_daily_stats`, `devices`, `audit_log`.

Reglas: `REVOKE UPDATE/DELETE/TRUNCATE` en inmutables + triggers, `registrar_movimiento FOR UPDATE`, `created_at now()` servidor + `client_occurred_at`, `idempotency_key UNIQUE`, compensatorio `corrige_movimiento_id` + motivo. Job nocturno verifica sin autocorregir.

## Offline

Tablas local: snapshot+cursor, `local_movements`, `cash_*_local`, `outbox(op_id, device_seq, hlc, estado)`, `id_mappings`, `photos_queue`, `sync_state`, `offline_grant`.

Flujo: vende/descuenta local FEFO -> encola -> sync auto -> servidor reasigna lotes, suma movimientos, resuelve idempotencia -> confirma. Tope fiado contra saldo local. Sesión offline con grant, acciones sensibles exigen online OF9.5.

## Consecuencias

- Aislamiento total por cliente, borrado demo simple, backup por base.
- Panel y jobs agregan vía contadores, no leen negocio.
- Sobreventa posible offline se marca y audita, no se bloquea mostrador.

## Contratos API

- `POST /api/devices/register` con sesión miembro. Body Zod: `device_code` string 4 a 32, `plataforma` enum `android|ios|web`, `app_version` string semver, `op_id` uuid. Responde 201 con `device_id + device_code + offline_grant`, 409 si `device_code` ya registrado en el tenant y devuelve registro vigente, 422 si `app_version` menor a mínima soportada, 403 si usuario no es miembro del tenant.
- `POST /api/sync/push` con `Idempotency-Key` igual a `op_id`. Body Zod: `op_id` uuid, `device_code` string, `device_seq` int positivo, `hlc` string, `tabla_local` enum `local_movements|cash_movements_local|sale_local`, `payload` objeto, `client_occurred_at` ISO con doble hora. Responde 201 con `op_id + id_definitivo + cursor_nuevo`, 409 si `op_id` ya confirmado con distinto `payload`, 422 si `device_seq` duplicado con otro `op_id`, 403 si sesión offline vencida y exige revalidar online.
- `GET /api/sync/pull?cursor=&limite=` con sesión miembro. Query Zod: `cursor` bigint no negativo, `limite` int 1 a 200 def 100. Responde 200 con `movimientos + cursor_nuevo + id_mappings`, 409 si `cursor` es de rama archivada y exige reseed, 422 si `cursor` negativo o `limite` fuera de rango, 403 si dispositivo fue revocado.
- `POST /api/sync/offline-grants` con sesión Dueño o Empleado online. Body Zod: `device_code` string, `alcance` enum cerrado `venta|stock|caja|fiado_cobro`, `horas_vigencia` int 1 a 72, `user_id` uuid. Responde 201 con `grant_id + alcance + expira_en`, 409 si ya hay grant vigente igual alcance y dispositivo, 422 si pide alcance sensible fuera de lista como sueldos o retiro dueno, 403 si Empleado pide alcance no permitido por OF9.5.

## Eventos outbox

- `dispositivo_registrado {tenant_id, device_id, device_code, app_version, occurred_at}`.
- `sync_confirmado {tenant_id, op_id, device_code, id_definitivo, cursor_nuevo, client_occurred_at}`.
- `offline_grant_otorgado {tenant_id, grant_id, device_code, alcance, expira_en}`.
- `sobreventa_marcada {tenant_id, sale_id, product_id, qty_pedida, stock_vigente, device_code}`.
- Entrega at-least-once por `op_id`. Consumidor sync reasigna lotes FEFO en servidor y actualiza `id_mappings`.

## Errores E1-E6

- E1 dispositivo duplicado: 409, devuelve registro vigente sin crear otro.
- E2 `op_id` duplicado con distinto body: 409, devuelve confirmación original, audita colisión.
- E3 acción sensible offline sin grant: 403, exige online segun OF9.5, no encola.
- E4 cursor inválido o rama archivada: 409 para reseed, 422 si formato negativo, no acepta push hasta reseed.
- E5 sobreventa offline: se acepta y marca `sobreventa=true`, conducta igual a E2 de ADR-0004, Dueño resuelve sin bloquear mostrador.
- E6 escritura a tabla inmutable con UPDATE o DELETE: 403 por `REVOKE`, solo compensatorio con `corrige_movimiento_id` más motivo, job nocturno verifica sin autocorregir.

## Fuera de corte

- Autocorrección del job nocturno, solo verifica y reporta.
- Lectura de negocio desde panel fuera de `ops_signals_outbox` y contadores.
- Sesión offline para sueldos, retiro dueno, ajustes de tope fiado y cierre caja.
- Fotos y PDF en cola crítica mostrador, van en `photos_queue` diferida.
- Borrado físico cross base y retención mayor a lo exigido por Ley 25.326 mínima.
