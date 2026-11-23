export type TipoAccion = "precio" | "stock_inicial" | "sugerido" | "todo_al_dia";

export type TipoPaso = Exclude<TipoAccion, "todo_al_dia">;

export interface PasoCola {
  readonly tipo: TipoPaso;
  readonly total: number;
}

export interface EntradaProximaAccion {
  readonly totalPrecioPendiente: number;
  readonly totalStockInicialPendiente: number;
  readonly sugeridoVigente: boolean;
  readonly puedeCrearProductos: boolean;
  readonly avisoMinimo: boolean;
}

export interface ProximaAccion {
  readonly tipo: TipoAccion;
  readonly quedan: number;
  readonly pasos: readonly PasoCola[];
  readonly indice: number;
  readonly mostrarIndicador: boolean;
  readonly avisoMinimo: boolean;
}

export function derivarProximaAccion(entrada: EntradaProximaAccion): ProximaAccion {
  const pasos: PasoCola[] = [];
  if (entrada.totalPrecioPendiente > 0) {
    pasos.push({ tipo: "precio", total: entrada.totalPrecioPendiente });
  }
  if (entrada.totalStockInicialPendiente > 0) {
    pasos.push({ tipo: "stock_inicial", total: entrada.totalStockInicialPendiente });
  }
  if (entrada.sugeridoVigente && entrada.puedeCrearProductos) {
    pasos.push({ tipo: "sugerido", total: 1 });
  }
  if (pasos.length === 0) {
    return {
      tipo: "todo_al_dia",
      quedan: 0,
      pasos: [],
      indice: 0,
      mostrarIndicador: false,
      avisoMinimo: entrada.avisoMinimo,
    };
  }
  return {
    tipo: pasos[0]!.tipo,
    quedan: pasos.reduce((total, paso) => total + paso.total, 0),
    pasos,
    indice: 1,
    mostrarIndicador: pasos.length > 1,
    avisoMinimo: entrada.avisoMinimo,
  };
}
