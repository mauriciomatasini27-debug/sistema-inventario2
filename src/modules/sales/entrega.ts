import {
  emitir_constancia,
  evaluar_cuestionario,
  type AvisoRegimen,
  type ConstanciaEntrega,
  type CuestionarioEntrega,
} from "../fiscal/entrega.js";

export interface ClaveEntrega {
  readonly tenantId: string;
  readonly saleId: string;
}

export interface RegistrarEntregaInput extends ClaveEntrega {
  readonly cuestionario: CuestionarioEntrega;
}

export interface EntregaSinFactura {
  readonly constancia: ConstanciaEntrega;
  readonly avisos: readonly AvisoRegimen[];
  readonly emite: false;
}

type AvisosEntregaEnMemoria = Map<string, Map<string, readonly AvisoRegimen[]>>;

const avisosEntregaEnMemoria: AvisosEntregaEnMemoria = new Map();

export function registrar_entrega(input: RegistrarEntregaInput): EntregaSinFactura {
  const evaluado = evaluar_cuestionario(input.cuestionario);
  const avisos = evaluado.avisos.slice();
  let porVenta = avisosEntregaEnMemoria.get(input.tenantId);
  if (porVenta === undefined) {
    porVenta = new Map();
    avisosEntregaEnMemoria.set(input.tenantId, porVenta);
  }
  porVenta.set(input.saleId, avisos);
  return {
    constancia: emitir_constancia(),
    avisos: avisos.slice(),
    emite: evaluado.emite,
  };
}

export function leer_avisos_entrega(clave: ClaveEntrega): readonly AvisoRegimen[] | undefined {
  return avisosEntregaEnMemoria.get(clave.tenantId)?.get(clave.saleId)?.slice();
}
