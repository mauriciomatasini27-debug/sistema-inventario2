// P1-28: un solo escritor de las claves de outbox de /venta por pantalla.
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

// P1-30: la vuelta a la pestaña drena como online, salvo el harness worst.
export function debeDrenarPorVisibilidad(visibilityState: string, esHarnessWorst: boolean): boolean {
  return visibilityState === "visible" && !esHarnessWorst;
}

export interface DepsDrenado {
  storage: StorageCola;
  tenantId: string | null;
  enviar(item: ItemCola): Promise<RespuestaPush>;
  promover?: (item: ItemCola) => Promise<{ ticket_definitivo?: string }>;
}

export interface ResultadoDrenado {
  tenant: ResultadoColaVenta;
  legado: ResultadoColaVenta | null;
}

export interface DrenadoUnico {
  drenar(): Promise<ResultadoDrenado>;
}

interface Vuelo {
  otra: boolean;
  readonly promesa: Promise<ResultadoDrenado>;
}

function tenantNormalizado(tenantId: string | null): string | null {
  return tenantId ? tenantId : null;
}

function depsDeClave(deps: DepsDrenado, clave: string) {
  return {
    leer: () => JSON.parse(deps.storage.getItem(clave) ?? "[]") as ItemCola[],
    escribir: (items: ItemCola[]) => deps.storage.setItem(clave, JSON.stringify(items)),
    enviar: deps.enviar,
    ...(deps.promover ? { promover: deps.promover } : {}),
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
          tickets: [...acumulado.legado.tickets, ...paso.legado.tickets],
        }
      : paso.legado
    : acumulado.legado;
  return {
    tenant: {
      confirmados: acumulado.tenant.confirmados + paso.tenant.confirmados,
      sensibles: acumulado.tenant.sensibles + paso.tenant.sensibles,
      pendientes: paso.tenant.pendientes,
      cortado: paso.tenant.cortado,
      tickets: [...acumulado.tenant.tickets, ...paso.tenant.tickets],
    },
    legado,
  };
}

async function pasada(deps: DepsDrenado): Promise<ResultadoDrenado> {
  const tenantId = tenantNormalizado(deps.tenantId);
  if (!tenantId) {
    const tenant = await sincronizarColaVenta(depsDeClave(deps, claveOutboxCola(null)));
    return { tenant, legado: null };
  }

  let legado: ResultadoColaVenta | null = null;
  try {
    const crudo = JSON.parse(deps.storage.getItem(CLAVE_LEGADA_OUTBOX) ?? "[]") as unknown;
    if (Array.isArray(crudo) && crudo.length > 0) {
      const rl = await sincronizarColaVenta(depsDeClave(deps, CLAVE_LEGADA_OUTBOX));
      legado = rl;
      if (rl.confirmados > 0 && rl.pendientes === 0) {
        deps.storage.removeItem(CLAVE_LEGADA_OUTBOX);
        deps.storage.removeItem(CLAVE_LEGADA_SEQ);
      }
    }
  } catch (error) {
    console.warn("[venta] cola legada", error);
  }

  const tenant = await sincronizarColaVenta(depsDeClave(deps, claveOutboxCola(tenantId)));
  return { tenant, legado };
}

export function drenadoUnico(deps: DepsDrenado): DrenadoUnico {
  let vuelo: Vuelo | null = null;

  async function cadena(caja: Vuelo): Promise<ResultadoDrenado> {
    caja.otra = false;
    let acumulado = await pasada(deps);
    while (caja.otra) {
      caja.otra = false;
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
      let liberar!: (r: ResultadoDrenado) => void;
      let fallar!: (e: unknown) => void;
      const promesa = new Promise<ResultadoDrenado>((ok, ko) => {
        liberar = ok;
        fallar = ko;
      });
      const caja: Vuelo = { otra: false, promesa };
      vuelo = caja;
      void cadena(caja)
        .then(liberar, fallar)
        .finally(() => {
          if (vuelo === caja) vuelo = null;
        });
      return promesa;
    },
  };
}

function sinMovimiento(r: ResultadoColaVenta): boolean {
  return r.confirmados === 0 && r.pendientes === 0 && !r.cortado && r.sensibles === 0;
}

function textoTenant(r: ResultadoColaVenta): string {
  if (r.cortado) return `sync cortado: ${r.pendientes} pendiente(s)`;
  if (r.sensibles > 0) return `Necesita conexión (${r.sensibles} sensible(s) solo online)`;
  const base = `sync intentado (${r.confirmados})`;
  if (r.tickets.length === 0) return base;
  return `${base} · ${r.tickets.join(" · ")}`;
}

export function textoDeDrenado(origen: OrigenDrenado, resultado: ResultadoDrenado): string | null {
  if (origen === "linea") {
    const legadoQuieto = resultado.legado === null || sinMovimiento(resultado.legado);
    if (sinMovimiento(resultado.tenant) && legadoQuieto) return null;
  }
  return textoTenant(resultado.tenant);
}
