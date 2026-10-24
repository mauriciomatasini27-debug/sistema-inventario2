// Worker fiscal slice (ADR-0019 + ADR-0018 D4/D5): toma un pendiente, asigna
// número, autoriza. Un comprobante por FECAESolicitar en C, estrictamente
// serial por (cuit, ptoVta, tipo) vía con_lock_fiscal (C1 monoproceso; en
// Postgres C2 es pg_advisory_xact_lock + fila fiscal_sequences).
import {
  armar_pedido_con_receptor,
  armar_qr_payload,
  MARCA_PRUEBA,
  resolver_consulta,
  siguiente_numero,
  type ConsultaEsperada,
  type FiscalProvider,
  type PedidoAutorizable,
} from "./fiscal.js";
import { clave_fiscal, con_lock_fiscal, liberar_en_vuelo, marcar_en_vuelo } from "./lock.js";
import {
  armar_pedido_b_con_alicuotas,
  desagregar_iva_21,
  parsear_meta_fes12,
} from "./iva.js";
import { proximo_intento } from "./backoff.js";
import { texto_castellano } from "./bandeja.js";
import type { StoredFiscalDoc } from "../../lib/store.js";

export interface WorkerInput {
  doc: StoredFiscalDoc;
  lastNumber: number;
  totalCentavos: bigint;
  cuit: number;
  provider: FiscalProvider;
  ahoraMs?: number;
}

