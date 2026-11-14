import { sql } from "drizzle-orm";
import { decidir_respuesta, extraer_termino, type Candidato } from "../../modules/whatsapp/consulta.js";
import { puntuarMemoria } from "../../modules/whatsapp/puntaje-memoria.js";
import { BaseNoDisponible, dbVivaTenant, type TenantDb } from "../server-db.js";
import { esModoShared } from "../tenant-mode.js";
import { tenantIdAlSellar, tenantIdShared, tenantUuidMulti } from "../tenant-scope.js";
import { listarCatalogoVivo } from "./whatsapp.js";

/** Mitad del umbral de decidir_respuesta (0.3): umbral local de pg_trgm en la transacción. */
const UMBRAL_TRGM_WORD = "0.15";

export interface FichaProducto {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly precioCentavos: bigint;
  readonly costoCentavos?: bigint | undefined;
  readonly proveedor?: string | null | undefined;
}

export type ResolucionNombre =
  | { kind: "directo"; ficha: FichaProducto }
  | { kind: "desambiguar"; opciones: { sku: string; nombre: string; stock: number }[] }
  | { kind: "precisar"; total: number }
  | { kind: "sin_resultados"; sugerencia?: { sku: string; nombre: string } };

export type ResultadoNombre = { origen: "db" | "memoria"; resolucion: ResolucionNombre };

export type PedidoNombre = { tenantId: string | null; texto: string };

interface FilaRankeada {
  sku: string;
  nombre: string;
  stock: number;
  umbral: number;
  precioCentavos: bigint;
  score: number;
}

export async function consultarNombre(pedido: PedidoNombre): Promise<ResultadoNombre> {
  const db = dbVivaTenant(pedido.tenantId ?? undefined);
  const origen: "db" | "memoria" = db ? "db" : "memoria";
  const term = extraer_termino(pedido.texto);
  if (!term) return { origen, resolucion: { kind: "sin_resultados" } };

  if (!db) {
    const filas = puntuarMemoria(await listarCatalogoVivo(pedido.tenantId ?? undefined), term);
    return { origen: "memoria", resolucion: decidirDesdeFilas(filas) };
  }

  const tid = tenantIdFilaSql(pedido);
  let filas: FilaRankeada[];
  try {
    filas = await rankearSql(db, term, tid);
  } catch {
    throw new BaseNoDisponible();
  }
  return { origen: "db", resolucion: decidirDesdeFilas(filas) };
}

export async function leerFicha(pedido: { tenantId: string | null; sku: string }): Promise<FichaProducto | null> {
  const db = dbVivaTenant(pedido.tenantId ?? undefined);
  if (!db) {
    const item = (await listarCatalogoVivo(pedido.tenantId ?? undefined)).find((i) => i.sku === pedido.sku);
    return item ? fichaDesdeVivo(item) : null;
  }
  try {
    const tid = tenantIdFilaSql({ tenantId: pedido.tenantId, texto: "" });
    const filtro = tid ? sql`AND tenant_id = ${tid}::uuid` : sql``;
    const filas = await db.execute(sql`
      SELECT sku, nombre, stock_actual AS stock, COALESCE(min_stock, 0) AS umbral, precio_centavos AS precio
      FROM products
      WHERE sku = ${pedido.sku}
      ${filtro}
      LIMIT 1
    `);
    const row = parsearFilaSql((filas as unknown[])[0]);
    return row ? { sku: row.sku, nombre: row.nombre, stock: row.stock, umbral: row.umbral, precioCentavos: row.precioCentavos } : null;
  } catch {
    throw new BaseNoDisponible();
  }
}

function fichaDesdeVivo(item: {
  sku: string;
  nombre: string;
  stock: number;
  umbral: number;
  precioCentavos: bigint;
  costoCentavos?: bigint | undefined;
  proveedor?: string | null | undefined;
}): FichaProducto {
  return {
    sku: item.sku,
    nombre: item.nombre,
    stock: item.stock,
    umbral: item.umbral,
    precioCentavos: item.precioCentavos,
    ...(item.costoCentavos != null ? { costoCentavos: item.costoCentavos } : {}),
    ...(item.proveedor != null ? { proveedor: item.proveedor } : {}),
  };
}

function decidirDesdeFilas(filas: ReadonlyArray<FilaRankeada>): ResolucionNombre {
  const conExacto = filas.filter((f) => f.score >= 0.99);
  const base =
    conExacto.length > 0
      ? conExacto
      : filas;
  const candidatos: Candidato[] = base.map((f) => ({ sku: f.sku, nombre: f.nombre, score: f.score }));
  const d = decidir_respuesta(candidatos);
  const porSku = new Map(filas.map((f) => [f.sku, f]));

  if (d.kind === "sin_resultados") {
    return {
      kind: "sin_resultados",
      ...(d.sugerencia ? { sugerencia: { sku: d.sugerencia.sku, nombre: d.sugerencia.nombre } } : {}),
    };
  }
  if (d.kind === "precisar") return { kind: "precisar", total: d.total };
  if (d.kind === "desambiguar") {
    return {
      kind: "desambiguar",
      opciones: d.opciones.map((o) => {
        const f = porSku.get(o.sku);
        return { sku: o.sku, nombre: o.nombre, stock: f?.stock ?? 0 };
      }),
    };
  }
  const f = porSku.get(d.sku);
  if (!f) return { kind: "sin_resultados" };
  return { kind: "directo", ficha: fichaDesdeSql(f) };
}

