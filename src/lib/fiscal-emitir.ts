import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { fiscalDocuments, fiscalSequences } from "../db/schema-fiscal.js";
import { leerFiscalDocPorId, type TenantDb } from "./fiscal-db.js";
import { store as memoria, type StoredFiscalDoc } from "./store.js";
import { procesar_pendiente } from "../modules/fiscal/worker.js";
import { clave_fiscal, liberar_en_vuelo } from "../modules/fiscal/lock.js";
import {
  armar_qr_payload,
  MARCA_PRUEBA,
  resolver_consulta,
  type FiscalProvider,
} from "../modules/fiscal/fiscal.js";

export interface SequenceKey {
  readonly puntoVenta: string;
  readonly cbteTipo: string;
}

export function claveDeDoc(doc: StoredFiscalDoc): SequenceKey {
  return { puntoVenta: doc.pto_vta, cbteTipo: doc.cbte_tipo };
}

export type EmisionDurable =
  | { readonly salida: "autorizado"; readonly doc: StoredFiscalDoc }
  | { readonly salida: "rechazado"; readonly doc: StoredFiscalDoc }
  | { readonly salida: "pendiente-retry"; readonly doc: StoredFiscalDoc }
  | { readonly salida: "respuesta_incierta"; readonly doc: StoredFiscalDoc }
  | { readonly salida: "difiere"; readonly doc: StoredFiscalDoc }
  | { readonly salida: "ocupado"; readonly doc: StoredFiscalDoc };

export interface ContextoEmision {
  readonly docId: string;
  readonly cuit: number;
  readonly provider: FiscalProvider;
}

export interface Reclamo {
  readonly doc: StoredFiscalDoc;
  readonly lastNumber: number;
}

export type FallaReclamo = "ocupado" | "inexistente" | "no-facturar" | "no-reintentable";

export type ResultadoReclamo =
  | { readonly ok: true; readonly reclamo: Reclamo }
  | { readonly ok: false; readonly motivo: FallaReclamo; readonly doc: StoredFiscalDoc | null };

export interface ResultadoWorker {
  readonly doc: StoredFiscalDoc;
  readonly lastNumber: number;
}

export interface SecuenciaFiscal {
  readonly puntoVenta: string;
  readonly cbteTipo: string;
  readonly lastNumber: number;
}

export interface PuertoFiscalDurable {
  claim(ctx: ContextoEmision): Promise<ResultadoReclamo>;
  store(ctx: ContextoEmision, resultado: ResultadoWorker): Promise<EmisionDurable>;
  release(cuit: number, clave: SequenceKey, docId: string): Promise<void>;
  listar_varados(): Promise<ReadonlyArray<StoredFiscalDoc>>;
  listar_secuencias(): Promise<ReadonlyArray<SecuenciaFiscal>>;
}

function esUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function totalDe(doc: StoredFiscalDoc): bigint {
  try {
    return BigInt(doc.imp_total_centavos ?? "0");
  } catch {
    return 0n;
  }
}

function textoClave(cuit: number, clave: SequenceKey): string {
  return clave_fiscal(cuit, clave.puntoVenta, clave.cbteTipo);
}

function sqlCandado(texto: string) {
  return sql`select pg_advisory_xact_lock(hashtext(${texto}))`;
}

function espejar(doc: StoredFiscalDoc): void {
  memoria.fiscalDocs.set(doc.idempotency_key, doc);
}

