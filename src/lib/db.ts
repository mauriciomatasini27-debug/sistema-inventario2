import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const clients = new Map<string, ReturnType<typeof postgres>>();
const dbs = new Map<string, ReturnType<typeof drizzlePg>>();

function clientFor(url: string) {
  let c = clients.get(url);
  if (!c) {
    // 6543 no soporta prepared statements. Supabase exige TLS fuera de local.
    const isTxPooler = url.includes(":6543");
    const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
    c = postgres(url, {
      max: isLocal ? 10 : isTxPooler ? 1 : 5,
      prepare: !isTxPooler,
      ssl: isLocal ? false : "require",
    });
    clients.set(url, c);
  }
  return c;
}

function dbFor(url: string) {
  let d = dbs.get(url);
  if (!d) {
    d = drizzlePg(clientFor(url));
    dbs.set(url, d);
  }
  return d;
}

// Por qué lazy: Astro importa este módulo en build sin env/DB; conectar a nivel
// superior rompería `astro build` y mezclaría pools entre tenants.
export function getControlDb() {
  const url = process.env.CONTROL_DATABASE_URL;
  if (!url) throw new Error("Falta CONTROL_DATABASE_URL");
  return dbFor(url);
}

// Por qué por env y no por parámetro libre: la variable la resuelve el servidor
// desde control (ADR-0002); el cliente nunca elige la base (evita cross-tenant).
export function getTenantDb(tenantId?: string) {
  const key = tenantId ? `TENANT_DATABASE_URL_${tenantId}` : "TENANT_DATABASE_URL";
  const url = (tenantId && process.env[key]) || process.env.TENANT_DATABASE_URL;
  if (!url) throw new Error("Falta TENANT_DATABASE_URL");
  return dbFor(url);
}