function fichaDesdeSql(f: FilaRankeada): FichaProducto {
  return {
    sku: f.sku,
    nombre: f.nombre,
    stock: f.stock,
    umbral: f.umbral,
    precioCentavos: f.precioCentavos,
  };
}

function tenantIdFilaSql(pedido: PedidoNombre): string | null {
  if (esModoShared()) {
    try {
      return tenantIdShared();
    } catch {
      return null;
    }
  }
  const sellado = tenantIdAlSellar();
  if (sellado) return sellado;
  const t = pedido.tenantId;
  if (!t) return null;
  if (/^[0-9a-f-]{36}$/i.test(t)) return t;
  return tenantUuidMulti(t);
}

async function rankearSql(db: TenantDb, term: string, tenantRowId: string | null): Promise<FilaRankeada[]> {
  const filtroProd = tenantRowId ? sql`AND p.tenant_id = ${tenantRowId}::uuid` : sql``;
  const filtroAlias = tenantRowId ? sql`AND a.tenant_id = ${tenantRowId}::uuid AND p.tenant_id = ${tenantRowId}::uuid` : sql``;
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${UMBRAL_TRGM_WORD}, true)`);
    const result = await tx.execute(sql`
      WITH probes AS (
        SELECT p.sku, p.nombre, p.stock_actual, p.min_stock, p.precio_centavos, 1.0::float8 AS score
        FROM products p
        WHERE f_norm(p.sku) = f_norm(${term})
        ${filtroProd}

        UNION ALL

        SELECT p.sku, p.nombre, p.stock_actual, p.min_stock, p.precio_centavos,
          word_similarity(f_norm(${term}), f_norm(p.nombre))::float8 AS score
        FROM products p
        WHERE f_norm(${term}) <% f_norm(p.nombre)
        ${filtroProd}

        UNION ALL

        SELECT p.sku, p.nombre, p.stock_actual, p.min_stock, p.precio_centavos, 1.0::float8 AS score
        FROM product_aliases a
        INNER JOIN products p ON p.sku = a.sku AND p.tenant_id = a.tenant_id
        WHERE f_norm(a.alias) = f_norm(${term})
        ${filtroAlias}

        UNION ALL

        SELECT p.sku, p.nombre, p.stock_actual, p.min_stock, p.precio_centavos, 1.0::float8 AS score
        FROM product_aliases a
        INNER JOIN products p ON p.sku = a.sku AND p.tenant_id = a.tenant_id
        WHERE f_norm(a.alias_norm) = f_norm(${term})
        ${filtroAlias}

        UNION ALL

        SELECT p.sku, p.nombre, p.stock_actual, p.min_stock, p.precio_centavos,
          word_similarity(f_norm(${term}), f_norm(a.alias))::float8 AS score
        FROM product_aliases a
        INNER JOIN products p ON p.sku = a.sku AND p.tenant_id = a.tenant_id
        WHERE f_norm(${term}) <% f_norm(a.alias)
          AND f_norm(a.alias) <> f_norm(${term})
        ${filtroAlias}
      ),
      ranked AS (
        SELECT sku, nombre, stock_actual, min_stock, precio_centavos, MAX(score) AS score
        FROM probes
        GROUP BY sku, nombre, stock_actual, min_stock, precio_centavos
      )
      SELECT sku, nombre, stock_actual, min_stock, precio_centavos, score
      FROM ranked
      ORDER BY score DESC
      LIMIT 10
    `);
    const out: FilaRankeada[] = [];
    for (const raw of result as unknown[]) {
      const f = parsearFilaSql(raw, true);
      if (f) out.push(f);
    }
    return out;
  });
}

function parsearFilaSql(raw: unknown, conScore = false): FilaRankeada | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const sku = r["sku"];
  const nombre = r["nombre"];
  const stock = r["stock"] ?? r["stock_actual"];
  const umbral = r["umbral"] ?? r["min_stock"];
  const precio = r["precio_centavos"] ?? r["precio"];
  if (typeof sku !== "string" || typeof nombre !== "string") return null;
  const stockN = typeof stock === "number" ? stock : Number(stock);
  const umbralN = umbral == null ? 0 : typeof umbral === "number" ? umbral : Number(umbral);
  let precioCentavos: bigint;
  if (typeof precio === "bigint") precioCentavos = precio;
  else if (typeof precio === "number") precioCentavos = BigInt(precio);
  else if (typeof precio === "string") precioCentavos = BigInt(precio);
  else return null;
  if (!Number.isFinite(stockN)) return null;
  const base: FilaRankeada = {
    sku,
    nombre,
    stock: stockN,
    umbral: Number.isFinite(umbralN) ? umbralN : 0,
    precioCentavos,
    score: 0,
  };
  if (!conScore) return base;
  const score = r["score"];
  const scoreN = typeof score === "number" ? score : Number(score);
  if (!Number.isFinite(scoreN)) return null;
  return { ...base, score: scoreN };
}
