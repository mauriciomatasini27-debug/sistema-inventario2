---
id: PRD-PERS-01
tipo: prd
estado: propuesto
modulos: [offline, persistencia]
depende_de: []
reemplaza: []
reemplazado_por: ""
resumen: |
  Fuente: auditoría 2026-10-11. Gap: 100 endpoints importan src/lib/store.ts (Map volátil); solo
  src/pages/api/sync/promote.ts usa Drizzle (intentarLeer/intentarPersistir). 86 tablas en src/db/.ts sin uso.
---
# PRD-PERS-01 - Persistencia Drizzle real tras store en memoria

Fuente: auditoría 2026-10-11. Gap: ~100 endpoints importan `src/lib/store.ts` (Map volátil); solo `src/pages/api/sync/promote.ts` usa Drizzle (`intentarLeer/intentarPersistir`). 86 tablas en `src/db/*.ts` sin uso.

## Épica PERS-E1. Migrar Slice-0 a Postgres

- PERS-S1. `POST /api/sales` + `POST /api/cash/movements` a Drizzle. AC: Given venta online When confirmo Then `sales + tickets + ticket_lines + cash_movements + stock_movements` en 1 tx con `idempotency_key` único; 409 en doble toque. Tablas: `sales`, `tickets`, `cash_movements`, `stock_movements`, `stock_lots`. Depende de: nada.
- PERS-S2. Outbox + `id_mappings` persistentes. AC: Given `op_id` repetido When push Then `200 replay` sin duplicar; provisorio → definitivo mapeado. Tablas: `outbox`, `id_mappings`. Depende de: PERS-S1.
- PERS-S3. `GET /api/cash/balance` derivado Σlíneas. AC: Given movimientos When pido balance Then cuadra con `SUM` por medio; nunca caché manual. Depende de: PERS-S1.

## Épica PERS-E2. Migrar resto por dominio

- PERS-S4. Orden: credit → tickets → prices → suppliers → fiscal → whatsapp/email. AC: Given cada migración When despliego Then tests `tests/*.test.ts` en verde + `store` sin import en ese dominio. Depende de: PERS-S1.
- PERS-S5. Retirar `src/lib/store.ts` o dejar solo como fallback test. AC: Given fin migración When grep `from .*store` en `src/pages/api` Then 0 hits (salvo tests). Depende de: PERS-S4.

## Estrategia prueba

| Tipo | Caso | Resultado |
|---|---|---|
| Fallo | restart proceso | ventas persisten |
| Concurrencia | doble toque | un solo par ticket-egreso, 409 |
| Carga | 100k tickets | `GET /api/tickets` <1s cursor |
