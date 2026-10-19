import { crear_arca_provider, crear_arca_provider_desde_env } from "../modules/fiscal/arca-provider.js";
import { crear_homo_fake } from "../modules/fiscal/homo-fake.js";
import type { FiscalProvider } from "../modules/fiscal/fiscal.js";

// Única elección de proveedor fiscal: ARCA real si el entorno tiene cert y
// clave, homo fake en desarrollo y tests. Rutas y jobs comparten esta función
// para no divergir en qué ambiente factura cada camino.
export function resolverProvider(env: Record<string, string | undefined> = process.env): FiscalProvider {
  const cfg = crear_arca_provider_desde_env(env);
  return cfg ? crear_arca_provider(cfg) : crear_homo_fake();
}
