-- PRD-STOCK-01 STOCK-S4 / ADR-0106: una sola ALTA de stock inicial por SKU.
-- El índice parcial deja competir a dos "Guardar" simultáneos y la DB dirime;
-- el perdedor no inserta ni suma stock. Idempotente y aditiva.
CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_stock_inicial_unico" ON "stock_movements" ("idem_key") WHERE "idem_key" LIKE 'stock-inicial:%';

-- ROLLBACK 0036:
-- DROP INDEX IF EXISTS "stock_movements_stock_inicial_unico";
