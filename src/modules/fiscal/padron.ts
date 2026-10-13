// Padrón Etapa 3 stub homo (FE-S9, ADR-0018 D7).
// Prod usa ws_sr_constancia_inscripcion / a13 con mismo cert/computador.
// Nunca bloquea la venta: si cae, se vende con condición declarada.
import { validar_cuit } from "./fiscal.js";

export interface PadronDato {
  readonly razon: string;
  readonly domicilio: string;
  readonly condIva: number;
}

export interface PadronProvider {
  constancia(cuit: string): Promise<PadronDato | null>;
}

export function crear_padron_stub_homo(): PadronProvider {
  const fijos = new Map<string, PadronDato>([
    ["20933331726", { razon: "RI Homo SA", domicilio: "Homo 123", condIva: 1 }],
    ["27293331729", { razon: "Monotributo Homo", domicilio: "Homo 456", condIva: 6 }],
  ]);
  return {
    async constancia(cuit: string) {
      const d = cuit.replace(/\D/g, "");
      if (!validar_cuit(d)) return null;
      return fijos.get(d) ?? null;
    },
  };
}
