import { crearAlmacenBotModulos } from "./_almacen.js";
import {
  MODULOS_BOT,
  defaultsDeRubro,
  resolverRubroBot,
  rubrosAvanzadosHabilitados,
  type ModuloBot,
} from "../../modules/bot/modulos-rubro.js";

// BOT-S1: persistencia de los módulos del bot por tenant a través del puerto
// Almacen. La tabla tenant_bot_modules queda pendiente de migración; hasta
// entonces la fuente es el espejo en memoria de control.
function ordenar(modulos: Iterable<string>): ModuloBot[] {
  const set = new Set(modulos);
  return MODULOS_BOT.filter((m) => set.has(m));
}

// Un tenant sin registro (alta previa a BOT-S1) conserva el bot de antes: todos
// los módulos prendidos. Recién al guardar o al terminar un alta nueva rige el rubro.
export function leerModulosBot(tenantId: string): ModuloBot[] {
  const previo = crearAlmacenBotModulos().obtener(tenantId);
  return previo ? ordenar(previo.activos) : [...MODULOS_BOT];
}

export function guardarModulosBot(tenantId: string, activos: readonly ModuloBot[]): void {
  crearAlmacenBotModulos().guardar(tenantId, { tenantId, activos: ordenar(activos) });
}

export function cambiarModuloBot(tenantId: string, modulo: ModuloBot, activo: boolean): ModuloBot[] {
  const set = new Set<string>(leerModulosBot(tenantId));
  if (activo) set.add(modulo);
  else set.delete(modulo);
  const next = ordenar(set);
  guardarModulosBot(tenantId, next);
  return next;
}

// Idempotente: si el tenant ya tiene módulos cargados no los pisa (el dueño
// pudo apagar uno después del alta). El rubro del onboarding se resuelve al
// rubro del bot y recién ahí se eligen los defaults.
export function aplicarDefaultsModulosBot(
  tenantId: string,
  rubroOnboarding: string,
  env: NodeJS.ProcessEnv = process.env,
): ModuloBot[] {
  const almacen = crearAlmacenBotModulos();
  const previo = almacen.obtener(tenantId);
  if (previo) return ordenar(previo.activos);
  const rubro = resolverRubroBot(rubroOnboarding);
  const defaults = defaultsDeRubro(rubro, { rubrosAvanzados: rubrosAvanzadosHabilitados(env) });
  guardarModulosBot(tenantId, defaults);
  return defaults;
}
