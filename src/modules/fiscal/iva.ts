// IVA para Factura B (FE-S12, ADR-0018 D7).
// Núcleo puro: desagrega un total cobrado (IVA incluido) en neto + IVA por
// alícuota, con prorrateo mayor-resto. Sin IO, sin Drizzle.
import {
  CONCEPTO_PRODUCTOS,
  DOC_TIPO_CF,
  DOC_TIPO_CUIT,
  MON_ID_PES,
  armar_pedido_b,
  condicion_iva_receptor_valida,
  validar_cuit,
  type PedidoB,
  type PedidoBInput,
} from "./fiscal.js";

export const ALIC_IVA_21_ID = 5 as const;
export const ALIC_IVA_21_TASA_NUM = 21 as const;
export const ALIC_IVA_21_TASA_DEN = 121 as const;

export interface DesagregadoIva {
  readonly impNetoCentavos: bigint;
  readonly impIvaCentavos: bigint;
  readonly impTotalCentavos: bigint;
  readonly alicId: number;
  readonly baseImpCentavos: bigint;
  readonly importeIvaCentavos: bigint;
}

export interface AlicIvaDesglose {
  readonly id: number;
  readonly baseImpCentavos: bigint;
  readonly importeCentavos: bigint;
}

export interface LineaRepresentacionFeS12 {
  readonly tipo: "producto" | "promo" | "combo";
  readonly texto: string;
  readonly importeCentavos: bigint;
}

export interface DesgloseFeS12 {
  readonly totalCobradoCentavos: bigint;
  readonly impNetoCentavos: bigint;
  readonly impIvaCentavos: bigint;
  readonly alicIva: ReadonlyArray<AlicIvaDesglose>;
  readonly representacion: ReadonlyArray<LineaRepresentacionFeS12>;
}

export interface ProductoFeS12 {
  readonly etiqueta: string;
  readonly cantidad: number;
  readonly precioListaCentavos: bigint;
  readonly alicIvaId: number;
}

export interface ComboFeS12 {
  readonly nombre: string;
  readonly totalCobradoCentavos: bigint;
  readonly componentes: ReadonlyArray<{
    readonly etiqueta: string;
    readonly precioListaCentavos: bigint;
    readonly alicIvaId: number;
  }>;
}

export interface EntradaCalculoFeS12 {
  readonly totalCobradoCentavos: bigint;
  readonly productos: ReadonlyArray<ProductoFeS12>;
  readonly promo?: { readonly etiqueta: string; readonly ahorroCentavos: bigint };
  readonly combo?: ComboFeS12;
}

export type EventoFacturacionFeS12 = "venta_cobrada" | "venta_a_cuenta" | "cobro_fiado";

// FE-S12: la venta a cuenta factura al confirmar; el cobro del fiado no abre otro comprobante.
export function debe_encolar_factura_fes12(evento: EventoFacturacionFeS12): boolean {
  return evento !== "cobro_fiado";
}

export function tasa_iva_por_alicuota(alicId: number): { readonly num: number; readonly den: number } | null {
  if (alicId === ALIC_IVA_21_ID) return { num: ALIC_IVA_21_TASA_NUM, den: ALIC_IVA_21_TASA_DEN };
  if (alicId === 4) return { num: 105, den: 1105 };
  return null;
}

// Desagrega total (IVA incluido) con tasa num/den sobre el total.
// Redondeo half-up a centavo: iva = (total*num + den/2) / den.
export function desagregar_iva(
  totalCentavos: bigint,
  alicId: number,
  tasaNum: number,
  tasaDen: number,
): DesagregadoIva | null {
  if (totalCentavos <= 0n) return null;
  if (!Number.isInteger(alicId) || alicId < 1 || alicId > 9) return null;
  if (!Number.isInteger(tasaNum) || tasaNum < 0 || !Number.isInteger(tasaDen) || tasaDen <= 0) return null;
  const num = BigInt(tasaNum);
  const den = BigInt(tasaDen);
  const iva = (totalCentavos * num + den / 2n) / den;
  const neto = totalCentavos - iva;
  if (neto < 0n || iva < 0n) return null;
  if (neto + iva !== totalCentavos) return null;
  return {
    impNetoCentavos: neto,
    impIvaCentavos: iva,
    impTotalCentavos: totalCentavos,
    alicId,
    baseImpCentavos: neto,
    importeIvaCentavos: iva,
  };
}

// Atajo B por defecto: 21% (Id 5). El total facturado ya incluye el IVA.
export function desagregar_iva_21(totalCentavos: bigint): DesagregadoIva | null {
  return desagregar_iva(totalCentavos, ALIC_IVA_21_ID, ALIC_IVA_21_TASA_NUM, ALIC_IVA_21_TASA_DEN);
}