function tokenLocal(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clasificar(doc: StoredFiscalDoc): EmisionDurable["salida"] {
  if (doc.estado === "autorizado") return "autorizado";
  if (doc.estado === "rechazado") return "rechazado";
  if (doc.estado === "respuesta_incierta") return "respuesta_incierta";
  if (doc.ultimo_error_codigo === "difiere") return "difiere";
  if (doc.proximo_intento !== null && doc.proximo_intento !== undefined) return "pendiente-retry";
  return "ocupado";
}

async function ultimoRemoto(ctx: ContextoEmision, clave: SequenceKey): Promise<number> {
  try {
    const u = await ctx.provider.ultimo_autorizado(String(ctx.cuit), Number(clave.puntoVenta), Number(clave.cbteTipo));
    return Number.isInteger(u) ? u : 0;
  } catch {
    return 0;
  }
}

function porIdMemoria(docId: string): StoredFiscalDoc | null {
  for (const d of memoria.fiscalDocs.values()) {
    if (d.id === docId) return d;
  }
  return null;
}

export function puertoPostgres(db: TenantDb): PuertoFiscalDurable {
  async function claim(ctx: ContextoEmision): Promise<ResultadoReclamo> {
    const doc = await leerFiscalDocPorId(db, ctx.docId);
    if (!doc) return { ok: false, motivo: "inexistente", doc: null };
    if (doc.no_facturar) return { ok: false, motivo: "no-facturar", doc };
    if (doc.estado !== "pendiente" && doc.estado !== "respuesta_incierta") {
      return { ok: false, motivo: "no-reintentable", doc };
    }
    const clave = claveDeDoc(doc);
    const remoto = await ultimoRemoto(ctx, clave);
    const sellado = await db.transaction(async (tx) => {
      await tx.execute(sqlCandado(textoClave(ctx.cuit, clave)));
      await tx.insert(fiscalSequences).values({ puntoVenta: clave.puntoVenta, cbteTipo: clave.cbteTipo }).onConflictDoNothing();
      const fila = await tx
        .select({ lastNumber: fiscalSequences.lastNumber, titular: fiscalSequences.inFlightDocumentId })
        .from(fiscalSequences)
        .where(and(eq(fiscalSequences.puntoVenta, clave.puntoVenta), eq(fiscalSequences.cbteTipo, clave.cbteTipo)))
        .limit(1);
      const vigente = fila[0];
      if (vigente && vigente.titular !== null && vigente.titular !== ctx.docId) {
        return { estado: "ocupado" as const };
      }
      const numero = doc.cbte_nro ?? Math.max(vigente?.lastNumber ?? 0, remoto) + 1;
      if (!vigente || vigente.titular === null) {
        const tomada = await tx
          .update(fiscalSequences)
          .set({ inFlightDocumentId: ctx.docId })
          .where(
            and(
              eq(fiscalSequences.puntoVenta, clave.puntoVenta),
              eq(fiscalSequences.cbteTipo, clave.cbteTipo),
              isNull(fiscalSequences.inFlightDocumentId),
            ),
          )
          .returning({ puntoVenta: fiscalSequences.puntoVenta });
        if (!tomada[0]) return { estado: "ocupado" as const };
      }
      const estampadas = await tx
        .update(fiscalDocuments)
        .set({ estado: "respuesta_incierta", cbteNro: numero })
        .where(and(eq(fiscalDocuments.id, ctx.docId), isNull(fiscalDocuments.noFacturar)))
        .returning({ id: fiscalDocuments.id });
      if (!estampadas[0]) {
        await tx
          .update(fiscalSequences)
          .set({ inFlightDocumentId: null })
          .where(
            and(
              eq(fiscalSequences.puntoVenta, clave.puntoVenta),
              eq(fiscalSequences.cbteTipo, clave.cbteTipo),
              eq(fiscalSequences.inFlightDocumentId, ctx.docId),
            ),
          );
        return { estado: "no-facturar" as const };
      }
      return { estado: "hecho" as const, numero, lastNumber: vigente?.lastNumber ?? 0 };
    });
    if (sellado.estado === "ocupado") {
      return { ok: false, motivo: "ocupado", doc: (await leerFiscalDocPorId(db, ctx.docId)) ?? doc };
    }
    if (sellado.estado === "no-facturar") {
      return { ok: false, motivo: "no-facturar", doc: (await leerFiscalDocPorId(db, ctx.docId)) ?? doc };
    }
    const reclamado: StoredFiscalDoc = { ...doc, estado: "respuesta_incierta", cbte_nro: sellado.numero };
    espejar(reclamado);
    return { ok: true, reclamo: { doc: reclamado, lastNumber: sellado.lastNumber } };
  }

  async function store(ctx: ContextoEmision, resultado: ResultadoWorker): Promise<EmisionDurable> {
    const salida = clasificar(resultado.doc);
    const clave = claveDeDoc(resultado.doc);
    const final = await db.transaction(async (tx) => {
      await tx.execute(sqlCandado(textoClave(ctx.cuit, clave)));
      const fila = await tx
        .select({ lastNumber: fiscalSequences.lastNumber })
        .from(fiscalSequences)
        .where(and(eq(fiscalSequences.puntoVenta, clave.puntoVenta), eq(fiscalSequences.cbteTipo, clave.cbteTipo)))
        .limit(1);
      const vigente = fila[0]?.lastNumber ?? 0;
      switch (salida) {
        case "autorizado": {
          const nro = resultado.doc.cbte_nro ?? vigente + 1;
          await tx.update(fiscalDocuments).set(columnasDeDoc(resultado.doc)).where(eq(fiscalDocuments.id, resultado.doc.id));
          await tx
            .update(fiscalSequences)
            .set({ lastNumber: Math.max(vigente, nro), lastCbteFch: resultado.doc.cbte_fch, inFlightDocumentId: null })
            .where(and(eq(fiscalSequences.puntoVenta, clave.puntoVenta), eq(fiscalSequences.cbteTipo, clave.cbteTipo)));
          return resultado.doc;
        }
        case "rechazado": {
          await tx.update(fiscalDocuments).set(columnasDeDoc(resultado.doc)).where(eq(fiscalDocuments.id, resultado.doc.id));
          await liberarSecuencia(tx, clave);
          return resultado.doc;
        }
        case "pendiente-retry": {
          const escritas = await tx
            .update(fiscalDocuments)
            .set(columnasDeDoc(resultado.doc))
            .where(and(eq(fiscalDocuments.id, resultado.doc.id), isNull(fiscalDocuments.noFacturar)))
            .returning({ id: fiscalDocuments.id });
          await liberarSecuencia(tx, clave);
          if (!escritas[0]) return (await leerFiscalDocPorId(db, resultado.doc.id)) ?? resultado.doc;
          return resultado.doc;
        }
        case "difiere": {
          await tx.update(fiscalDocuments).set(columnasDeDoc(resultado.doc)).where(eq(fiscalDocuments.id, resultado.doc.id));
          return resultado.doc;
        }
        case "respuesta_incierta": {
          return resultado.doc;
        }
        case "ocupado": {
          await tx
            .update(fiscalDocuments)
            .set({ estado: "pendiente", cbteNro: null })
            .where(eq(fiscalDocuments.id, resultado.doc.id));
          await liberarSecuencia(tx, clave);
          return { ...resultado.doc, estado: "pendiente" as const, cbte_nro: null };
        }
      }
    });
    espejar(final);
    return { salida, doc: final };
  }

  async function release(cuit: number, clave: SequenceKey, docId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sqlCandado(textoClave(cuit, clave)));
      await tx
        .update(fiscalSequences)
        .set({ inFlightDocumentId: null })
        .where(
          and(
            eq(fiscalSequences.puntoVenta, clave.puntoVenta),
            eq(fiscalSequences.cbteTipo, clave.cbteTipo),
            eq(fiscalSequences.inFlightDocumentId, docId),
          ),
        );
    });
    liberar_en_vuelo(textoClave(cuit, clave), docId);
  }

  async function listar_varados(): Promise<ReadonlyArray<StoredFiscalDoc>> {
    const porId = new Map<string, StoredFiscalDoc>();
    const ids = new Map<string, true>();
    const inciertas = await db
      .select({ id: fiscalDocuments.id })
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.estado, "respuesta_incierta"));
    for (const f of inciertas) ids.set(f.id, true);
    const retenidas = await db
      .select({ titular: fiscalSequences.inFlightDocumentId })
      .from(fiscalSequences)
      .where(isNotNull(fiscalSequences.inFlightDocumentId));
    for (const f of retenidas) {
      if (f.titular !== null) ids.set(f.titular, true);
    }
    const difieren = await db
      .select({ id: fiscalDocuments.id })
      .from(fiscalDocuments)
      .where(and(eq(fiscalDocuments.estado, "pendiente"), eq(fiscalDocuments.ultimoErrorCodigo, "difiere")));
    for (const f of difieren) ids.set(f.id, true);
    for (const id of ids.keys()) {
      const doc = await leerFiscalDocPorId(db, id);
      if (doc) porId.set(doc.id, doc);
    }
    return [...porId.values()];
  }

  async function listar_secuencias(): Promise<ReadonlyArray<SecuenciaFiscal>> {
    return db
      .select({
        puntoVenta: fiscalSequences.puntoVenta,
        cbteTipo: fiscalSequences.cbteTipo,
        lastNumber: fiscalSequences.lastNumber,
      })
      .from(fiscalSequences);
  }

  return { claim, store, release, listar_varados, listar_secuencias };
}

