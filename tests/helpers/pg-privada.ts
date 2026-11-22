import { execFileSync } from "node:child_process";
import postgres from "postgres";

function esNombreDbValido(nombre: string): boolean {
  return /^[a-z][a-z0-9_]{0,62}$/.test(nombre);
}

function urlConDb(urlReferencia: string, nombreDb: string): string {
  const u = new URL(urlReferencia);
  u.pathname = `/${nombreDb}`;
  return u.toString();
}

// Base privada para un archivo de tests con Postgres: la crea si falta y le
// aplica las migraciones (idempotente). El archivo que la usa deja de leer y
// escribir las bases compartidas A/B, así sus corridas globales (fan-out) no
// tocan filas de otros archivos en paralelo.
// `prefijos` (RETRO-AUD-03) limpia las filas de corridas anteriores de esos SKUs:
// la base privada sobrevive entre `npm run verify`, y dejar basura hace que
// un test que cuenta filas falle en la segunda corrida.
export async function asegurarBasePrivada(nombreDb: string, urlReferencia: string, prefijos: readonly string[] = []): Promise<string> {
  if (!esNombreDbValido(nombreDb)) throw new Error(`nombre de base inválido: ${nombreDb}`);
  if (!urlReferencia) throw new Error("falta URL de referencia");
  const url = urlConDb(urlReferencia, nombreDb);
  const mantenimiento = urlConDb(urlReferencia, "postgres");
  const admin = postgres(mantenimiento, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${nombreDb}"`);
  } catch (e) {
    if (typeof e !== "object" || e === null || !("code" in e) || e.code !== "42P04") throw e;
  } finally {
    await admin.end();
  }
  // P1-81: el wrapper P1-69 tolera tablas ausentes y aplica 0047; drizzle-kit crudo falla en el mismo camino.
  execFileSync("node", ["scripts/db-migrate.mjs"], {
    env: { ...process.env, TENANT_DATABASE_URL: url },
    stdio: "pipe",
  });
  if (prefijos.length > 0) {
    const sql = postgres(url, { max: 1 });
    try {
      for (const prefijo of prefijos) {
        // ORDEN FK: movimientos y lotes referencian products.sku.
        for (const tabla of ["stock_movements", "stock_lots", "products"]) {
          await sql.unsafe(`DELETE FROM ${tabla} WHERE sku LIKE $1`, [prefijo]);
        }
      }
    } finally {
      await sql.end();
    }
  }
  return url;
}
