import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { esModoMulti, tenantActual } from "./tenant-mode.js";

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

// #68: el webhook busca un número sin saber el comercio. La URL vive acá
// (ISO AT4); el repo solo recibe el id.
const PREFIJO_BASE_TENANT = "TENANT_DATABASE_URL_";

export function idsConBasePropia(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env)
    .filter((k) => k.startsWith(PREFIJO_BASE_TENANT) && env[k])
    .map((k) => k.slice(PREFIJO_BASE_TENANT.length))
    .filter((id) => id.length > 0)
    .sort();
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
  // Por qué contexto: el middleware fija el tenant por request (ADR-0051);
  // el argumento explícito sigue valiendo cuando ya existe.
  const resuelto = tenantId ?? tenantActual();
  if (esModoMulti()) {
    // Por qué fail-closed: sin tenant (o sin base propia) caer a la
    // compartida mezcla comprobantes entre comercios (ISO-S2).
    if (!resuelto) throw new Error("Falta tenant");
    const propia = process.env[`TENANT_DATABASE_URL_${resuelto}`];
    if (!propia) throw new Error(`Falta TENANT_DATABASE_URL_${resuelto}`);
    return dbFor(propia);
  }
  const key = resuelto ? `TENANT_DATABASE_URL_${resuelto}` : "TENANT_DATABASE_URL";
  const url = (resuelto && process.env[key]) || process.env.TENANT_DATABASE_URL;
  if (!url) throw new Error("Falta TENANT_DATABASE_URL");
  return dbFor(url);
}
