// settings toma solo la nula más reciente porque el índice único por tenant
// rechaza dos filas del mismo comercio.
/**
 * @typedef {{ tabla: string, sql: string }} SentenciaBackfill
 * @typedef {{ ok: true, ejecutaria: boolean, sentencias: SentenciaBackfill[], sql: string } | { ok: false, error: string, ejecutaria: false }} PlanBackfill
 * @param {{ apply?: boolean, tenantId?: string, comerciosEnBase?: number, permitirShared?: boolean }} [args]
 * @returns {PlanBackfill}
 */
export function planBackfill({
  apply = false,
  tenantId = "slice0",
  comerciosEnBase = 1,
  permitirShared = false,
} = {}) {
  const id = String(tenantId ?? "").trim();
  if (!id) return { ok: false, error: "Falta tenantId para el backfill.", ejecutaria: false };
  const n = Number(comerciosEnBase);
  if (!Number.isFinite(n) || n < 1) return { ok: false, error: "Comercios en base inválido.", ejecutaria: false };
  // ADR-0116 ISO-S9: shared deja de negar la base; exige --shared + tenant explícito por tabla.
  if (n > 1 && !permitirShared) {
    return {
      ok: false,
      error: `Se niega: la base es compartida por ${n} comercios; pasá --shared y --tenant-id del dueño de las filas nulas.`,
      ejecutaria: false,
    };
  }
  const escaped = id.replace(/'/g, "''");
  const sentencias = [
    { tabla: "fiscal_documents", sql: `UPDATE fiscal_documents SET tenant_id = '${escaped}' WHERE tenant_id IS NULL` },
    {
      tabla: "fiscal_settings",
      sql: `UPDATE fiscal_settings SET tenant_id = '${escaped}' WHERE id = (SELECT id FROM fiscal_settings WHERE tenant_id IS NULL ORDER BY created_at DESC, id DESC LIMIT 1) AND NOT EXISTS (SELECT 1 FROM fiscal_settings WHERE tenant_id = '${escaped}')`,
    },
  ];
  return {
    ok: true,
    ejecutaria: apply === true,
    sentencias,
    sql: `${sentencias[0].sql};\n${sentencias[1].sql};`,
  };
}

// Ambas tablas cambian juntas o ninguna, por eso una sola transacción.
/**
 * @param {any} sql cliente postgres
 * @param {{ sentencias: SentenciaBackfill[] }} plan
 * @returns {Promise<Record<string, number>>} filas cambiadas por tabla
 */
export async function aplicarBackfill(sql, plan) {
  const cambios = {};
  await sql.begin(async (tx) => {
    for (const s of plan.sentencias) {
      const r = await tx.unsafe(s.sql);
      cambios[s.tabla] = typeof r.count === "number" ? r.count : 0;
    }
  });
  return cambios;
}

// Solo lectura: cuenta filas con tenant nulo por tabla.
/**
 * @param {any} sql cliente postgres
 * @returns {Promise<Record<string, number>>} nulas por tabla
 */
export async function contarNulos(sql) {
  const nulos = {};
  for (const tabla of ["fiscal_documents", "fiscal_settings"]) {
    const filas = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ${tabla} WHERE tenant_id IS NULL`);
    nulos[tabla] = filas[0].n;
  }
  return nulos;
}
