// Núcleo fiscal puro slice mínimo (ADR-0019, FE-S7/S8/S10/S11).
// Sin IO, sin Drizzle: decide todo, persiste nada. Mismo patrón que vender_mostrador.
export const CBTE_TIPO_C = 11 as const;
export const CBTE_TIPO_B = 6 as const;
export const CBTE_TIPO_A = 1 as const;
// NC misma clase (FE-S14): C→13, B→8, A→3, con CbtesAsoc obligatorio.
// ND manual Dueño (FE-S16): C→12, B→7, A→2, con CbtesAsoc + caja asociada.
export const CBTE_NC_C = 13 as const;
export const CBTE_NC_B = 8 as const;
export const CBTE_NC_A = 3 as const;
export const CBTE_ND_C = 12 as const;
export const CBTE_ND_B = 7 as const;
export const CBTE_ND_A = 2 as const;

export function clase_nc_desde_factura(
  tipoFactura: number,
): typeof CBTE_NC_C | typeof CBTE_NC_B | typeof CBTE_NC_A | null {
  if (tipoFactura === CBTE_TIPO_C) return CBTE_NC_C;
  if (tipoFactura === CBTE_TIPO_B) return CBTE_NC_B;
  if (tipoFactura === CBTE_TIPO_A) return CBTE_NC_A;
  return null;
}

export interface CbtesAsoc {
  readonly tipo: number;
  readonly ptoVta: number;
  readonly nro: number;
}

export function idempotency_key_for_return(returnId: string, cbteTipo: number): string {
  return `return:${returnId}:${cbteTipo}`;
}

export function clase_nd_desde_factura(
  tipoFactura: number,
): typeof CBTE_ND_C | typeof CBTE_ND_B | typeof CBTE_ND_A | null {
  if (tipoFactura === CBTE_TIPO_C) return CBTE_ND_C;
  if (tipoFactura === CBTE_TIPO_B) return CBTE_ND_B;
  if (tipoFactura === CBTE_TIPO_A) return CBTE_ND_A;
  return null;
}

export function idempotency_key_for_nd(ndId: string, cbteTipo: number): string {
  return `nd:${ndId}:${cbteTipo}`;
}
export const CONCEPTO_PRODUCTOS = 1 as const;
export const DOC_TIPO_CF = 99 as const;
export const DOC_TIPO_CUIT = 80 as const;
export const COND_IVA_CF = 5 as const;
// Tabla vigente ARCA (FEParamGetCondicionIvaReceptor, manual WSFEv1 v4.8):
// 11 IDs con clase; lo fuera de la tabla se rechaza con condicion_invalida.
export interface CondicionIvaReceptor {
  readonly id: number;
  readonly desc: string;
  readonly clases: "A/M/C" | "B/C";
}
export const CONDICIONES_IVA_RECEPTOR: ReadonlyArray<CondicionIvaReceptor> = [
  { id: 1, desc: "IVA Responsable Inscripto", clases: "A/M/C" },
  { id: 4, desc: "IVA Sujeto Exento", clases: "B/C" },
  { id: 5, desc: "Consumidor Final", clases: "B/C" },
  { id: 6, desc: "Responsable Monotributo", clases: "A/M/C" },
  { id: 7, desc: "Sujeto No Categorizado", clases: "B/C" },
  { id: 8, desc: "Proveedor del Exterior", clases: "B/C" },
  { id: 9, desc: "Cliente del Exterior", clases: "B/C" },
  { id: 10, desc: "IVA Liberado – Ley N° 19.640", clases: "B/C" },
  { id: 13, desc: "Monotributista Social", clases: "A/M/C" },
  { id: 15, desc: "IVA No Alcanzado", clases: "B/C" },
  { id: 16, desc: "Monotributo Trabajador Independiente Promovido", clases: "A/M/C" },
] as const;
export function condicion_iva_receptor_valida(id: number): boolean {
  return CONDICIONES_IVA_RECEPTOR.some((c) => c.id === id);
}
// Umbral identificación RG 5700/5866: $10.000.000 exacta ya exige DNI.
// En DB vive en fiscal_params (no hardcodeado en ruta); esta const es el
// default del núcleo puro para tests y slice.
export const UMBRAL_DNI_CENTAVOS = 1_000_000_000n as const;
export const MON_ID_PES = "PES" as const;
export const QR_BASE = "https://www.arca.gob.ar/fe/qr/?p=" as const;
// Representación mínima del slice (ADR-0019): la factura homo lleva marca de
// prueba + link token; el ticket muestra `Factura C PV-Nro` con link, nunca el
// CAE como factura. En prod (endurecimiento FE-E5/E6/E7) la marca se retira.
export const MARCA_PRUEBA = "PRUEBA - SIN VALIDEZ FISCAL" as const;

