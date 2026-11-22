// AUD-VTA-05 T06: conciliación de los tres números del stock. Solo lectura:
// cada base se abre dentro de una transacción READ ONLY y se reporta el
// desvío por comercio y SKU; nunca se escribe ni se repara nada.
import postgres from "postgres";

const MOTIVO_SOBREVENTA = "sobreventa";
const PREFIJO_TENANT = "TENANT_DATABASE_URL_";

export function compararFila({ sku, stock, lotes, historial }) {
  return {
    sku,
    stock,
    lotes,
    historial,
    desvio: !(stock === lotes && lotes === historial),
  };
}

export function armarReporte(comercios, generadoEn = new Date().toISOString()) {
  const ordenados = [...comercios]
    .sort((a, b) => String(a.etiqueta ?? a.tenantId).localeCompare(String(b.etiqueta ?? b.tenantId)))
    .map((c) => ({
      tenantId: c.etiqueta ?? c.tenantId,
      filas: [...c.filas].sort((a, b) => a.sku.localeCompare(b.sku)),
    }));
  const desviados = ordenados.reduce((n, c) => n + c.filas.filter((f) => f.desvio).length, 0);
  return {
    generadoEn,
    desvio: desviados > 0,
    comercios: ordenados,
    resumen: {
      comercios: ordenados.length,
      skus: ordenados.reduce((n, c) => n + c.filas.length, 0),
      desviados,
    },
  };
}

function cliente(url) {
  const local = url.includes("localhost") || url.includes("127.0.0.1");
  const pooler = url.includes(":6543");
  return postgres(url, {
    max: 1,
    prepare: !pooler,
    ssl: local ? false : "require",
    connect_timeout: local ? 3 : 10,
  });
}

async function enSoloLectura(sql, fn) {
  return sql.begin(async (tx) => {
    await tx`SET TRANSACTION READ ONLY`;
    return fn(tx);
  });
}

function sumaPorSku(filas) {
  const out = new Map();
  for (const f of filas) out.set(f.sku, Number(f.n ?? 0));
  return out;
}

/** Tres sumas por SKU. `tenantId` null = sin filtro (base compartida de un solo comercio). */
export async function leerComercio(tx, tenantId) {
  const where = tenantId ? " WHERE tenant_id = $1" : "";
  const params = tenantId ? [tenantId] : [];
  const stock = sumaPorSku(
    await tx.unsafe(`SELECT sku, COALESCE(SUM(stock_actual), 0)::int AS n FROM products${where} GROUP BY sku`, params),
  );
  const lotes = sumaPorSku(
    await tx.unsafe(`SELECT sku, COALESCE(SUM(cantidad_restante), 0)::int AS n FROM stock_lots${where} GROUP BY sku`, params),
  );
  // T03: la sobreventa marcada no baja Stock ni Lote, por eso tampoco entra
  // en la suma del Historial. El desvío histórico se reporta, no se corrige.
  const historialWhere = ` WHERE (motivo IS NULL OR motivo <> '${MOTIVO_SOBREVENTA}')${tenantId ? " AND tenant_id = $1" : ""}`;
  const historial = sumaPorSku(
    await tx.unsafe(`SELECT sku, COALESCE(SUM(delta), 0)::int AS n FROM stock_movements${historialWhere} GROUP BY sku`, params),
  );
  const skus = new Set([...stock.keys(), ...lotes.keys(), ...historial.keys()]);
  return [...skus].sort().map((sku) =>
    compararFila({
      sku,
      stock: stock.get(sku) ?? 0,
      lotes: lotes.get(sku) ?? 0,
      historial: historial.get(sku) ?? 0,
    }),
  );
}

export async function descubrirTenants(url) {
  const sql = cliente(url);
  try {
    const filas = await enSoloLectura(sql, (tx) =>
      tx.unsafe(
        `SELECT tenant_id FROM products UNION SELECT tenant_id FROM stock_lots UNION SELECT tenant_id FROM stock_movements ORDER BY 1`,
      ),
    );
    return filas.map((f) => f.tenant_id).filter(Boolean);
  } finally {
    await sql.end();
  }
}

export async function conciliarTargets(targets) {
  const comercios = [];
  for (const { tenantId, url, etiqueta } of targets) {
    const sql = cliente(url);
    try {
      const filas = await enSoloLectura(sql, (tx) => leerComercio(tx, tenantId));
      comercios.push({ etiqueta: etiqueta ?? tenantId, filas });
    } finally {
      await sql.end();
    }
  }
  return armarReporte(comercios);
}

/** multi: una base por comercio (env); shared: la base compartida; single: una base. */
export function targetsDesdeEnv(env = process.env) {
  const modo = env.TENANT_MODE ?? "single";
  if (modo === "multi") {
    return Object.keys(env)
      .filter((k) => k.startsWith(PREFIJO_TENANT) && env[k])
      .map((k) => ({ tenantId: k.slice(PREFIJO_TENANT.length), etiqueta: k.slice(PREFIJO_TENANT.length), url: env[k] }))
      .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
  }
  if (!env.TENANT_DATABASE_URL) throw new Error("falta TENANT_DATABASE_URL");
  const etiqueta = modo === "shared" ? null : env.DEFAULT_TENANT_ID ?? null;
  return [{ tenantId: null, etiqueta, url: env.TENANT_DATABASE_URL }];
}
