import { leerVarEntorno } from "./env.js";

// Por qué separado de tenant-context: db.ts lo necesita y no debe importar
// store/control (evita ciclo db -> store -> ... -> db).
export function esModoMulti(env: NodeJS.ProcessEnv = process.env): boolean {
  return leerVarEntorno("TENANT_MODE", env) === "multi";
}

export function tenantPorDefecto(env: NodeJS.ProcessEnv = process.env): string {
  return leerVarEntorno("DEFAULT_TENANT_ID", env) || "slice0";
}