function link_token(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function qr_para(doc: StoredFiscalDoc, cuit: number, nro: number, total: bigint, cae: string, tipo: number): string {
  return armar_qr_payload({
    fecha: `${doc.cbte_fch.slice(0, 4)}-${doc.cbte_fch.slice(4, 6)}-${doc.cbte_fch.slice(6, 8)}`,
    cuit,
    ptoVta: Number(doc.pto_vta),
    nroCmp: nro,
    importeCentavos: total,
    cae,
    tipoCmp: tipo,
  });
}

function representar(doc: StoredFiscalDoc, cae: string, caeVto: string | null, qr: string): StoredFiscalDoc {
  // Representación mínima: CAE + QR + marca de prueba + link token.
  return { ...doc, estado: "autorizado", cae, cae_vto: caeVto, qr_payload: qr, marca: MARCA_PRUEBA, link_token: link_token() };
}

function armar_pedido(input: WorkerInput, nro: number): PedidoAutorizable | null {
  const cbteTipo = Number(input.doc.cbte_tipo || "11");
  // FE-S12 (B/A) + FE-S14 (NC B/A) + FE-S16 (ND B/A): el pedido con IVA exige
  // neto + IVA que sumen el total. El doc guarda el desagregado al
  // vender/devolver; si falta (doc legacy) se deriva con 21%.
  // C, NC C (13) y ND C (12) van por con_receptor.
  if (cbteTipo === 6 || cbteTipo === 1 || cbteTipo === 8 || cbteTipo === 3 || cbteTipo === 7 || cbteTipo === 2) {
    const basePedido = {
      cbteTipo: cbteTipo as 6 | 1 | 8 | 3 | 7 | 2,
      totalCentavos: input.totalCentavos,
      ptoVta: Number(input.doc.pto_vta),
      cbteNro: nro,
      cbteFch: input.doc.cbte_fch,
      docTipo: Number(input.doc.doc_tipo || "99"),
      docNro: input.doc.doc_nro || "0",
      condIvaReceptor: Number(input.doc.cond_iva_receptor || "5"),
    };
    const meta = parsear_meta_fes12(input.doc.venta_leyenda);
    if (meta && meta.totalCobradoCentavos === input.totalCentavos) {
      return armar_pedido_b_con_alicuotas(basePedido, meta);
    }
    let neto: bigint | null = null;
    let iva: bigint | null = null;
    let alicId = Number(input.doc.alic_iva_id || "5");
    if (!Number.isInteger(alicId) || alicId < 1 || alicId > 9) alicId = 5;
    if (input.doc.imp_iva_centavos != null) {
      try {
        iva = BigInt(input.doc.imp_iva_centavos);
        neto = input.totalCentavos - iva;
      } catch {
        neto = null;
        iva = null;
      }
    }
    if (neto === null || iva === null || neto < 0n || iva < 0n || neto + iva !== input.totalCentavos) {
      const d = desagregar_iva_21(input.totalCentavos);
      if (!d) return null;
      neto = d.impNetoCentavos;
      iva = d.impIvaCentavos;
      alicId = d.alicId;
    }
    return armar_pedido_b_con_alicuotas(basePedido, {
      impNetoCentavos: neto,
      impIvaCentavos: iva,
      alicIva: [{ id: alicId, baseImpCentavos: neto, importeCentavos: iva }],
    });
  }
  // FE-S7/S8: el pedido sale de la clase + receptor guardados al vender.
  // Doc legacy sin esos campos (pre-S8) cae a C/CF por compatibilidad.
  return armar_pedido_con_receptor({
    saleId: input.doc.sale_id,
    totalCentavos: input.totalCentavos,
    ptoVta: Number(input.doc.pto_vta),
    cbteNro: nro,
    cbteFch: input.doc.cbte_fch,
    cbteTipo: Number(input.doc.cbte_tipo || "11"),
    docTipo: Number(input.doc.doc_tipo || "99"),
    docNro: input.doc.doc_nro || "0",
    condIvaReceptor: Number(input.doc.cond_iva_receptor || "5"),
  });
}

function programarReintento(doc: StoredFiscalDoc, intentosPrevios: number, ahoraMs: number): StoredFiscalDoc {
  const intentos = intentosPrevios + 1;
  // FE-S19: el primer paso del backoff es 30 s. Se cuenta el intento anterior,
  // no el ya incrementado, para no saltar a los 2 minutos.
  return {
    ...doc,
    estado: "pendiente",
    intentos,
    proximo_intento: new Date(proximo_intento(intentosPrevios, ahoraMs)).toISOString(),
    ultimo_error_codigo: "timeout",
    motivo_castellano: texto_castellano("timeout"),
  };
}

export async function procesar_pendiente(input: WorkerInput): Promise<{ doc: StoredFiscalDoc; lastNumber: number }> {
  const cbteTipo = Number(input.doc.cbte_tipo || "11");
  const ptoVta = Number(input.doc.pto_vta);
  const clave = clave_fiscal(input.cuit, input.doc.pto_vta, input.doc.cbte_tipo);
  const ahora = input.ahoraMs ?? Date.now();

  // D5: si otro doc retiene la secuencia (respuesta_incierta), retroceder a
  // pendiente sin consumir número. Llamadas concurrentes misma clave deben
  // usar procesar_pendiente_serializado (hace check+marca atómico).
  if (!marcar_en_vuelo(clave, input.doc.id)) {
    return { doc: { ...input.doc, estado: "pendiente" }, lastNumber: input.lastNumber };
  }

  // FE-S19: el 10016 ya reintentó una vez. Otra pasada no vuelve a ARCA.
  if (input.doc.ultimo_error_codigo === "10016") {
    liberar_en_vuelo(clave, input.doc.id);
    return {
      doc: { ...input.doc, estado: "rechazado", motivo_castellano: texto_castellano("10016") },
      lastNumber: input.lastNumber,
    };
  }

  const vence = input.doc.proximo_intento ? Date.parse(input.doc.proximo_intento) : Number.NaN;
  if (input.doc.cbte_nro != null && Number.isFinite(vence) && vence > ahora) {
    return { doc: input.doc, lastNumber: input.lastNumber };
  }

  // D5 retry: el doc ya numerado (respuesta_incierta retenida) reusa su nro;
  // nunca asigna uno nuevo para el mismo doc.
  // D4: número nuevo = max(secuencia local, FECompUltimoAutorizado) + 1. Si la
  // secuencia no está confirmada (emitido fuera del sistema), ARCA manda.
  let nro: number;
  let ultimo = input.lastNumber;
  if (input.doc.cbte_nro !== null && input.doc.cbte_nro !== undefined) {
    nro = input.doc.cbte_nro;
  } else {
    try {
      const u = await input.provider.ultimo_autorizado(String(input.cuit), ptoVta, cbteTipo);
      if (Number.isInteger(u) && u > ultimo) ultimo = u;
    } catch {
      // Sin FECompUltimoAutorizado (ARCA caído) se sigue con la local.
    }
    nro = siguiente_numero(ultimo);
  }

  const pedido = armar_pedido(input, nro);
  if (!pedido) {
    liberar_en_vuelo(clave, input.doc.id);
    return {
      doc: { ...input.doc, estado: "rechazado", ultimo_error_codigo: "pedido-invalido", motivo_castellano: texto_castellano("10015") },
      lastNumber: input.lastNumber,
    };
  }
  const esperado: ConsultaEsperada = {
    docTipo: pedido.docTipo,
    docNro: pedido.docNro.toString(),
    impTotalCentavos: pedido.impTotal,
    cbteFch: pedido.cbteFch,
  };
  const enviando: StoredFiscalDoc = { ...input.doc, cbte_nro: nro, estado: "respuesta_incierta" };

  // FE-S19: el reintento a los 30 s consulta antes de reenviar el mismo número.
  if (input.doc.cbte_nro != null && input.doc.ultimo_error_codigo === "timeout") {
    let consulta: { existe: boolean; coincide: boolean; cae?: string };
    try {
      consulta = await input.provider.consultar(pedido.cbteTipo, ptoVta, nro, esperado);
    } catch {
      return { doc: programarReintento(enviando, input.doc.intentos ?? 0, ahora), lastNumber: input.lastNumber };
    }
    const decision = resolver_consulta(consulta.existe, consulta.coincide);
    if (decision.decision === "tomar-cae" && consulta.cae) {
      const doc = representar(enviando, consulta.cae, null, qr_para(input.doc, input.cuit, nro, input.totalCentavos, consulta.cae, pedido.cbteTipo));
      liberar_en_vuelo(clave, input.doc.id);
      return { doc, lastNumber: Math.max(input.lastNumber, nro) };
    }
    if (decision.decision === "pausar-alerta") {
      return {
        doc: { ...enviando, estado: "pendiente", ultimo_error_codigo: "difiere", motivo_castellano: texto_castellano("10016") },
        lastNumber: input.lastNumber,
      };
    }
  }

  try {
    const r = await input.provider.autorizar_c(pedido, String(input.cuit));
    const doc = representar(enviando, r.cae, r.caeVto, qr_para(input.doc, input.cuit, nro, input.totalCentavos, r.cae, pedido.cbteTipo));
    liberar_en_vuelo(clave, input.doc.id);
    return { doc, lastNumber: Math.max(input.lastNumber, nro) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // FE-S19: 10016 resincroniza el último autorizado y reintenta una sola vez.
    if (msg.includes("10016")) {
      let nro2 = nro;
      try {
        const u = await input.provider.ultimo_autorizado(String(input.cuit), ptoVta, cbteTipo);
        if (Number.isInteger(u)) nro2 = siguiente_numero(Math.max(input.lastNumber, u));
      } catch {
        nro2 = nro;
      }
      const pedido2 = armar_pedido(input, nro2);
      if (!pedido2) {
        liberar_en_vuelo(clave, input.doc.id);
        return {
          doc: { ...enviando, estado: "rechazado", ultimo_error_codigo: "10016", motivo_castellano: texto_castellano("10016") },
          lastNumber: input.lastNumber,
        };
      }
      try {
        const r = await input.provider.autorizar_c(pedido2, String(input.cuit));
        const doc = representar(
          { ...enviando, cbte_nro: nro2 },
          r.cae,
          r.caeVto,
          qr_para(input.doc, input.cuit, nro2, input.totalCentavos, r.cae, pedido2.cbteTipo),
        );
        liberar_en_vuelo(clave, input.doc.id);
        return { doc, lastNumber: Math.max(input.lastNumber, nro2) };
      } catch {
        liberar_en_vuelo(clave, input.doc.id);
        return {
          doc: {
            ...enviando,
            cbte_nro: nro2,
            estado: "rechazado",
            intentos: (input.doc.intentos ?? 0) + 1,
            ultimo_error_codigo: "10016",
            motivo_castellano: texto_castellano("10016"),
          },
          lastNumber: input.lastNumber,
        };
      }
    }
    // Negocio (R: 10015/IVA receptor): no reintenta, bandeja con castellano.
    if (msg.includes("ARCA rechazo") || msg.includes("10015") || msg.includes("iva")) {
      const codigo = msg.includes("10016") ? "10016" : msg.includes("iva") ? "iva-receptor" : "10015";
      liberar_en_vuelo(clave, input.doc.id);
      return {
        doc: { ...enviando, estado: "rechazado", ultimo_error_codigo: codigo, motivo_castellano: texto_castellano(codigo) },
        lastNumber: input.lastNumber,
      };
    }
    // Timeout tras enviar → respuesta_incierta retenida → FECompConsultar con
    // total/doc/fecha antes de reenviar (D5). Nada se duplica.
    const c = await input.provider.consultar(pedido.cbteTipo, Number(input.doc.pto_vta), nro, esperado);
    const d = resolver_consulta(c.existe, c.coincide);
    if (d.decision === "tomar-cae" && c.cae) {
      const doc = representar(enviando, c.cae, null, qr_para(input.doc, input.cuit, nro, input.totalCentavos, c.cae, pedido.cbteTipo));
      liberar_en_vuelo(clave, input.doc.id);
      return { doc, lastNumber: Math.max(input.lastNumber, nro) };
    }
    const intentos = (input.doc.intentos ?? 0) + 1;
    if (d.decision === "reenviar-mismo-numero") {
      // D5 antes de reenviar: el candidato no existe, pero el hueco entre el
      // local y ARCA puede guardar una emisión propia con respuesta perdida
      // (solo doc fresco, sin número previo). Se concilia de más nuevo a más
      // viejo y el primero que coincide se toma en vez de reintentar.
      if (input.doc.cbte_nro === null || input.doc.cbte_nro === undefined) {
        for (let g = ultimo; g > input.lastNumber; g--) {
          const gc = await input.provider.consultar(cbteTipo, ptoVta, g, esperado);
          if (gc.existe && gc.coincide && gc.cae) {
            const doc = representar(
              { ...input.doc, cbte_nro: g, estado: "respuesta_incierta" },
              gc.cae,
              null,
              qr_para(input.doc, input.cuit, g, input.totalCentavos, gc.cae, cbteTipo),
            );
            liberar_en_vuelo(clave, input.doc.id);
            return { doc, lastNumber: Math.max(input.lastNumber, g) };
          }
        }
      }
      // El número queda reservado: el lock no se suelta hasta conciliar o reenviar.
      return {
        doc: programarReintento(enviando, input.doc.intentos ?? 0, ahora),
        lastNumber: input.lastNumber,
      };
    }
    // Difiere: pausa + alerta, lock retenido hasta resolución manual
    // (liberar_en_vuelo). El nro queda tomado por el comprobante ajeno.
    return {
      doc: { ...enviando, estado: "pendiente", intentos, ultimo_error_codigo: "difiere", motivo_castellano: texto_castellano("10016") },
      lastNumber: input.lastNumber,
    };
  }
}

// Vía serializada: estrictamente un comprobante por (cuit, PV, tipo) a la vez
// (D4). Es la que cuenta N..N+9 sin huecos ante 10 ventas simultáneas.
export function procesar_pendiente_serializado(input: WorkerInput): Promise<{ doc: StoredFiscalDoc; lastNumber: number }> {
  return con_lock_fiscal(clave_fiscal(input.cuit, input.doc.pto_vta, input.doc.cbte_tipo), () => procesar_pendiente(input));
}

export type HallazgoConciliacion =
  | { readonly nro: number; readonly accion: "cae-recuperado"; readonly cae: string }
  | { readonly nro: number; readonly accion: "emitido-fuera-del-sistema" }
  | { readonly nro: number; readonly accion: "ausente" };

// FE-S19: el job diario recorre lo que ARCA autorizó después del último local.
export async function conciliarSerieDiaria(args: {
  ultimoLocal: number;
  cbteTipo: number;
  ptoVta: number;
  cuit: string;
  provider: FiscalProvider;
  esperadoPorNro: ReadonlyMap<number, ConsultaEsperada>;
}): Promise<{ ultimoArca: number; hallazgos: HallazgoConciliacion[] }> {
  const ultimoArca = await args.provider.ultimo_autorizado(args.cuit, args.ptoVta, args.cbteTipo);
  const hallazgos: HallazgoConciliacion[] = [];
  if (!Number.isInteger(ultimoArca) || ultimoArca <= args.ultimoLocal) return { ultimoArca, hallazgos };
  for (let nro = args.ultimoLocal + 1; nro <= ultimoArca; nro += 1) {
    const esperado = args.esperadoPorNro.get(nro);
    const consulta = esperado
      ? await args.provider.consultar(args.cbteTipo, args.ptoVta, nro, esperado)
      : await args.provider.consultar(args.cbteTipo, args.ptoVta, nro);
    if (!consulta.existe) {
      hallazgos.push({ nro, accion: "ausente" });
      continue;
    }
    if (esperado && consulta.coincide && consulta.cae) {
      hallazgos.push({ nro, accion: "cae-recuperado", cae: consulta.cae });
      continue;
    }
    hallazgos.push({ nro, accion: "emitido-fuera-del-sistema" });
  }
  return { ultimoArca, hallazgos };
}
