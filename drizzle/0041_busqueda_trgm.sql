-- P3-5c (PRD-BOT-02): búsqueda difusa por nombre y alias con pg_trgm + unaccent.
-- Idempotente y aditiva. El repo filtra con f_norm(term) <% f_norm(column).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE OR REPLACE FUNCTION f_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT lower(public.unaccent('public.unaccent', t)) $$;
CREATE INDEX IF NOT EXISTS products_nombre_trgm_idx ON products USING gin (f_norm(nombre) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS product_aliases_alias_trgm_idx ON product_aliases USING gin (f_norm(alias) gin_trgm_ops);

-- ROLLBACK 0041:
-- DROP INDEX IF EXISTS product_aliases_alias_trgm_idx;
-- DROP INDEX IF EXISTS products_nombre_trgm_idx;
-- DROP FUNCTION IF EXISTS f_norm(text);
-- (no se revierten extensiones pg_trgm/unaccent compartidas)
