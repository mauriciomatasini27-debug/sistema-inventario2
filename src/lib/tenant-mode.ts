import { AsyncLocalStorage } from "node:async_hooks";
import { leerVarEntorno } from "./env.js";

// Por qué separado de tenant-context: db.ts lo necesita y no debe importar
// store/control (evita ciclo db -> store -> ... -> db).
export function esModoMulti(env: NodeJS.ProcessEnv = process.env): boolean {
  return leerVarEntorno("TENANT_MODE", env) === "multi";
}

// ADR-0116: una Postgres compartida con tenant_id. No redefine single/slice0.
export function esModoShared(env: NodeJS.ProcessEnv = process.env): boolean {
  return leerVarEntorno("TENANT_MODE", env) === "shared";
}

// multi = URL por id; shared = una URL + filas con dueño. Ambos exigen tenant
// en el request (no slice0).
export function esModoAisladoPorTenant(env: NodeJS.ProcessEnv = process.env): boolean {
  const m = leerVarEntorno("TENANT_MODE", env);
  return m === "multi" || m === "shared";
}

export function tenantPorDefecto(env: NodeJS.ProcessEnv = process.env): string {
  return leerVarEntorno("DEFAULT_TENANT_ID", env) || "slice0";
}

// Por qué AsyncLocalStorage: más de 40 llamadas llegan a getTenantDb sin
// tenant; el middleware fija el contexto una vez por request (ADR-0051).
const almacenamiento = new AsyncLocalStorage<string>();

export function conTenant<T>(tenantId: string, fn: () => T): T {
  return almacenamiento.run(tenantId, fn);
}

export function tenantActual(): string | undefined {
  return almacenamiento.getStore();
}
