-- PERS5-S1 (ADR-0080): correlativo D-* de devoluciones en ticket_counters.
-- Aditivo e idempotente: siembra la serie 'devolucion' con el máximo D-*
-- existente en sale_returns (0 si no hay). La fila se bloquea con FOR UPDATE
-- dentro de la tx de devolución, igual que 'mostrador' en ventas.
INSERT INTO "ticket_counters" ("id", "ultimo")
SELECT 'devolucion', COALESCE(MAX((substring("numero_devolucion" from '^D-([0-9]+)$'))::integer), 0)
FROM "sale_returns"
ON CONFLICT ("id") DO NOTHING;