export function idempotency_key_for_sale(saleId: string): string {
  return idempotency_key_for_sale_tipo(saleId, CBTE_TIPO_C);
}

export function idempotency_key_for_sale_tipo(saleId: string, cbteTipo: number): string {
  return `sale:${saleId}:${cbteTipo}`;
}

// FE-S7. Letra la decide el sistema; monotributo nunca ve selector.
// null = fuera del slice (RI etapa 1-2 a RI → lista de espera, NC/ND).
export type CondicionEmisor = "monotributo" | "exento" | "responsable_inscripto";
export type CondicionReceptor = "consumidor_final" | "exento" | "no_categorizado" | "responsable_inscripto" | "monotributo";

export function determinar_clase(
  emisor: CondicionEmisor,
  receptor: CondicionReceptor,
  etapa: 1 | 2 | 3,
): typeof CBTE_TIPO_C | typeof CBTE_TIPO_B | typeof CBTE_TIPO_A | null {
  if (emisor === "monotributo" || emisor === "exento") return CBTE_TIPO_C;
  if (etapa < 2) return null;
  if (receptor === "consumidor_final" || receptor === "exento" || receptor === "no_categorizado") return CBTE_TIPO_B;
  // FE-E2 etapa 3: RI a RI con CUIT obligatorio es A (1).
  if (etapa >= 3 && receptor === "responsable_inscripto") return CBTE_TIPO_A;
  return null;
}

export interface ReceptorInput {
  readonly totalCentavos: bigint;
  readonly offline: boolean;
  readonly cuit?: string | undefined;
  /** Condición IVA receptor declarada (RG 5616, 1-9) cuando hay CUIT a pedido. */
  readonly condIvaReceptor?: number | undefined;
}

export type ReceptorResuelto =
  | { readonly ok: true; readonly docTipo: typeof DOC_TIPO_CF | typeof DOC_TIPO_CUIT; readonly docNro: string; readonly condIvaReceptor: number }
  | { readonly ok: false; readonly codigo: "pide_dni" | "en_espera_de_datos" | "cuit_invalido" | "condicion_invalida" };

// FE-S8. Sin datos y bajo umbral → CF por defecto. Sobre umbral sin DNI:
// online bloquea (pide_dni), offline queda en_espera_de_datos (FE-E6 la
// muestra en bandeja Dueño). Con CUIT a pedido valida dígito + condición.
export function resolver_receptor(input: ReceptorInput): ReceptorResuelto {
  if (input.cuit !== undefined) {
    if (!validar_cuit(input.cuit)) return { ok: false, codigo: "cuit_invalido" };
    const cond = input.condIvaReceptor;
    if (cond === undefined || !condicion_iva_receptor_valida(cond)) {
      return { ok: false, codigo: "condicion_invalida" };
    }
    return { ok: true, docTipo: DOC_TIPO_CUIT, docNro: input.cuit.replace(/\D/g, ""), condIvaReceptor: cond };
  }
  if (input.totalCentavos >= UMBRAL_DNI_CENTAVOS) {
    return input.offline ? { ok: false, codigo: "en_espera_de_datos" } : { ok: false, codigo: "pide_dni" };
  }
  return { ok: true, docTipo: DOC_TIPO_CF, docNro: "0", condIvaReceptor: COND_IVA_CF };
}