interface TxEmision {
  execute: TenantDb["execute"];
  update: TenantDb["update"];
}

async function liberarSecuencia(tx: TxEmision, clave: SequenceKey): Promise<void> {
  await tx
    .update(fiscalSequences)
    .set({ inFlightDocumentId: null })
    .where(and(eq(fiscalSequences.puntoVenta, clave.puntoVenta), eq(fiscalSequences.cbteTipo, clave.cbteTipo)));
}

function columnasDeDoc(doc: StoredFiscalDoc) {
  return {
    estado: doc.estado,
    cbteNro: doc.cbte_nro,
    cae: doc.cae,
    caeVto: doc.cae_vto,
    qrPayload: doc.qr_payload,
    intentos: Number(doc.intentos ?? 0),
    proximoIntento: doc.proximo_intento ? new Date(doc.proximo_intento) : null,
    ultimoErrorCodigo: doc.ultimo_error_codigo ?? null,
    motivoCastellano: doc.motivo_castellano ?? null,
  };
}

const secuenciasMemoria = new Map<string, { lastNumber: number; inFlight: string | null }>();

export function reiniciar_puerto_memoria(): void {
  secuenciasMemoria.clear();
}

function celdaMemoria(clave: SequenceKey): { lastNumber: number; inFlight: string | null } {
  const k = `${clave.puntoVenta}:${clave.cbteTipo}`;
  let c = secuenciasMemoria.get(k);
  if (!c) {
    c = { lastNumber: 0, inFlight: null };
    secuenciasMemoria.set(k, c);
  }
  return c;
}

