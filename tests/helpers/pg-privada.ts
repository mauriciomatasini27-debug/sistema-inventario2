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
// aplica las migraciones (idempotente, sin borrar nada). El archivo que la
// usa deja de leer y escribir las bases compartidas A/B, así sus corridas
// globales (fan-out) no tocan filas de otros archivos en paralelo.
export async function asegurarBasePrivada(nombreDb: string, urlReferencia: string): Promise<string> {
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
  execFileSync("npm", ["run", "db:migrate"], {
    env: { ...process.env, TENANT_DATABASE_URL: url },
    stdio: "pipe",
  });
  return url;
}