export function siguiente_numero(last: number): number {
  return last + 1;
}

const CUIT_PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export function validar_cuit(cuit: string): boolean {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return false;
  let acc = 0;
  for (let i = 0; i < 10; i++) acc += Number(d[i]) * CUIT_PESOS[i]!;
  const mod = acc % 11;
  const ver = mod === 0 ? 0 : mod === 1 ? 9 : 11 - mod;
  return ver === Number(d[10]);
}

export interface PedidoCInput {
  readonly saleId: string;
  readonly totalCentavos: bigint;
  readonly ptoVta: number;
  readonly cbteNro: number;
  readonly cbteFch: string;
}

export interface PedidoC {
  readonly cbteTipo: number;
  readonly ptoVta: number;
  readonly cbteDesde: number;
  readonly cbteHasta: number;
  readonly cbteFch: string;
  readonly concepto: typeof CONCEPTO_PRODUCTOS;
  readonly docTipo: number;
  readonly docNro: bigint;
  readonly condIvaReceptor: number;
  readonly impTotal: bigint;
  readonly impNeto: bigint;
  readonly monId: typeof MON_ID_PES;
  readonly monCotiz: 1;
}

export function armar_pedido_c(input: PedidoCInput): PedidoC | null {
  if (input.totalCentavos <= 0n) return null;
  if (!Number.isInteger(input.ptoVta) || input.ptoVta < 1 || input.ptoVta > 99998) return null;
  if (!Number.isInteger(input.cbteNro) || input.cbteNro < 1) return null;
  if (!/^\d{8}$/.test(input.cbteFch)) return null;
  return {
    cbteTipo: CBTE_TIPO_C,
    ptoVta: input.ptoVta,
    cbteDesde: input.cbteNro,
    cbteHasta: input.cbteNro,
    cbteFch: input.cbteFch,
    concepto: CONCEPTO_PRODUCTOS,
    docTipo: DOC_TIPO_CF,
    docNro: 0n,
    condIvaReceptor: COND_IVA_CF,
    impTotal: input.totalCentavos,
    impNeto: input.totalCentavos,
    monId: MON_ID_PES,
    monCotiz: 1,
  };
}

export interface QrInput {
  readonly fecha: string;
  readonly cuit: number;
  readonly ptoVta: number;
  readonly nroCmp: number;
  readonly importeCentavos: bigint;
  readonly cae: string;
  readonly tipoCmp?: number | undefined;
}

export function armar_qr_payload(input: QrInput): string {
  const importe = Number(input.importeCentavos) / 100;
  const json = {
    ver: 1,
    fecha: input.fecha,
    cuit: input.cuit,
    ptoVta: input.ptoVta,
    tipoCmp: input.tipoCmp ?? CBTE_TIPO_C,
    nroCmp: input.nroCmp,
    importe,
    moneda: MON_ID_PES,
    ctz: 1,
    tipoDocRec: DOC_TIPO_CF,
    nroDocRec: 0,
    tipoCodAut: "E",
    codAut: input.cae,
  };
  return QR_BASE + Buffer.from(JSON.stringify(json), "utf-8").toString("base64");
}

export interface PedidoConReceptorInput extends PedidoCInput {
  readonly cbteTipo: number;
  readonly docTipo: number;
  readonly docNro: string;
  readonly condIvaReceptor: number;
}