export function puertoMemoria(): PuertoFiscalDurable {
  async function claim(ctx: ContextoEmision): Promise<ResultadoReclamo> {
    const doc = porIdMemoria(ctx.docId);
    if (!doc) return { ok: false, motivo: "inexistente", doc: null };
    if (doc.no_facturar) return { ok: false, motivo: "no-facturar", doc };
    if (doc.estado !== "pendiente" && doc.estado !== "respuesta_incierta") {
      return { ok: false, motivo: "no-reintentable", doc };
    }
    const clave = claveDeDoc(doc);
    const remoto = await ultimoRemoto(ctx, clave);
    const celda = celdaMemoria(clave);
    if (celda.inFlight !== null && celda.inFlight !== ctx.docId) {
      return { ok: false, motivo: "ocupado", doc };
    }
    const numero = doc.cbte_nro ?? Math.max(celda.lastNumber, remoto) + 1;
    celda.inFlight = ctx.docId;
    const reclamado: StoredFiscalDoc = { ...doc, estado: "respuesta_incierta", cbte_nro: numero };
    memoria.fiscalDocs.set(reclamado.idempotency_key, reclamado);
    return { ok: true, reclamo: { doc: reclamado, lastNumber: celda.lastNumber } };
  }

  async function store(_ctx: ContextoEmision, resultado: ResultadoWorker): Promise<EmisionDurable> {
    const salida = clasificar(resultado.doc);
    const clave = claveDeDoc(resultado.doc);
    const celda = celdaMemoria(clave);
    let final: StoredFiscalDoc = resultado.doc;
    switch (salida) {
      case "autorizado": {
        const nro = resultado.doc.cbte_nro ?? celda.lastNumber + 1;
        celda.lastNumber = Math.max(celda.lastNumber, nro);
        celda.inFlight = null;
        break;
      }
      case "rechazado": {
        celda.inFlight = null;
        break;
      }
      case "pendiente-retry": {
        const actual = porIdMemoria(resultado.doc.id);
        if (actual?.no_facturar) final = actual;
        celda.inFlight = null;
        break;
      }
      case "difiere": {
        break;
      }
      case "respuesta_incierta": {
        break;
      }
      case "ocupado": {
        final = { ...resultado.doc, estado: "pendiente", cbte_nro: null };
        celda.inFlight = null;
        break;
      }
    }
    memoria.fiscalDocs.set(final.idempotency_key, final);
    return { salida, doc: final };
  }

  async function release(cuit: number, clave: SequenceKey, docId: string): Promise<void> {
    const celda = celdaMemoria(clave);
    if (celda.inFlight === docId) celda.inFlight = null;
    liberar_en_vuelo(textoClave(cuit, clave), docId);
  }

  async function listar_varados(): Promise<ReadonlyArray<StoredFiscalDoc>> {
    const out = new Map<string, StoredFiscalDoc>();
    for (const d of memoria.fiscalDocs.values()) {
      if (d.estado === "respuesta_incierta") out.set(d.id, d);
      else if (d.estado === "pendiente" && d.ultimo_error_codigo === "difiere") out.set(d.id, d);
    }
    for (const celda of secuenciasMemoria.values()) {
      if (celda.inFlight !== null) {
        const d = porIdMemoria(celda.inFlight);
        if (d) out.set(d.id, d);
      }
    }
    return [...out.values()];
  }

  async function listar_secuencias(): Promise<ReadonlyArray<SecuenciaFiscal>> {
    return [...secuenciasMemoria.entries()].map(([k, v]) => {
      const [puntoVenta = "", cbteTipo = ""] = k.split(":");
      return { puntoVenta, cbteTipo, lastNumber: v.lastNumber };
    });
  }

  return { claim, store, release, listar_varados, listar_secuencias };
}

