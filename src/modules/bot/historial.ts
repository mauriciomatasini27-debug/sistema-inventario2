import { enmascararNumero } from "../auth/bot.js";
import { parseFechaAR, sumarDiasAR, type FechaAR } from "../../lib/fecha-ar.js";
import { inicioDiaAR } from "../planes/ciclo.js";

export type FuenteTurno = "db" | "memoria";
export type RolPanel = "dueno" | "empleado";
export type TelefonoEnmascarado = string & { readonly __marca: "TelefonoEnmascarado" };
export type CursorHistorial = string & { readonly __marca: "CursorHistorial" };

export const TOPE_TEXTO = 4000;
export const LARGO_VISTA = 160;
export const PAGE = 40;

export interface ConsultaHistorial {
  readonly tenantId: string;
  readonly rol: RolPanel;
  readonly googleSub: string;
  readonly persona: string | null;
  readonly desdeMs: number | null;
  readonly hastaMsExcl: number | null;
  readonly cursor: CursorHistorial | null;
}

export type ErrorConsulta = "fecha" | "cursor";

function recortar(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  return `${texto.slice(0, max - 1)}…`;
}

function fechaARaMs(f: FechaAR): number {
  return inicioDiaAR(f).getTime();
}

function parseCursor(raw: string | null): CursorHistorial | null | "invalido" {
  if (raw == null || raw === "") return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const o = JSON.parse(json) as { t?: unknown; i?: unknown };
    if (typeof o.t !== "number" || typeof o.i !== "string" || !Number.isFinite(o.t)) return "invalido";
    return raw as CursorHistorial;
  } catch {
    return "invalido";
  }
}

export function parsearConsultaHistorial(
  raw: { persona: string | null; desde: string | null; hasta: string | null; cursor: string | null },
  sesion: { tenantId: string; rol: RolPanel; googleSub: string },
): { ok: true; consulta: ConsultaHistorial } | { ok: false; error: ErrorConsulta } {
  let desdeMs: number | null = null;
  let hastaMsExcl: number | null = null;
  if (raw.desde != null && raw.desde !== "") {
    const f = parseFechaAR(raw.desde);
    if (!f) return { ok: false, error: "fecha" };
    desdeMs = fechaARaMs(f);
  }
  if (raw.hasta != null && raw.hasta !== "") {
    const f = parseFechaAR(raw.hasta);
    if (!f) return { ok: false, error: "fecha" };
    hastaMsExcl = fechaARaMs(sumarDiasAR(f, 1));
  }
  const cursorParsed = parseCursor(raw.cursor);
  if (cursorParsed === "invalido") return { ok: false, error: "cursor" };
  return {
    ok: true,
    consulta: {
      tenantId: sesion.tenantId,
      rol: sesion.rol,
      googleSub: sesion.googleSub,
      persona: raw.persona?.trim() ? raw.persona.trim() : null,
      desdeMs,
      hastaMsExcl,
      cursor: cursorParsed,
    },
  };
}

export type AlcanceHistorial =
  | { readonly tipo: "uno"; readonly googleSub: string }
  | { readonly tipo: "todos" };

export function alcanceHistorial(consulta: ConsultaHistorial): AlcanceHistorial {
  if (consulta.rol === "empleado") return { tipo: "uno", googleSub: consulta.googleSub };
  if (consulta.persona) return { tipo: "uno", googleSub: consulta.persona };
  return { tipo: "todos" };
}

export interface FilaHistorial {
  readonly id: string;
  readonly creadoEnMs: number;
  readonly telefono: TelefonoEnmascarado;
  readonly pregunta: string;
  readonly respuesta: string;
  readonly fuente: FuenteTurno;
}

export interface PersonaFiltro {
  readonly googleSub: string;
  readonly nombre: string;
  readonly rol: RolPanel;
}

export function filaVisible(row: {
  id: string;
  creadoEnMs: number;
  numeroE164: string;
  pregunta: string;
  respuesta: string;
  fuente: FuenteTurno;
}): FilaHistorial {
  return {
    id: row.id,
    creadoEnMs: row.creadoEnMs,
    telefono: enmascararNumero(row.numeroE164) as TelefonoEnmascarado,
    pregunta: recortar(row.pregunta, LARGO_VISTA),
    respuesta: recortar(row.respuesta, LARGO_VISTA),
    fuente: row.fuente,
  };
}

export function cursorDe(fila: { creadoEnMs: number; id: string }): CursorHistorial {
  const raw = Buffer.from(JSON.stringify({ t: fila.creadoEnMs, i: fila.id }), "utf8").toString("base64url");
  return raw as CursorHistorial;
}

export function personasDelFiltro(args: {
  rol: RolPanel;
  memberships: readonly { googleSub: string; rol: RolPanel; estado: string; nombre: string }[];
}): readonly PersonaFiltro[] | null {
  if (args.rol === "empleado") return null;
  const activos = args.memberships.filter((m) => m.estado === "activo");
  activos.sort((a, b) => {
    if (a.rol === b.rol) return a.nombre.localeCompare(b.nombre, "es");
    return a.rol === "dueno" ? -1 : 1;
  });
  return activos.map((m) => ({ googleSub: m.googleSub, nombre: m.nombre, rol: m.rol }));
}

export function truncarParaGuardar(texto: string): string {
  return recortar(texto, TOPE_TEXTO);
}

export interface PaginaHistorial {
  readonly filas: readonly FilaHistorial[];
  readonly cursor: CursorHistorial | null;
}
