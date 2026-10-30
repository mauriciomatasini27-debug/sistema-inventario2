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

// FE-S28 / #45: la fila de la venta y SQL quedan fuera de este ítem, así que el aviso dura lo que dura el proceso.
const avisosPorTenant = new Map<string, Map<string, readonly AvisoRegimen[]>>();

export function registrar_entrega(input: RegistrarEntregaInput): EntregaSinFactura {
  const evaluado = evaluar_cuestionario(input.cuestionario);
  const avisos = evaluado.avisos.slice();
  let porVenta = avisosPorTenant.get(input.tenantId);
  if (porVenta === undefined) {
    porVenta = new Map();
    avisosPorTenant.set(input.tenantId, porVenta);
  }
  porVenta.set(input.saleId, avisos);
  return {
    constancia: emitir_constancia(),
    avisos: avisos.slice(),
    emite: evaluado.emite,
  };
}

export function leer_avisos_entrega(clave: ClaveEntrega): readonly AvisoRegimen[] | undefined {
  return avisosPorTenant.get(clave.tenantId)?.get(clave.saleId)?.slice();
}
