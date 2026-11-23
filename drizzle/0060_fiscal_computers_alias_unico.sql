-- AUD-FIX-S2 [persistencia]: el único (ambiente, alias) ya existe en la base real
-- (fiscal_computers tiene 0 filas); esta migración es no-op y deja el historial alineado.
CREATE UNIQUE INDEX IF NOT EXISTS "fiscal_computers_ambiente_alias_key" ON "fiscal_computers" USING btree ("ambiente","alias");