function prorratear_mayor_resto(totalExacto: bigint, bases: ReadonlyArray<bigint>): bigint[] | null {
  const totalBases = bases.reduce((acc, b) => acc + b, 0n);
  if (totalExacto < 0n) return null;
  if (totalExacto === 0n) return bases.map(() => 0n);
  if (totalBases <= 0n) return null;
  const pisos: bigint[] = [];
  const restos: Array<{ idx: number; resto: bigint }> = [];
  let sumaPisos = 0n;
  for (let i = 0; i < bases.length; i++) {
    const base = bases[i] as bigint;
    const num = base * totalExacto;
    const piso = num / totalBases;
    pisos.push(piso);
    restos.push({ idx: i, resto: num % totalBases });
    sumaPisos += piso;
  }
  let sueltos = totalExacto - sumaPisos;
  restos.sort((a, b) => {
    if (a.resto !== b.resto) return a.resto > b.resto ? -1 : 1;
    return a.idx - b.idx;
  });
  const out = [...pisos];
  for (const r of restos) {
    if (sueltos <= 0n) break;
    out[r.idx] = (out[r.idx] as bigint) + 1n;
    sueltos -= 1n;
  }
  return out;
}

function brutoProducto(p: ProductoFeS12): bigint {
  return BigInt(p.cantidad) * p.precioListaCentavos;
}

export function calcular_fes12(
  entrada: EntradaCalculoFeS12,
): { ok: true; desglose: DesgloseFeS12 } | { ok: false; error: string } {
  if (entrada.totalCobradoCentavos <= 0n) return { ok: false, error: "total inválido" };
  if (entrada.productos.length === 0 && !entrada.combo) return { ok: false, error: "sin líneas" };

  const brutosProducto = entrada.productos.map(brutoProducto);
  const listaProductos = brutosProducto.reduce((a, b) => a + b, 0n);
  const comboCobrado = entrada.combo?.totalCobradoCentavos ?? 0n;
  let ahorro =
    entrada.promo?.ahorroCentavos ?? listaProductos + comboCobrado - entrada.totalCobradoCentavos;
  if (ahorro < 0n) return { ok: false, error: "el total cobrado supera el precio de lista" };
  if (ahorro > listaProductos) return { ok: false, error: "promo mayor al bruto de productos" };
  if (listaProductos - ahorro + comboCobrado !== entrada.totalCobradoCentavos) {
    return { ok: false, error: "total cobrado no coincide con lista, promo y combo" };
  }

  const repartoAhorro = listaProductos > 0n ? prorratear_mayor_resto(ahorro, brutosProducto) : null;
  if (ahorro > 0n && listaProductos > 0n && repartoAhorro === null) return { ok: false, error: "promo inválida" };

  const cobradoPorAlic = new Map<number, bigint>();
  const representacion: LineaRepresentacionFeS12[] = [];

  for (let i = 0; i < entrada.productos.length; i++) {
    const p = entrada.productos[i] as ProductoFeS12;
    const bruto = brutosProducto[i] as bigint;
    const desc = repartoAhorro ? (repartoAhorro[i] as bigint) : 0n;
    const cobrado = bruto - desc;
    if (cobrado < 0n) return { ok: false, error: "cobrado negativo" };
    cobradoPorAlic.set(p.alicIvaId, (cobradoPorAlic.get(p.alicIvaId) ?? 0n) + cobrado);
    representacion.push({
      tipo: "producto",
      texto: `${p.etiqueta} × ${p.cantidad}`,
      importeCentavos: bruto,
    });
  }

  if (ahorro > 0n) {
    representacion.push({
      tipo: "promo",
      texto: entrada.promo?.etiqueta ?? "Promo",
      importeCentavos: -ahorro,
    });
  }

  if (entrada.combo) {
    const listas = entrada.combo.componentes.map((c) => c.precioListaCentavos);
    const partes = prorratear_mayor_resto(entrada.combo.totalCobradoCentavos, listas);
    if (!partes) return { ok: false, error: "combo inválido" };
    const nombres = entrada.combo.componentes.map((c) => c.etiqueta).join(" + ");
    representacion.push({
      tipo: "combo",
      texto: `${entrada.combo.nombre}: ${nombres}`,
      importeCentavos: entrada.combo.totalCobradoCentavos,
    });
    for (let i = 0; i < entrada.combo.componentes.length; i++) {
      const c = entrada.combo.componentes[i] as ComboFeS12["componentes"][number];
      const parte = partes[i] as bigint;
      cobradoPorAlic.set(c.alicIvaId, (cobradoPorAlic.get(c.alicIvaId) ?? 0n) + parte);
    }
  }

  const alicIva: AlicIvaDesglose[] = [];
  let impNeto = 0n;
  let impIva = 0n;
  for (const [alicId, subtotal] of [...cobradoPorAlic.entries()].sort((a, b) => a[0] - b[0])) {
    if (subtotal <= 0n) continue;
    const tasa = tasa_iva_por_alicuota(alicId);
    if (!tasa) return { ok: false, error: "alícuota desconocida" };
    const d = desagregar_iva(subtotal, alicId, tasa.num, tasa.den);
    if (!d) return { ok: false, error: "desglose IVA inválido" };
    alicIva.push({ id: alicId, baseImpCentavos: d.baseImpCentavos, importeCentavos: d.importeIvaCentavos });
    impNeto += d.impNetoCentavos;
    impIva += d.impIvaCentavos;
  }

  if (impNeto + impIva !== entrada.totalCobradoCentavos) {
    return { ok: false, error: "bases más IVA no igualan el total" };
  }

  return {
    ok: true,
    desglose: {
      totalCobradoCentavos: entrada.totalCobradoCentavos,
      impNetoCentavos: impNeto,
      impIvaCentavos: impIva,
      alicIva,
      representacion,
    },
  };
}

