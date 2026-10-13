export function planBackfill({ apply = false, tenantId = "slice0", comerciosEnBase = 1 } = {}) {
  const id = String(tenantId ?? "").trim();
  if (!id) return { ok: false, error: "Falta tenantId para el backfill.", ejecutaria: false };
  const n = Number(comerciosEnBase);
  if (!Number.isFinite(n) || n < 1) return { ok: false, error: "Comercios en base inválido.", ejecutaria: false };
  if (n > 1) {
    return {
      ok: false,
      error: `Se niega: la base es compartida por ${n} comercios; el backfill solo corre en base de un comercio.`,
      ejecutaria: false,
    };
  }
  const escaped = id.replace(/'/g, "''");
  const sql = `UPDATE fiscal_documents SET tenant_id = '${escaped}' WHERE tenant_id IS NULL`;
  return { ok: true, sql, ejecutaria: apply === true };
}
