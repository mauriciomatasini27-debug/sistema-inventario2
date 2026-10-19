export interface ItemCola {
  op_id: string;
  device_code: string;
  device_seq: number;
  payload: unknown;
}

export interface RespuestaPush {
  status: number;
  cuerpo: unknown;
}

export interface DepsColaVenta {
  leer(): ItemCola[];
  escribir(items: ItemCola[]): void;
  enviar(item: ItemCola): Promise<RespuestaPush>;
}

export interface ResultadoColaVenta {
  confirmados: number;
  pendientes: number;
  sensibles: number;
  cortado: boolean;
}

function esRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function contarSensibles(cuerpo: unknown): number {
  const lista: unknown[] = esRecord(cuerpo) && Array.isArray(cuerpo["resultados"]) ? cuerpo["resultados"] : [cuerpo];
  let n = 0;
  for (const uno of lista) {
    if (esRecord(uno) && uno["resultado"] === "necesita_conexion") n += 1;
  }
  return n;
}

export function quitarConfirmados(cola: ItemCola[], confirmados: ItemCola[]): ItemCola[] {
  const ids = new Set(confirmados.map((i) => i.op_id));
  return cola.filter((i) => !ids.has(i.op_id));
}

export async function sincronizarColaVenta(deps: DepsColaVenta): Promise<ResultadoColaVenta> {
  const cola = deps.leer();
  const confirmados: ItemCola[] = [];
  let sensibles = 0;
  let cortado = false;
  for (const item of cola) {
    let r: RespuestaPush;
    try {
      r = await deps.enviar(item);
    } catch (error) {
      console.warn("[cola-venta] push sin red", item.op_id, error);
      cortado = true;
      break;
    }
    if (r.status < 200 || r.status >= 300) {
      console.warn("[cola-venta] push no confirmado", item.op_id, r.status);
      cortado = true;
      break;
    }
    confirmados.push(item);
    sensibles += contarSensibles(r.cuerpo);
  }
  const restantes = quitarConfirmados(deps.leer(), confirmados);
  deps.escribir(restantes);
  return { confirmados: confirmados.length, pendientes: restantes.length, sensibles, cortado };
}
