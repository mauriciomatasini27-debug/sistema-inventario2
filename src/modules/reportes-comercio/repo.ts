import { randomUUID } from "node:crypto";
import { control } from "../../lib/store.js";
import {
  type ContextoReporteSeguro,
  type EstadoReporteComercio,
  type ReporteComercioMem,
  type TipoReporteComercio,
  reportesComercioStore,
} from "../../lib/reportes-comercio-store.js";
import {
  actualizarEstadoReporteDb,
  leerPorClaveDb,
  leerReporteDb,
  listarPlataformaDb,
  listarPropiosDb,
  mensajePersistenciaFallida,
  persistirReporteComercio,
} from "../../lib/reportes-comercio-db.js";
import { evaluarRateLimit } from "./rate-limit.js";
import { contextoSeguro, contextoSinDatosSensibles } from "./contexto.js";

export const VERSION_REPORTES_COMERCIO = "tablero B · 0.1.0";

function cacheReporte(r: ReporteComercioMem): void {
  reportesComercioStore.reportes.set(r.id, r);
  reportesComercioStore.porClave.set(r.idempotencyKey, r.id);
}

export async function listarReportesPropios(tenantId: string, googleSub: string): Promise<ReporteComercioMem[]> {
  const desdeDb = await listarPropiosDb(tenantId, googleSub);
  if (desdeDb !== null) {
    for (const r of desdeDb) cacheReporte(r);
    return desdeDb;
  }
  return [...reportesComercioStore.reportes.values()]
    .filter((r) => r.tenantId === tenantId && r.autorGoogleSub === googleSub)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export async function listarReportesPlataforma(
  filtroEstado?: EstadoReporteComercio,
): Promise<ReporteComercioMem[]> {
  const desdeDb = await listarPlataformaDb(filtroEstado);
  if (desdeDb !== null) {
    for (const r of desdeDb) cacheReporte(r);
    return desdeDb;
  }
  const todos = [...reportesComercioStore.reportes.values()].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  if (!filtroEstado) return todos;
  return todos.filter((r) => r.estado === filtroEstado);
}

export async function leerReporte(id: string): Promise<ReporteComercioMem | null> {
  const db = await leerReporteDb(id);
  if (db) {
    cacheReporte(db);
    return db;
  }
  return reportesComercioStore.reportes.get(id) ?? null;
}

async function leerPorClave(idempotencyKey: string): Promise<ReporteComercioMem | null> {
  const db = await leerPorClaveDb(idempotencyKey);
  if (db) {
    cacheReporte(db);
    return db;
  }
  const id = reportesComercioStore.porClave.get(idempotencyKey);
  if (!id) return null;
  return reportesComercioStore.reportes.get(id) ?? null;
}

export type ResultadoCrear =
  | { ok: true; reporte: ReporteComercioMem; reintento: boolean }
  | { ok: false; codigo: "rate_limit" | "sin_comercio" | "contexto" | "persistencia"; mensaje: string };

export async function crearReporte(input: {
  tenantId: string;
  googleSub: string;
  idempotencyKey: string;
  tipo: TipoReporteComercio;
  texto: string;
  rutaSugerida?: string;
  pantallaCliente?: string;
  referer?: string | null;
  ahora?: Date;
}): Promise<ResultadoCrear> {
  const tenant = control.tenants.get(input.tenantId);
  if (!tenant) return { ok: false, codigo: "sin_comercio", mensaje: "No encontramos este comercio." };

  const existente = await leerPorClave(input.idempotencyKey);
  if (existente) {
    if (existente.autorGoogleSub !== input.googleSub || existente.tenantId !== input.tenantId) {
      return { ok: false, codigo: "sin_comercio", mensaje: "No pudimos registrar el envío." };
    }
    return { ok: true, reporte: existente, reintento: true };
  }

  const ahoraMs = (input.ahora ?? new Date()).getTime();
  const limite = evaluarRateLimit(input.tenantId, input.googleSub, ahoraMs);
  if (!limite.ok) return { ok: false, codigo: "rate_limit", mensaje: limite.mensaje };

  const ctx: ContextoReporteSeguro = contextoSeguro({
    versionApp: VERSION_REPORTES_COMERCIO,
    referer: input.referer ?? null,
    ...(input.rutaSugerida !== undefined ? { rutaSugerida: input.rutaSugerida } : {}),
    ...(input.pantallaCliente !== undefined ? { pantallaCliente: input.pantallaCliente } : {}),
  });
  if (!contextoSinDatosSensibles(ctx)) {
    return { ok: false, codigo: "contexto", mensaje: "El contexto no es válido." };
  }

  const ahoraIso = new Date(ahoraMs).toISOString();
  const reporte: ReporteComercioMem = {
    id: randomUUID(),
    tenantId: input.tenantId,
    nombreComercio: tenant.nombreComercio,
    autorGoogleSub: input.googleSub,
    idempotencyKey: input.idempotencyKey,
    tipo: input.tipo,
    texto: input.texto.trim(),
    estado: "recibido",
    contexto: ctx,
    creadoEn: ahoraIso,
    actualizadoEn: ahoraIso,
  };

  const persistido = await persistirReporteComercio(reporte);
  if (!persistido.ok) {
    return {
      ok: false,
      codigo: "persistencia",
      mensaje: mensajePersistenciaFallida(persistido.motivo),
    };
  }

  cacheReporte(reporte);
  return { ok: true, reporte, reintento: false };
}

export function puedeLeerReporte(r: ReporteComercioMem, tenantId: string, googleSub: string): boolean {
  return r.tenantId === tenantId && r.autorGoogleSub === googleSub;
}

export async function cambiarEstadoReporte(
  id: string,
  estado: EstadoReporteComercio,
): Promise<ReporteComercioMem | null> {
  const r = await leerReporte(id);
  if (!r) return null;
  const actualizadoEn = new Date().toISOString();
  const db = await actualizarEstadoReporteDb(id, estado, actualizadoEn);
  if (!db.ok) return null;
  const actualizado: ReporteComercioMem = {
    ...r,
    estado,
    actualizadoEn,
  };
  cacheReporte(actualizado);
  return actualizado;
}