// Generaliza armar_pedido_c para FE-S7/S8: clase decidida por
// determinar_clase + receptor por resolver_receptor. C por defecto sigue
// por armar_pedido_c (sin cambios). 6/11 en el slice; 13 (NC C) replica C;
// A/NC/ND fuera de este constructor (usan armar_pedido_b con IVA o quedan null).
export function armar_pedido_con_receptor(input: PedidoConReceptorInput): PedidoC | null {
  if (input.totalCentavos <= 0n) return null;
  if (!Number.isInteger(input.ptoVta) || input.ptoVta < 1 || input.ptoVta > 99998) return null;
  if (!Number.isInteger(input.cbteNro) || input.cbteNro < 1) return null;
  if (!/^\d{8}$/.test(input.cbteFch)) return null;
  if (
    input.cbteTipo !== CBTE_TIPO_C &&
    input.cbteTipo !== CBTE_TIPO_B &&
    input.cbteTipo !== CBTE_NC_C &&
    input.cbteTipo !== CBTE_ND_C
  )
    return null;
  if (!condicion_iva_receptor_valida(input.condIvaReceptor)) return null;
  if (input.docTipo === DOC_TIPO_CF) {
    if (input.docNro !== "0") return null;
    return {
      cbteTipo: input.cbteTipo,
      ptoVta: input.ptoVta,
      cbteDesde: input.cbteNro,
      cbteHasta: input.cbteNro,
      cbteFch: input.cbteFch,
      concepto: CONCEPTO_PRODUCTOS,
      docTipo: DOC_TIPO_CF,
      docNro: 0n,
      condIvaReceptor: input.condIvaReceptor,
      impTotal: input.totalCentavos,
      impNeto: input.totalCentavos,
      monId: MON_ID_PES,
      monCotiz: 1,
    };
  }
  if (input.docTipo === DOC_TIPO_CUIT) {
    if (!validar_cuit(input.docNro)) return null;
    return {
      cbteTipo: input.cbteTipo,
      ptoVta: input.ptoVta,
      cbteDesde: input.cbteNro,
      cbteHasta: input.cbteNro,
      cbteFch: input.cbteFch,
      concepto: CONCEPTO_PRODUCTOS,
      docTipo: DOC_TIPO_CUIT,
      docNro: BigInt(input.docNro.replace(/\D/g, "")),
      condIvaReceptor: input.condIvaReceptor,
      impTotal: input.totalCentavos,
      impNeto: input.totalCentavos,
      monId: MON_ID_PES,
      monCotiz: 1,
    };
  }
  return null;
}

export type ConsultaCoincide =
  | { readonly decision: "tomar-cae" }
  | { readonly decision: "reenviar-mismo-numero" }
  | { readonly decision: "pausar-alerta" };

export function resolver_consulta(existe: boolean, coincide: boolean): ConsultaCoincide {
  if (!existe) return { decision: "reenviar-mismo-numero" };
  if (coincide) return { decision: "tomar-cae" };
  return { decision: "pausar-alerta" };
}

export interface AlicIvaItem {
  readonly id: number;
  readonly baseImpCentavos: bigint;
  readonly importeCentavos: bigint;
}

// Pedido B/A con IVA (FE-S12/FE-E2) y sus NC (FE-S14): total con IVA
// incluido, neto + IVA discriminados y AlicIva para FECAESolicitar.
// C y NC C (13) siguen por armar_pedido_c / con_receptor sin IVA.
// A (1) y NC A (3) exigen DocTipo CUIT; B (6) y NC B (8) aceptan CF o CUIT.
export interface PedidoB {
  readonly cbteTipo:
    | typeof CBTE_TIPO_B
    | typeof CBTE_TIPO_A
    | typeof CBTE_NC_B
    | typeof CBTE_NC_A
    | typeof CBTE_ND_B
    | typeof CBTE_ND_A;
  readonly ptoVta: number;
  readonly cbteDesde: number;
  readonly cbteHasta: number;
  readonly cbteFch: string;
  readonly concepto: typeof CONCEPTO_PRODUCTOS;
  readonly docTipo: number;
  readonly docNro: bigint;
  readonly condIvaReceptor: number;
  readonly impTotal: bigint;
  readonly impNeto: bigint;
  readonly impIVA: bigint;
  readonly impOpEx: 0n;
  readonly impTrib: 0n;
  readonly monId: typeof MON_ID_PES;
  readonly monCotiz: 1;
  readonly alicIva: ReadonlyArray<AlicIvaItem>;
}