export interface MetaFeS12Persistida {
  readonly impNetoCentavos: string;
  readonly impIvaCentavos: string;
  readonly alicIva: ReadonlyArray<{ readonly id: number; readonly base: string; readonly importe: string }>;
  readonly representacion: ReadonlyArray<{ readonly tipo: string; readonly texto: string; readonly importe: string }>;
}

export function serializar_meta_fes12(desglose: DesgloseFeS12): string {
  const meta: MetaFeS12Persistida = {
    impNetoCentavos: desglose.impNetoCentavos.toString(),
    impIvaCentavos: desglose.impIvaCentavos.toString(),
    alicIva: desglose.alicIva.map((a) => ({
      id: a.id,
      base: a.baseImpCentavos.toString(),
      importe: a.importeCentavos.toString(),
    })),
    representacion: desglose.representacion.map((l) => ({
      tipo: l.tipo,
      texto: l.texto,
      importe: l.importeCentavos.toString(),
    })),
  };
  return JSON.stringify({ fe_s12: meta });
}

export function parsear_meta_fes12(leyenda: string | null | undefined): DesgloseFeS12 | null {
  if (!leyenda) return null;
  try {
    const raw = JSON.parse(leyenda) as { fe_s12?: MetaFeS12Persistida };
    const m = raw.fe_s12;
    if (!m) return null;
    const impNeto = BigInt(m.impNetoCentavos);
    const impIva = BigInt(m.impIvaCentavos);
    const alicIva = m.alicIva.map((a) => ({
      id: a.id,
      baseImpCentavos: BigInt(a.base),
      importeCentavos: BigInt(a.importe),
    }));
    const representacion = m.representacion.map((l) => ({
      tipo: l.tipo as LineaRepresentacionFeS12["tipo"],
      texto: l.texto,
      importeCentavos: BigInt(l.importe),
    }));
    const total = impNeto + impIva;
    return {
      totalCobradoCentavos: total,
      impNetoCentavos: impNeto,
      impIvaCentavos: impIva,
      alicIva,
      representacion,
    };
  } catch {
    return null;
  }
}

type PedidoBBase = Omit<PedidoBInput, "impNetoCentavos" | "impIvaCentavos" | "alicId">;

// FE-S12: varias alícuotas en un mismo pedido B/A (ARCA recibe solo ImpTotal).
export function armar_pedido_b_con_alicuotas(
  input: PedidoBBase,
  desglose: Pick<DesgloseFeS12, "impNetoCentavos" | "impIvaCentavos" | "alicIva">,
): PedidoB | null {
  if (desglose.alicIva.length === 1) {
    const unica = desglose.alicIva[0] as AlicIvaDesglose;
    return armar_pedido_b({
      ...input,
      impNetoCentavos: desglose.impNetoCentavos,
      impIvaCentavos: desglose.impIvaCentavos,
      alicId: unica.id,
    });
  }
  const cbteTipo = input.cbteTipo ?? 6;
  if (input.totalCentavos <= 0n) return null;
  if (!Number.isInteger(input.ptoVta) || input.ptoVta < 1 || input.ptoVta > 99998) return null;
  if (!Number.isInteger(input.cbteNro) || input.cbteNro < 1) return null;
  if (!/^\d{8}$/.test(input.cbteFch)) return null;
  if (!condicion_iva_receptor_valida(input.condIvaReceptor)) return null;
  if (desglose.impNetoCentavos < 0n || desglose.impIvaCentavos < 0n) return null;
  if (desglose.impNetoCentavos + desglose.impIvaCentavos !== input.totalCentavos) return null;
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
  const alicIva = desglose.alicIva.map((a) => ({
    id: a.id,
    baseImpCentavos: a.baseImpCentavos,
    importeCentavos: a.importeCentavos,
  }));
  const sumaBases = alicIva.reduce((acc, a) => acc + a.baseImpCentavos, 0n);
  const sumaIva = alicIva.reduce((acc, a) => acc + a.importeCentavos, 0n);
  if (sumaBases !== desglose.impNetoCentavos || sumaIva !== desglose.impIvaCentavos) return null;

  return {
    cbteTipo: cbteTipo as PedidoB["cbteTipo"],
    ptoVta: input.ptoVta,
    cbteDesde: input.cbteNro,
    cbteHasta: input.cbteNro,
    cbteFch: input.cbteFch,
    concepto: CONCEPTO_PRODUCTOS,
    docTipo: input.docTipo,
    docNro,
    condIvaReceptor: input.condIvaReceptor,
    impTotal: input.totalCentavos,
    impNeto: desglose.impNetoCentavos,
    impIVA: desglose.impIvaCentavos,
    impOpEx: 0n,
    impTrib: 0n,
    monId: MON_ID_PES,
    monCotiz: 1,
    alicIva,
  };
}
