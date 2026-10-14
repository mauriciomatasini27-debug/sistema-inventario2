import { esModoMulti } from "../tenant-mode.js";
import { BaseNoDisponible } from "../server-db.js";
import { store } from "../store.js";
import type { Ajuste } from "../../modules/pricing/precios.js";

// Puerto ARQ-S4: la elección memoria-vs-DB se cierra una sola vez en la
// factoría de abajo. Quien llama usa el puerto y nunca vuelve a preguntar el
// modo para este camino dual.
export interface Almacen<T> {
  obtener(clave: string): T | undefined;
  guardar(clave: string, valor: T): void;
  contiene(clave: string): boolean;
  comoMapaSoloLectura(): ReadonlyMap<string, T>;
  anteFalloPersistencia(error: unknown): void;
}

function crearAlmacenMemoria<T>(mapa: Map<string, T>, anteFallo: (error: unknown) => void): Almacen<T> {
  return {
    obtener: (clave) => mapa.get(clave),
    guardar: (clave, valor) => {
      mapa.set(clave, valor);
    },
    contiene: (clave) => mapa.has(clave),
    comoMapaSoloLectura: () => mapa,
    anteFalloPersistencia: anteFallo,
  };
}

function aBaseNoDisponible(e: unknown): BaseNoDisponible {
  return e instanceof BaseNoDisponible ? e : new BaseNoDisponible();
}

// Corte 1: solo ajustes. En multi el fallo de DB se propaga como
// BaseNoDisponible; en single la llamada sigue hacia memoria.
export function crearAlmacenAjustes(): Almacen<Ajuste> {
  const mapa = store.ajustes;
  if (esModoMulti()) {
    return crearAlmacenMemoria(mapa, (e) => {
      throw aBaseNoDisponible(e);
    });
  }
  return crearAlmacenMemoria(mapa, () => {});
}
