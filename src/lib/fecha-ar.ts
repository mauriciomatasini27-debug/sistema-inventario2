export type FechaAR = string & { readonly __brand: "FechaAR" };

const DIA_MS = 86_400_000;

const formatoAR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const formatoUTC = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function fechaAR(ahora: Date | number = new Date()): FechaAR {
  const d = typeof ahora === "number" ? new Date(ahora) : ahora;
  return formatoAR.format(d) as FechaAR;
}

export function parseFechaAR(s: string): FechaAR | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m?.[1] === undefined || m?.[2] === undefined || m?.[3] === undefined) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return s as FechaAR;
}

export function sumarDiasAR(fecha: FechaAR, dias: number): FechaAR {
  if (!Number.isInteger(dias)) throw new Error("días entero");
  const base = Date.parse(`${fecha}T00:00:00Z`);
  if (Number.isNaN(base)) throw new Error("FechaAR inválida");
  const d = new Date(base + dias * DIA_MS);
  const p2 = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` as FechaAR;
}

// Día calendario UTC de un instante. No es FechaAR: conserva el corte UTC de los sitios que
// ya lo usaban (ARQ-S2 sin cambio de comportamiento); pasarlos a fechaAR es una decisión aparte.
export function diaUTC(ms: number | Date): string {
  const d = typeof ms === "number" ? new Date(ms) : ms;
  return formatoUTC.format(d);
}
