// P10-91: cierre de cuenta por el dueño y reapertura desde soporte
// (/privacidad, PR #369; decisiones de Mauri 2026-11-21 03:31). Núcleo puro:
// decide si se puede cerrar o reabrir; la ruta y el repo hacen el IO.

export const DIAS_REAPERTURA = 90;
const MS_DIA = 86_400_000;

// P10-91: el dueño confirma escribiendo el nombre del comercio. Se compara
// sin mayúsculas, tildes ni espacios de más, para no trabar por un acento.
export function normalizar_nombre(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type MotivoNoCierre = "no_dueno" | "ya_cerrada" | "estado_invalido" | "nombre_no_coincide";

export function decidir_cierre(input: {
  readonly esDueno: boolean;
  readonly estado: string;
  readonly nombreComercio: string;
  readonly nombreEscrito: string;
}): { ok: true } | { ok: false; motivo: MotivoNoCierre } {
  if (!input.esDueno) return { ok: false, motivo: "no_dueno" };
  if (input.estado === "baja") return { ok: false, motivo: "ya_cerrada" };
  if (input.estado !== "activo" && input.estado !== "suspendido") return { ok: false, motivo: "estado_invalido" };
  const escrito = normalizar_nombre(input.nombreEscrito);
  if (!escrito || escrito !== normalizar_nombre(input.nombreComercio)) return { ok: false, motivo: "nombre_no_coincide" };
  return { ok: true };
}

export type MotivoNoReapertura = "no_cerrada" | "sin_fecha" | "vencida";

// P10-91: soporte reabre solo dentro de los 90 días del último cierre; después
// el job de retención (P10-90) ya borró o está por borrar los datos.
export function decidir_reapertura(input: {
  readonly estado: string;
  readonly bajaEn: string | null;
  readonly ahora: Date;
}): { ok: true; venceEn: string } | { ok: false; motivo: MotivoNoReapertura } {
  if (input.estado !== "baja") return { ok: false, motivo: "no_cerrada" };
  if (!input.bajaEn) return { ok: false, motivo: "sin_fecha" };
  const vence = new Date(input.bajaEn).getTime() + DIAS_REAPERTURA * MS_DIA;
  if (input.ahora.getTime() >= vence) return { ok: false, motivo: "vencida" };
  return { ok: true, venceEn: new Date(vence).toISOString() };
}
