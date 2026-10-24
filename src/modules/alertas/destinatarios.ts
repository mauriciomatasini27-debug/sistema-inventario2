import { canalesEfectivos, type CanalElegido, type PersonaDueno, type PersonaEncargado } from "./stock-bajo.js";
import type { RolPanel } from "../bot/historial.js";

export type { CanalElegido };

export interface DireccionAviso {
  readonly email: string | null;
  readonly numeroWa: string | null;
}

export interface EleccionGuardada {
  readonly canal: CanalElegido;
  readonly avisoHora: string;
  readonly pausadoHastaMs: number | null;
}

export interface EleccionPedida {
  readonly canal: CanalElegido;
  readonly avisoHora: string;
  readonly pausadoHastaMs: number | null;
}

export type ErrorEleccion = "opt_in" | "canal" | "hora" | "pausa";

const CANALES: readonly CanalElegido[] = ["whatsapp", "email", "ambos"];

function tieneOptInEnBody(raw: Record<string, unknown>): boolean {
  return "opt_in" in raw || "optIn" in raw;
}

function parseHora(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return null;
  return raw;
}

function parsePausa(raw: unknown): number | null | "invalido" {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return "invalido";
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return "invalido";
  return ms;
}

export function parsearEleccion(
  raw: unknown,
): { ok: true; pedido: EleccionPedida } | { ok: false; error: ErrorEleccion } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "canal" };
  const o = raw as Record<string, unknown>;
  if (tieneOptInEnBody(o)) return { ok: false, error: "opt_in" };
  const canalRaw = o.canal;
  if (typeof canalRaw !== "string" || !CANALES.includes(canalRaw as CanalElegido)) return { ok: false, error: "canal" };
  const avisoHora = parseHora(o.aviso_hora ?? o.avisoHora);
  if (!avisoHora) return { ok: false, error: "hora" };
  const pausa = parsePausa(o.pausado_hasta ?? o.pausadoHasta);
  if (pausa === "invalido") return { ok: false, error: "pausa" };
  return {
    ok: true,
    pedido: { canal: canalRaw as CanalElegido, avisoHora, pausadoHastaMs: pausa },
  };
}

export function aplicarEleccion(
  prev: EleccionGuardada,
  pedido: EleccionPedida,
): { ok: true; eleccion: EleccionGuardada } | { ok: false; error: ErrorEleccion } {
  void prev;
  return {
    ok: true,
    eleccion: {
      canal: pedido.canal,
      avisoHora: pedido.avisoHora,
      pausadoHastaMs: pedido.pausadoHastaMs,
    },
  };
}

export interface OptInGuardado {
  readonly optIn: boolean;
  readonly optInAtMs: number | null;
}

export function aplicarOptIn(prev: OptInGuardado, alta: boolean, ahoraMs: number): OptInGuardado {
  if (!alta) return { optIn: false, optInAtMs: prev.optInAtMs };
  if (prev.optIn) return prev;
  return { optIn: true, optInAtMs: ahoraMs };
}

export const TEXTO_VINCULAR =
  "Elegiste WhatsApp y todavía no activaste los avisos. Escribí ALTA al bot. Si el número no está vinculado, generá el código. Hasta entonces no te llega el aviso por WhatsApp.";

export type FilaDestinatario =
  | {
      readonly rol: "dueno";
      readonly googleSub: string;
      readonly nombre: string;
      readonly fijo: true;
      readonly canales: readonly ("whatsapp" | "email")[];
      readonly avisoHora: string;
      readonly pausadoHastaMs: number | null;
    }
  | {
      readonly rol: "encargado";
      readonly googleSub: string;
      readonly nombre: string;
      readonly fijo: false;
      readonly canal: CanalElegido;
      readonly canales: readonly ("whatsapp" | "email")[];
      readonly avisoHora: string;
      readonly pausadoHastaMs: number | null;
      readonly ofrecerCodigo: boolean;
      readonly explicacion: string | null;
      readonly editable: boolean;
    };

export function armarPantallaDestinatarios(input: {
  readonly sesionSub: string;
  readonly sesionRol: RolPanel;
  readonly duenos: readonly PersonaDueno[];
  readonly encargados: readonly PersonaEncargado[];
  readonly nombres: ReadonlyMap<string, string>;
  readonly ahoraMs: number;
}): readonly FilaDestinatario[] {
  const filas: FilaDestinatario[] = [];
  for (const d of input.duenos) {
    filas.push({
      rol: "dueno",
      googleSub: d.googleSub,
      nombre: input.nombres.get(d.googleSub) ?? d.googleSub,
      fijo: true,
      canales: canalesEfectivos(d),
      avisoHora: d.avisoHora,
      pausadoHastaMs: d.pausaHastaMs,
    });
  }
  for (const e of input.encargados) {
    const ofrecerCodigo = (e.canal === "whatsapp" || e.canal === "ambos") && !e.optInWa;
    const editable = input.sesionRol === "empleado" && input.sesionSub === e.googleSub;
    filas.push({
      rol: "encargado",
      googleSub: e.googleSub,
      nombre: input.nombres.get(e.googleSub) ?? e.googleSub,
      fijo: false,
      canal: e.canal,
      canales: canalesEfectivos(e),
      avisoHora: e.avisoHora,
      pausadoHastaMs: e.pausaHastaMs,
      ofrecerCodigo,
      explicacion: ofrecerCodigo ? TEXTO_VINCULAR : null,
      editable,
    });
  }
  if (input.sesionRol === "empleado") {
    return filas.filter((f) => f.googleSub === input.sesionSub);
  }
  return filas;
}