export interface PedidoBInput {
  readonly totalCentavos: bigint;
  readonly ptoVta: number;
  readonly cbteNro: number;
  readonly cbteFch: string;
  readonly docTipo: number;
  readonly docNro: string;
  readonly condIvaReceptor: number;
  readonly impNetoCentavos: bigint;
  readonly impIvaCentavos: bigint;
  readonly alicId: number;
  readonly cbteTipo?:
    | typeof CBTE_TIPO_B
    | typeof CBTE_TIPO_A
    | typeof CBTE_NC_B
    | typeof CBTE_NC_A
    | typeof CBTE_ND_B
    | typeof CBTE_ND_A
    | undefined;
}

export function armar_pedido_b(input: PedidoBInput): PedidoB | null {
  const cbteTipo = input.cbteTipo ?? CBTE_TIPO_B;
  if (
    cbteTipo !== CBTE_TIPO_B &&
    cbteTipo !== CBTE_TIPO_A &&
    cbteTipo !== CBTE_NC_B &&
    cbteTipo !== CBTE_NC_A &&
    cbteTipo !== CBTE_ND_B &&
    cbteTipo !== CBTE_ND_A
  )
    return null;
  if (input.totalCentavos <= 0n) return null;
  if (!Number.isInteger(input.ptoVta) || input.ptoVta < 1 || input.ptoVta > 99998) return null;
  if (!Number.isInteger(input.cbteNro) || input.cbteNro < 1) return null;
  if (!/^\d{8}$/.test(input.cbteFch)) return null;
  if (!condicion_iva_receptor_valida(input.condIvaReceptor)) return null;
  if (!Number.isInteger(input.alicId) || input.alicId < 1 || input.alicId > 9) return null;
  if (input.impNetoCentavos < 0n || input.impIvaCentavos < 0n) return null;
  if (input.impNetoCentavos + input.impIvaCentavos !== input.totalCentavos) return null;
  // A, NC A y ND A son solo entre responsables: CUIT obligatorio, nunca CF.
  if ((cbteTipo === CBTE_TIPO_A || cbteTipo === CBTE_NC_A || cbteTipo === CBTE_ND_A) && input.docTipo !== DOC_TIPO_CUIT)
    return null;
  let docNro: bigint;
  if (input.docTipo === DOC_TIPO_CF) {
    if (input.docNro !== "0") return null;
    docNro = 0n;
  } else if (input.docTipo === DOC_TIPO_CUIT) {
    if (!validar_cuit(input.docNro)) return null;
    docNro = BigInt(input.docNro.replace(/\D/g, ""));
  } else {
    return null;
  }
  return {
    cbteTipo,
    ptoVta: input.ptoVta,
    cbteDesde: input.cbteNro,
    cbteHasta: input.cbteNro,
    cbteFch: input.cbteFch,
    concepto: CONCEPTO_PRODUCTOS,
    docTipo: input.docTipo,
    docNro,
    condIvaReceptor: input.condIvaReceptor,
    impTotal: input.totalCentavos,
    impNeto: input.impNetoCentavos,
    impIVA: input.impIvaCentavos,
    impOpEx: 0n,
    impTrib: 0n,
    monId: MON_ID_PES,
    monCotiz: 1,
    alicIva: [{ id: input.alicId, baseImpCentavos: input.impNetoCentavos, importeCentavos: input.impIvaCentavos }],
  };
}

export type PedidoAutorizable = PedidoC | PedidoB;

// D5: lo que FECompConsultar debe coincidir para tomar el CAE (total, doc,
// fecha). Sin estos datos la consulta solo dice si existe (legado).
export interface ConsultaEsperada {
  readonly docTipo: number;
  readonly docNro: string;
  readonly impTotalCentavos: bigint;
  readonly cbteFch: string;
}

export interface FiscalProvider {
  get_ta(): Promise<{ token: string; sign: string }>;
  ultimo_autorizado(cuit: string, ptoVta: number, cbteTipo: number): Promise<number>;
  autorizar_c(pedido: PedidoAutorizable, authCuit: string): Promise<{ cae: string; caeVto: string; raw: unknown }>;
  consultar(
    cbteTipo: number,
    ptoVta: number,
    nro: number,
    esperado?: ConsultaEsperada,
  ): Promise<{ existe: boolean; coincide: boolean; cae?: string }>;
}