export async function emitir_fiscal_durable(
  ctx: ContextoEmision,
  puerto: PuertoFiscalDurable,
): Promise<EmisionDurable> {
  if (!esUuid(ctx.docId)) throw new Error("emision fiscal: docId invalido");
  const reclamado = await puerto.claim(ctx);
  if (!reclamado.ok) {
    if (reclamado.motivo === "ocupado") {
      if (!reclamado.doc) throw new Error("emision fiscal: ocupado sin doc");
      return { salida: "ocupado", doc: reclamado.doc };
    }
    throw new Error(`emision fiscal: ${reclamado.motivo}`);
  }
  const { doc, lastNumber } = reclamado.reclamo;
  let resultado: ResultadoWorker;
  try {
    resultado = await procesar_pendiente({
      doc,
      lastNumber,
      totalCentavos: totalDe(doc),
      cuit: ctx.cuit,
      provider: ctx.provider,
    });
  } catch {
    liberar_en_vuelo(textoClave(ctx.cuit, claveDeDoc(doc)), doc.id);
    return { salida: "respuesta_incierta", doc };
  }
  return puerto.store(ctx, resultado);
}

export interface Rehidratacion {
  readonly resueltos: number;
  readonly retenidos: number;
}

export async function rehidratar_fiscal(
  ctx: Omit<ContextoEmision, "docId">,
  puerto: PuertoFiscalDurable,
): Promise<Rehidratacion> {
  let resueltos = 0;
  let retenidos = 0;
  const varados = await puerto.listar_varados();
  for (const doc of varados) {
    if (doc.ultimo_error_codigo === "difiere") {
      retenidos += 1;
      continue;
    }
    const nro = doc.cbte_nro;
    if (doc.estado === "respuesta_incierta" && nro !== null && nro !== undefined) {
      const total = totalDe(doc);
      let consulta: { existe: boolean; coincide: boolean; cae?: string };
      try {
        consulta = await ctx.provider.consultar(Number(doc.cbte_tipo), Number(doc.pto_vta), nro, {
          docTipo: Number(doc.doc_tipo),
          docNro: doc.doc_nro,
          impTotalCentavos: total,
          cbteFch: doc.cbte_fch,
        });
      } catch {
        retenidos += 1;
        continue;
      }
      const decision = resolver_consulta(consulta.existe, consulta.coincide);
      if (decision.decision === "tomar-cae" && consulta.cae) {
        const conciliado = representarConciliado(doc, ctx.cuit, total, nro, consulta.cae);
        const salida = await puerto.store({ ...ctx, docId: doc.id }, { doc: conciliado, lastNumber: nro });
        if (salida.salida === "autorizado") resueltos += 1;
        else retenidos += 1;
        continue;
      }
      if (decision.decision === "pausar-alerta") {
        retenidos += 1;
        continue;
      }
    }
    try {
      const r = await emitir_fiscal_durable({ ...ctx, docId: doc.id }, puerto);
      if (r.salida === "autorizado" || r.salida === "rechazado" || r.salida === "pendiente-retry") resueltos += 1;
      else retenidos += 1;
    } catch {
      retenidos += 1;
    }
  }
  return { resueltos, retenidos };
}

