import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { esModoMulti, esModoShared, tenantActual } from "./tenant-mode.js";

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
      // Una base caída no puede colgar un job o una request 30s (default de
      // postgres.js): local falla en 3s, remoto da margen al TLS.
      connect_timeout: isLocal ? 3 : 10,
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

// P1-68: en multi el alta no inventa UUID. Reclama un id cuya URL ya está
// en el proceso (Vercel no crea bases). Sin cupo libre el alta responde 503.
export function reclamarIdBaseLibre(
  ocupados: ReadonlySet<string>,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  for (const id of idsConBasePropia(env)) {
    if (!ocupados.has(id)) return id;
  }
  return null;
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
  // ADR-0116: shared siempre abre TENANT_DATABASE_URL. El filtro por fila es C3.
  if (esModoShared()) {
    if (!resuelto) throw new Error("Falta tenant");
    const url = process.env.TENANT_DATABASE_URL;
    if (!url) throw new Error("Falta TENANT_DATABASE_URL");
    return dbFor(url);
  }
  const key = resuelto ? `TENANT_DATABASE_URL_${resuelto}` : "TENANT_DATABASE_URL";
  const url = (resuelto && process.env[key]) || process.env.TENANT_DATABASE_URL;
  if (!url) throw new Error("Falta TENANT_DATABASE_URL");
  return dbFor(url);
}

// P1-73/P1-76: webhook MP en shared sin comercio en contexto usa TENANT_PLATAFORMA_SHARED.
export function getSharedDbPlataforma() {
  if (!esModoShared()) throw new Error("getSharedDbPlataforma solo en TENANT_MODE=shared");
  const url = process.env.TENANT_DATABASE_URL;
  if (!url) throw new Error("Falta TENANT_DATABASE_URL");
  return dbFor(url);
}
