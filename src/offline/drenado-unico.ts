// P1-28: un vuelo por pantalla. Dos pasadas a la vez reescriben localStorage
// y pueden resucitar un op_id que la otra ya sacó. `otra` pide una pasada
// extra si alguien llama a drenar() mientras la primera sigue en curso.
import {
  CLAVE_LEGADA_OUTBOX,
  CLAVE_LEGADA_SEQ,
  claveOutboxCola,
  sincronizarColaVenta,
  type ItemCola,
  type RespuestaPush,
  type ResultadoColaVenta,
  type StorageCola,
} from "./cola-venta.js";

export type OrigenDrenado = "boton" | "linea";

export interface DepsDrenado {
  storage: StorageCola;
  // "" cuenta como null: sin tenant hay una sola pasada de la clave legada.
  tenantId: string | null;
  enviar(item: ItemCola): Promise<RespuestaPush>;
}

export interface ResultadoDrenado {
  tenant: ResultadoColaVenta;
  // null si no había tenant, o si slice0-outbox estaba vacía y no se llamó.
  legado: ResultadoColaVenta | null;
}

export interface DrenadoUnico {
  drenar(): Promise<ResultadoDrenado>;
}

interface Vuelo {
  otra: boolean;
  promesa: Promise<ResultadoDrenado>;
}

function depsDeClave(storage: StorageCola, clave: string, enviar: DepsDrenado["enviar"]) {
  return {
    leer: () => JSON.parse(storage.getItem(clave) ?? "[]") as ItemCola[],
    escribir: (items: ItemCola[]) => storage.setItem(clave, JSON.stringify(items)),
    enviar,
  };
}

function plegar(acumulado: ResultadoDrenado, paso: ResultadoDrenado): ResultadoDrenado {
  const legado = paso.legado
    ? acumulado.legado
      ? {
          confirmados: acumulado.legado.confirmados + paso.legado.confirmados,
          sensibles: acumulado.legado.sensibles + paso.legado.sensibles,
          pendientes: paso.legado.pendientes,
          cortado: paso.legado.cortado,
        }
      : paso.legado
    : acumulado.legado;
  return {
    tenant: {
      confirmados: acumulado.tenant.confirmados + paso.tenant.confirmados,
      sensibles: acumulado.tenant.sensibles + paso.tenant.sensibles,
      pendientes: paso.tenant.pendientes,
      cortado: paso.tenant.cortado,
    },
    legado,
  };
}

async function pasada(deps: DepsDrenado): Promise<ResultadoDrenado> {
  const tenantId = deps.tenantId ? deps.tenantId : null;
  if (!tenantId) {
    const tenant = await sincronizarColaVenta(depsDeClave(deps.storage, claveOutboxCola(null), deps.enviar));
    return { tenant, legado: null };
  }

  // P1-28: primero la cola legada (P10-14). Se borra solo si quedó vacía.
  // Un corte o un throw no frenan la cola del tenant.
  let legado: ResultadoColaVenta | null = null;
  try {
    const crudo = JSON.parse(deps.storage.getItem(CLAVE_LEGADA_OUTBOX) ?? "[]") as unknown;
    if (Array.isArray(crudo) && crudo.length > 0) {
      const rl = await sincronizarColaVenta(depsDeClave(deps.storage, CLAVE_LEGADA_OUTBOX, deps.enviar));
      legado = rl;
      if (rl.confirmados > 0 && rl.pendientes === 0) {
        deps.storage.removeItem(CLAVE_LEGADA_OUTBOX);
        deps.storage.removeItem(CLAVE_LEGADA_SEQ);
      }
    }
  } catch (error) {
    console.warn("[venta] cola legada", error);
  }

  const tenant = await sincronizarColaVenta(depsDeClave(deps.storage, claveOutboxCola(tenantId), deps.enviar));
  return { tenant, legado };
}

export function drenadoUnico(deps: DepsDrenado): DrenadoUnico {
  let vuelo: Vuelo | null = null;

  async function cadena(): Promise<ResultadoDrenado> {
    // Se limpia antes del await: un drenar() durante la pasada vuelve a marcarla.
    vuelo!.otra = false;
    let acumulado = await pasada(deps);
    while (vuelo!.otra) {
      vuelo!.otra = false;
      acumulado = plegar(acumulado, await pasada(deps));
    }
    return acumulado;
  }

  return {
    drenar() {
      if (vuelo) {
        vuelo.otra = true;
        return vuelo.promesa;
      }
      // La caja existe antes de arrancar: cadena lee vuelo antes del primer await.
      const caja: Vuelo = { otra: false, promesa: undefined as unknown as Promise<ResultadoDrenado> };
      vuelo = caja;
      caja.promesa = cadena().finally(() => {
        if (vuelo === caja) vuelo = null;
      });
      return caja.promesa;
    },
  };
}

function sinMovimiento(r: ResultadoColaVenta): boolean {
  return r.confirmados === 0 && r.pendientes === 0 && !r.cortado && r.sensibles === 0;
}

function textoTenant(r: ResultadoColaVenta): string {
  if (r.cortado) return `sync cortado: ${r.pendientes} pendiente(s)`;
  // SYNC-S7: lo sensible solo va online. Se avisa en vez de tratarlo como fallo de red.
  if (r.sensibles > 0) return `Necesita conexión (${r.sensibles} sensible(s) solo online)`;
  return `sync intentado (${r.confirmados})`;
}

// P1-28: el botón siempre pinta. La línea calla si ni el tenant ni la legada movieron nada,
// para que un online con la cola vacía no pise #estado.
export function textoDeDrenado(origen: OrigenDrenado, resultado: ResultadoDrenado): string | null {
  if (origen === "linea") {
    const legadoQuieto = resultado.legado === null || sinMovimiento(resultado.legado);
    if (sinMovimiento(resultado.tenant) && legadoQuieto) return null;
  }
  return textoTenant(resultado.tenant);
}
