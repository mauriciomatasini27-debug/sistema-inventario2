import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { planBackfill, aplicarBackfill, contarNulos } from "../scripts/backfill-tenant-id-lib.mjs";

const SFX = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const T = (s: string) => `sec03-${SFX}-${s}`;

describe("SEC3-S1 plan cubre ambas tablas", () => {
  it("un comercio devuelve una sentencia por tabla sin ejecutar", () => {
    const r = planBackfill({ apply: false, tenantId: "slice0", comerciosEnBase: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperaba plan ok");
    expect(r.ejecutaria).toBe(false);
    expect(r.sentencias.map((s) => s.tabla)).toEqual(["fiscal_documents", "fiscal_settings"]);
    const [doc, cfg] = r.sentencias;
    if (!doc || !cfg) throw new Error("esperaba dos sentencias");
    expect(r.sql).toContain(doc.sql);
    expect(r.sql).toContain(cfg.sql);
  });

  it("con apply el plan marca que ejecutaria", () => {
    const r = planBackfill({ apply: true, tenantId: "slice0", comerciosEnBase: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperaba plan ok");
    expect(r.ejecutaria).toBe(true);
  });

  it("documents actualiza todas las filas nulas", () => {
    const r = planBackfill({ apply: false, tenantId: "slice0", comerciosEnBase: 1 });
    if (!r.ok) throw new Error("esperaba plan ok");
    const [doc] = r.sentencias;
    if (!doc) throw new Error("esperaba sentencia de documents");
    expect(doc.sql).toBe("UPDATE fiscal_documents SET tenant_id = 'slice0' WHERE tenant_id IS NULL");
  });

  it("settings toca solo la nula mas reciente y solo sin fila del tenant", () => {
    const r = planBackfill({ apply: false, tenantId: "slice0", comerciosEnBase: 1 });
    if (!r.ok) throw new Error("esperaba plan ok");
    const [, cfg] = r.sentencias;
    if (!cfg) throw new Error("esperaba sentencia de settings");
    const s = cfg.sql;
    expect(s).toMatch(/UPDATE fiscal_settings SET tenant_id = 'slice0'/);
    expect(s).toMatch(/ORDER BY created_at DESC, id DESC LIMIT 1/);
    expect(s).toMatch(/NOT EXISTS \(SELECT 1 FROM fiscal_settings WHERE tenant_id = 'slice0'\)/);
  });

  it("escapa la comilla del tenant", () => {
    const r = planBackfill({ apply: false, tenantId: "o'brien", comerciosEnBase: 1 });
    if (!r.ok) throw new Error("esperaba plan ok");
    expect(r.sql).toContain("o''brien");
    expect(r.sql).not.toContain("o'brien");
  });

  it("tenant vacio se niega", () => {
    for (const tenantId of ["", "   "]) {
      const r = planBackfill({ apply: false, tenantId, comerciosEnBase: 1 });
      expect(r.ok).toBe(false);
    }
  });

  it("comercios invalido o compartido se niega", () => {
    for (const comerciosEnBase of [0, -1, Number.NaN, 2, 5]) {
      const r = planBackfill({ apply: false, tenantId: "slice0", comerciosEnBase });
      expect(r.ok).toBe(false);
      expect(r.ejecutaria).toBe(false);
    }
  });
});

const PG_URL = process.env.PG_TEST_URL_B ?? "";
const hayPG = Boolean(PG_URL);

let sql: ReturnType<typeof postgres> | null = null;
const clavesDocs: string[] = [];
const cuitsSettings: string[] = [];

async function cliente() {
  if (!sql) throw new Error("sin cliente PG");
  return sql;
}

async function sembrarDoc(clave: string) {
  const db = await cliente();
  await db`INSERT INTO fiscal_documents (idempotency_key, cbte_tipo, pto_vta, cbte_fch, doc_tipo, doc_nro, cond_iva_receptor, imp_total_centavos, tenant_id)
    VALUES (${clave}, '11', '3', '20261013', '99', 0, '5', 1000, NULL)`;
  clavesDocs.push(clave);
}

async function sembrarSetting(cuit: string, vieja: string) {
  const db = await cliente();
  await db`INSERT INTO fiscal_settings (cuit, punto_venta, tenant_id, created_at) VALUES (${cuit}, '3', NULL, ${vieja}::timestamptz)`;
  cuitsSettings.push(cuit);
}

async function tenantDeDoc(clave: string): Promise<string | null> {
  const db = await cliente();
  const filas = await db`SELECT tenant_id FROM fiscal_documents WHERE idempotency_key = ${clave}`;
  return (filas[0]?.tenant_id as string | null) ?? null;
}

async function tenantDeSetting(cuit: string): Promise<string | null> {
  const db = await cliente();
  const filas = await db`SELECT tenant_id FROM fiscal_settings WHERE cuit = ${cuit}`;
  return (filas[0]?.tenant_id as string | null) ?? null;
}

async function limpiar() {
  if (!sql) return;
  for (const c of clavesDocs.splice(0)) {
    await sql`DELETE FROM fiscal_documents WHERE idempotency_key = ${c}`;
  }
  for (const c of cuitsSettings.splice(0)) {
    await sql`DELETE FROM fiscal_settings WHERE cuit = ${c}`;
  }
}

describe.skipIf(!hayPG)("SEC3-S1/S2 backfill real en PG local", () => {
  beforeAll(() => {
    sql = postgres(PG_URL);
  });

  afterAll(async () => {
    await limpiar();
    await sql?.end();
    sql = null;
  });

  it("apply deja ambas tablas en el tenant y reporta conteos", async () => {
    const tenant = T("ambas");
    const clave = `doc-${tenant}`;
    const cuit = `2099988877${String(Math.floor(Math.random() * 90) + 10)}`;
    await sembrarDoc(clave);
    await sembrarSetting(cuit, "2025-01-01T00:00:00Z");
    try {
      const plan = planBackfill({ apply: true, tenantId: tenant, comerciosEnBase: 1 });
      if (!plan.ok) throw new Error("esperaba plan ok");
      const cambios = await aplicarBackfill(await cliente(), plan);
      expect(cambios.fiscal_documents).toBeGreaterThanOrEqual(1);
      expect(cambios.fiscal_settings).toBe(1);
      expect(await tenantDeDoc(clave)).toBe(tenant);
      expect(await tenantDeSetting(cuit)).toBe(tenant);
    } finally {
      await limpiar();
    }
  });

  it("dos nulas en settings: solo la mas reciente queda del tenant", async () => {
    const tenant = T("dosnulas");
    const vieja = `2088877766${String(Math.floor(Math.random() * 90) + 10)}`;
    const nueva = `2077766655${String(Math.floor(Math.random() * 90) + 10)}`;
    await sembrarSetting(vieja, "2025-01-01T00:00:00Z");
    await sembrarSetting(nueva, "2025-06-01T00:00:00Z");
    try {
      const plan = planBackfill({ apply: true, tenantId: tenant, comerciosEnBase: 1 });
      if (!plan.ok) throw new Error("esperaba plan ok");
      await aplicarBackfill(await cliente(), plan);
      expect(await tenantDeSetting(nueva)).toBe(tenant);
      expect(await tenantDeSetting(vieja)).toBeNull();
    } finally {
      await limpiar();
    }
  });

  it("tenant con fila: nulas intactas sin violar el unico", async () => {
    const tenant = T("confila");
    const cuit = `2066655544${String(Math.floor(Math.random() * 90) + 10)}`;
    const cuitPropio = `2055544433${String(Math.floor(Math.random() * 90) + 10)}`;
    const db = await cliente();
    await sembrarSetting(cuit, "2025-01-01T00:00:00Z");
    await db`INSERT INTO fiscal_settings (cuit, punto_venta, tenant_id) VALUES (${cuitPropio}, '3', ${tenant})`;
    cuitsSettings.push(cuitPropio);
    try {
      const plan = planBackfill({ apply: true, tenantId: tenant, comerciosEnBase: 1 });
      if (!plan.ok) throw new Error("esperaba plan ok");
      const cambios = await aplicarBackfill(db, plan);
      expect(cambios.fiscal_settings).toBe(0);
      expect(await tenantDeSetting(cuit)).toBeNull();
    } finally {
      await limpiar();
    }
  });

  it("segundo apply no cambia filas", async () => {
    const tenant = T("idem");
    const clave = `doc-${tenant}`;
    const cuit = `2044433322${String(Math.floor(Math.random() * 90) + 10)}`;
    await sembrarDoc(clave);
    await sembrarSetting(cuit, "2025-01-01T00:00:00Z");
    try {
      const db = await cliente();
      const plan = planBackfill({ apply: true, tenantId: tenant, comerciosEnBase: 1 });
      if (!plan.ok) throw new Error("esperaba plan ok");
      await aplicarBackfill(db, plan);
      const otra = await aplicarBackfill(db, plan);
      expect(otra.fiscal_documents).toBe(0);
      expect(otra.fiscal_settings).toBe(0);
    } finally {
      await limpiar();
    }
  });

  it("contarNulos es solo lectura", async () => {
    const clave = `doc-${T("ro")}`;
    const cuit = `2033322211${String(Math.floor(Math.random() * 90) + 10)}`;
    await sembrarDoc(clave);
    await sembrarSetting(cuit, "2025-01-01T00:00:00Z");
    try {
      const db = await cliente();
      const antes = await contarNulos(db);
      const despues = await contarNulos(db);
      expect(despues).toEqual(antes);
      expect(antes.fiscal_documents).toBeGreaterThanOrEqual(1);
      expect(antes.fiscal_settings).toBeGreaterThanOrEqual(1);
      expect(await tenantDeDoc(clave)).toBeNull();
    } finally {
      await limpiar();
    }
  });

  it("CLI en seco no cambia datos", async () => {
    const tenant = T("seco");
    const clave = `doc-${tenant}`;
    const cuit = `2022211100${String(Math.floor(Math.random() * 90) + 10)}`;
    await sembrarDoc(clave);
    await sembrarSetting(cuit, "2025-01-01T00:00:00Z");
    try {
      const salida = execFileSync("node", ["scripts/backfill-tenant-id.mjs", "--tenant-id", tenant], {
        encoding: "utf8",
        env: { ...process.env, TENANT_DATABASE_URL: PG_URL },
      });
      expect(salida).toContain("UPDATE fiscal_documents");
      expect(salida).toContain("UPDATE fiscal_settings");
      expect(await tenantDeDoc(clave)).toBeNull();
      expect(await tenantDeSetting(cuit)).toBeNull();
    } finally {
      await limpiar();
    }
  });
});
