// Fake homo para slice (ADR-0019): autoriza sin red ni certificado.
// El adaptador real WSAA/WSFEv1 (Fase 0: node-forge vs openssl) lo reemplaza
// implementando la misma interfaz FiscalProvider.
import type { ConsultaEsperada, FiscalProvider, PedidoAutorizable } from "./fiscal.js";

interface Registro {
  cae: string;
  docTipo: number;
  docNro: string;
  impTotal: string;
  cbteFch: string;
}

function clave(tipo: number, ptoVta: number, nro: number): string {
  return `${tipo}:${ptoVta}:${nro}`;
}

export function crear_padron_fake(): Map<string, { razon: string; condIva: number }> {
  return new Map([
    ["20933331726", { razon: "RI Homo SA", condIva: 1 }],
    ["27293331729", { razon: "Monotributo Homo", condIva: 6 }],
  ]);
}

export function crear_homo_fake(): FiscalProvider & { autorizados: Map<string, string> } {
  const autorizados = new Map<string, string>();
  const detalles = new Map<string, Registro>();
  return {
    autorizados,
    async get_ta() {
      return { token: "fake-token", sign: "fake-sign" };
    },
    async ultimo_autorizado(_cuit: string, ptoVta: number, cbteTipo: number) {
      // D4: FECompUltimoAutorizado por (PV, tipo) — solo esa serie.
      let max = 0;
      for (const k of autorizados.keys()) {
        const [t, p, n] = k.split(":").map(Number);
        if (t === cbteTipo && p === ptoVta && Number.isInteger(n) && (n as number) > max) max = n as number;
      }
      return max;
    },
    async autorizar_c(pedido: PedidoAutorizable) {
      const cae = String(10000000000000 + pedido.cbteHasta).padStart(14, "0").slice(-14);
      const k = clave(pedido.cbteTipo, pedido.ptoVta, pedido.cbteHasta);
      autorizados.set(k, cae);
      detalles.set(k, {
        cae,
        docTipo: pedido.docTipo,
        docNro: pedido.docNro.toString(),
        impTotal: pedido.impTotal.toString(),
        cbteFch: pedido.cbteFch,
      });
      return { cae, caeVto: `${pedido.cbteFch.slice(0, 4)}-${pedido.cbteFch.slice(4, 6)}-${pedido.cbteFch.slice(6, 8)}`, raw: { homo: true } };
    },
    async consultar(tipo: number, ptoVta: number, nro: number, esperado?: ConsultaEsperada) {
      const cae = autorizados.get(clave(tipo, ptoVta, nro));
      if (!cae) return { existe: false, coincide: false };
      // D5: coincide compara total, doc y fecha; sin esperado, legado (true).
      if (esperado === undefined) return { existe: true, coincide: true, cae };
      const d = detalles.get(clave(tipo, ptoVta, nro));
      const coincide =
        d !== undefined &&
        d.docTipo === esperado.docTipo &&
        d.docNro === esperado.docNro &&
        d.impTotal === esperado.impTotalCentavos.toString() &&
        d.cbteFch === esperado.cbteFch;
      return { existe: true, coincide, cae };
    },
  };
}