function representarConciliado(
  doc: StoredFiscalDoc,
  cuit: number,
  total: bigint,
  nro: number,
  cae: string,
): StoredFiscalDoc {
  const qr = armar_qr_payload({
    fecha: `${doc.cbte_fch.slice(0, 4)}-${doc.cbte_fch.slice(4, 6)}-${doc.cbte_fch.slice(6, 8)}`,
    cuit,
    ptoVta: Number(doc.pto_vta),
    nroCmp: nro,
    importeCentavos: total,
    cae,
    tipoCmp: Number(doc.cbte_tipo),
  });
  return { ...doc, estado: "autorizado", cae, cae_vto: null, qr_payload: qr, marca: MARCA_PRUEBA, link_token: tokenLocal() };
}

export type MarcaNoFacturar =
  | { readonly ok: true; readonly doc: StoredFiscalDoc }
  | { readonly ok: false; readonly codigo: "inexistente" | "ya-marcado" | "no-marcable"; readonly doc: StoredFiscalDoc | null };

export async function marcar_no_facturar(
  db: TenantDb | null,
  docId: string,
  motivo: string,
  por: string,
): Promise<MarcaNoFacturar> {
  if (!esUuid(docId)) return { ok: false, codigo: "inexistente", doc: null };
  const marca = { motivo, por, cuando: new Date().toISOString() };
  if (!db) {
    const actual = porIdMemoria(docId);
    if (!actual) return { ok: false, codigo: "inexistente", doc: null };
    if (actual.no_facturar) return { ok: false, codigo: "ya-marcado", doc: actual };
    if (actual.estado === "autorizado") return { ok: false, codigo: "no-marcable", doc: actual };
    const doc: StoredFiscalDoc = { ...actual, no_facturar: marca };
    memoria.fiscalDocs.set(doc.idempotency_key, doc);
    return { ok: true, doc };
  }
  const actual = await leerFiscalDocPorId(db, docId);
  if (!actual) return { ok: false, codigo: "inexistente", doc: null };
  if (actual.no_facturar) return { ok: false, codigo: "ya-marcado", doc: actual };
  if (actual.estado === "autorizado") return { ok: false, codigo: "no-marcable", doc: actual };
  await db
    .update(fiscalDocuments)
    .set({ noFacturar: marca })
    .where(and(eq(fiscalDocuments.id, docId), isNull(fiscalDocuments.noFacturar)));
  const doc = (await leerFiscalDocPorId(db, docId)) ?? { ...actual, no_facturar: marca };
  espejar(doc);
  return { ok: true, doc };
}

