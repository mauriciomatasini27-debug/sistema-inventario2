import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { armarReporte, compararFila } from "../scripts/conciliar-stock-lib.mjs";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

// AUD-VTA-05 T06: la conciliación es solo lectura. Compara, por comercio y
// SKU, Stock disponible / suma de Lotes / suma del Historial, excluye la
// sobreventa marcada y reporta el desvío sin repararlo.

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(RAIZ, "scripts", "conciliar-stock.mjs");
const hayPG = Boolean(process.env.PG_TEST_URL_A);
const sufijo = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 10);
const TENANT_A = "00000000-0000-4000-8000-00000000000a";
const TENANT_B = "00000000-0000-4000-8000-00000000000b";
const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "DEFAULT_TENANT_ID", "CONTROL_DATABASE_URL"] as const;

function envBase(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("TENANT_DATABASE_URL")) delete env[k];
  for (const k of ENV) delete env[k];
  return env;
}

function correr(env: NodeJS.ProcessEnv): { estado: number; salida: string; json: any } {
  try {
    const salida = execFileSync(process.execPath, [CLI], {
      cwd: RAIZ,
      env: { ...envBase(), ...env },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { estado: 0, salida, json: JSON.parse(salida) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    const salida = String(err.stdout ?? "");
    return { estado: err.status ?? 99, salida, json: salida ? JSON.parse(salida) : null };
  }
}

describe("AUD-VTA-05 T06 comparación pura", () => {
  it("considera cuadrados los tres números iguales", () => {
    expect(compararFila({ sku: "A", stock: 3, lotes: 3, historial: 3 })).toEqual({
      sku: "A",
      stock: 3,
      lotes: 3,
      historial: 3,
      desvio: false,
    });
  });

  it("reporta desvío aunque solo difiera una de las tres sumas", () => {
    expect(compararFila({ sku: "A", stock: 3, lotes: 2, historial: 3 }).desvio).toBe(true);
    expect(compararFila({ sku: "A", stock: 3, lotes: 3, historial: 4 }).desvio).toBe(true);
  });

  it("el reporte ordena comercios y SKUs y resume los desviados", () => {
    const reporte = armarReporte([
      { tenantId: TENANT_B, filas: [compararFila({ sku: "B", stock: 1, lotes: 1, historial: 1 })] },
      { tenantId: TENANT_A, filas: [compararFila({ sku: "A", stock: 2, lotes: 1, historial: 2 })] },
    ]);
    expect(reporte.comercios.map((c: any) => c.tenantId)).toEqual([TENANT_A, TENANT_B]);
    expect(reporte.desvio).toBe(true);
    expect(reporte.resumen).toEqual({ comercios: 2, skus: 2, desviados: 1 });
  });
});

describe.skipIf(!hayPG)("AUD-VTA-05 T06 comando read-only contra Postgres", () => {
  let url = "";
  let sql: ReturnType<typeof postgres>;
  let snap: Record<string, string | undefined> = {};

  async function sembrar(tenantId: string, sku: string, stock: number, lotes: number, historial: number, sobreventa = 0) {
    await sql`INSERT INTO products (tenant_id, sku, nombre, precio_centavos, stock_actual) VALUES (${tenantId}, ${sku}, ${sku}, 1000, ${stock})`;
    await sql`INSERT INTO stock_lots (tenant_id, sku, cantidad, cantidad_restante, costo_centavos) VALUES (${tenantId}, ${sku}, ${lotes}, ${lotes}, 0)`;
    await sql`INSERT INTO stock_movements (tenant_id, idem_key, sku, delta, tipo) VALUES (${tenantId}, ${`t06-${sufijo}-${sku}`}, ${sku}, ${historial}, 'COMPENSATORIO')`;
    if (sobreventa !== 0) {
      await sql`INSERT INTO stock_movements (tenant_id, idem_key, sku, delta, tipo, motivo) VALUES (${tenantId}, ${`t06-sobre-${sufijo}-${sku}`}, ${sku}, ${-sobreventa}, 'VENTA', 'sobreventa')`;
    }
  }

  async function estado(): Promise<string> {
    const filas = await sql.unsafe(
      `SELECT
         (SELECT json_agg(to_jsonb(p) ORDER BY p.tenant_id, p.sku) FROM products p) AS p,
         (SELECT json_agg(to_jsonb(l) ORDER BY l.tenant_id, l.sku, l.id) FROM stock_lots l) AS l,
         (SELECT json_agg(to_jsonb(m) ORDER BY m.tenant_id, m.sku, m.idem_key) FROM stock_movements m) AS m`,
    );
    return JSON.stringify(filas[0]);
  }

  beforeAll(async () => {
    // RETRO-AUD-03: el helper limpia los SKUs T06% de corridas anteriores.
    url = await asegurarBasePrivada("aud_vta_05_t06", process.env.PG_TEST_URL_A ?? "", ["T06%"]);
    sql = postgres(url, { max: 1 });
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  beforeEach(async () => {
    snap = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    await sql`DELETE FROM stock_movements WHERE sku LIKE 'T06%'`;
    await sql`DELETE FROM stock_lots WHERE sku LIKE 'T06%'`;
    await sql`DELETE FROM products WHERE sku LIKE 'T06%'`;
  });

  afterEach(() => {
    for (const k of ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });

  it("sin desvío sale 0 y reporta los tres números por comercio y SKU", async () => {
    const sku = `T06OK${sufijo}`;
    await sembrar(TENANT_A, sku, 4, 4, 4);

    const r = correr({ TENANT_MODE: "shared", TENANT_DATABASE_URL: url });
    expect(r.estado).toBe(0);
    expect(r.json.desvio).toBe(false);
    expect(r.json.comercios).toHaveLength(1);
    expect(r.json.comercios[0].tenantId).toBe(TENANT_A);
    expect(r.json.comercios[0].filas).toEqual([{ sku, stock: 4, lotes: 4, historial: 4, desvio: false }]);
  });

  it("con desvío sale 1, lo reporta y no repara nada", async () => {
    const sku = `T06DES${sufijo}`;
    await sembrar(TENANT_A, sku, 5, 3, 5);
    const antes = await estado();

    const r = correr({ TENANT_MODE: "shared", TENANT_DATABASE_URL: url });
    expect(r.estado).toBe(1);
    expect(r.json.desvio).toBe(true);
    expect(r.json.comercios[0].filas[0]).toEqual({ sku, stock: 5, lotes: 3, historial: 5, desvio: true });
    expect(await estado()).toBe(antes);
  });

  it("excluye la sobreventa marcada del Historial", async () => {
    const sku = `T06SOB${sufijo}`;
    // 4 operaciones reales + 2 de sobreventa: el stock es 4 y el historial
    // neto sin sobreventa también 4; con la sobreventa daría 2.
    await sembrar(TENANT_A, sku, 4, 4, 4, 2);

    const r = correr({ TENANT_MODE: "shared", TENANT_DATABASE_URL: url });
    expect(r.estado).toBe(0);
    expect(r.json.comercios[0].filas[0].historial).toBe(4);
  });

  it("en shared separa comercios con el mismo SKU", async () => {
    const sku = `T06DOS${sufijo}`;
    await sembrar(TENANT_A, sku, 2, 2, 2);
    await sembrar(TENANT_B, sku, 3, 3, 3);

    const r = correr({ TENANT_MODE: "shared", TENANT_DATABASE_URL: url });
    expect(r.estado).toBe(0);
    expect(r.json.comercios.map((c: any) => c.tenantId)).toEqual([TENANT_A, TENANT_B]);
    expect(r.json.resumen).toEqual({ comercios: 2, skus: 2, desviados: 0 });
  });

  it("en multi usa una base por comercio desde el entorno", async () => {
    const sku = `T06MULTI${sufijo}`;
    await sembrar(TENANT_A, sku, 1, 1, 1);

    const r = correr({
      TENANT_MODE: "multi",
      [`TENANT_DATABASE_URL_${TENANT_A}`]: url,
    });
    expect(r.estado).toBe(0);
    expect(r.json.comercios.map((c: any) => c.tenantId)).toEqual([TENANT_A]);
  });

  it("la base privada vuelve a arrancar limpia en otra corrida", async () => {
    const sku = `T06STALE${sufijo}`;
    await sembrar(TENANT_A, sku, 1, 1, 1);
    expect((await sql`SELECT count(*)::int AS n FROM products WHERE sku = ${sku}`)[0]?.n).toBe(1);

    await asegurarBasePrivada("aud_vta_05_t06", process.env.PG_TEST_URL_A ?? "", ["T06%"]);
    const despues = await sql`SELECT count(*)::int AS n FROM products WHERE sku = ${sku}`;
    expect(despues[0]?.n).toBe(0);
  });
});
