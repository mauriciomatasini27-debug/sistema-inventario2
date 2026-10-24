import { fechaAR, type FechaAR } from "../../lib/fecha-ar.js";
import type { PlanId } from "./catalogo.js";

// PLAN-S3: el prorrateo cobra días restantes sobre un ciclo de 30 anclado en
// `desde` (fecha civil AR), no sobre el mes calendario. El día 10 de 30 deja
// 20/30, la fracción que ya usa cambioDePlan.
const DIA_MS = 86_400_000;
export const DIAS_CICLO_PRORRATEO = 30;

function diasCiviles(desde: FechaAR, hasta: FechaAR): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / DIA_MS);
}

export function posicionProrrateo(args: {
  readonly desde?: Date | null | undefined;
  readonly ahora: Date;
}): { readonly diaDelCiclo: number; readonly diasCiclo: number } {
  const diasCiclo = DIAS_CICLO_PRORRATEO;
  if (!args.desde) return { diaDelCiclo: 1, diasCiclo };
  const transcurridos = diasCiviles(fechaAR(args.desde), fechaAR(args.ahora));
  if (!Number.isFinite(transcurridos) || transcurridos < 0) return { diaDelCiclo: 1, diasCiclo };
  return { diaDelCiclo: (transcurridos % diasCiclo) + 1, diasCiclo };
}

// PLAN-S4 (PRD-PLAN-01, ADR-0047): cuándo un cambio programado de plan pasa a
// ser el plan vigente. Puro, sin IO ni reloj implícito: `ahora` se inyecta.

// Próximo aniversario mensual del día civil de `desde` en Buenos Aires,
// estrictamente después de hoy (el día del aniversario ya arrancó un ciclo
// nuevo); el día 31 en meses cortos cae al último día del mes.
export function finDeCicloMensual(desde: Date, ahora: Date): FechaAR {
  const ancla = Number(fechaAR(desde).slice(8, 10));
  const hoy = fechaAR(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const esteMes = aniversarioEn(anio, mes, ancla);
  if (esteMes > hoy) return esteMes;
  return mes === 12 ? aniversarioEn(anio + 1, 1, ancla) : aniversarioEn(anio, mes + 1, ancla);
}

function aniversarioEn(anio: number, mes: number, dia: number): FechaAR {
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const d = Math.min(dia, ultimo);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}` as FechaAR;
}

// Fecha en que una baja pedida `ahora` pasa a regir: `hasta` si sigue vigente
// (hoy o después); si no, el fin del ciclo mensual anclado en el día de
// `desde` (sin `desde`, el ciclo arranca hoy).
export function fechaCambioDePlan(args: {
  readonly desde?: Date | null | undefined;
  readonly hasta?: Date | null | undefined;
  readonly ahora: Date;
}): FechaAR {
  const hoy = fechaAR(args.ahora);
  if (args.hasta && fechaAR(args.hasta) >= hoy) return fechaAR(args.hasta);
  return finDeCicloMensual(args.desde ?? args.ahora, args.ahora);
}

// 00:00 de esa fecha civil en Buenos Aires (UTC-3 fijo, sin horario de verano):
// así `fechaAR(inicioDiaAR(f)) === f`. Es el `hasta` que se guarda al programar.
export function inicioDiaAR(fecha: FechaAR): Date {
  return new Date(`${fecha}T00:00:00-03:00`);
}

// Derivado puro del resolvedor: el cambio se ancla en `hasta`, que se fija al
// programarlo. Antes de esa fecha sigue el plan actual; al llegar (hoy AR >=
// hasta) el plan vigente es el programado, sin importar cuándo se lea.
export function planVigenteDe(args: {
  readonly planId: PlanId;
  readonly planProgramado?: PlanId | null | undefined;
  readonly hasta?: Date | null | undefined;
  readonly ahora: Date;
}): { readonly planId: PlanId; readonly planProgramado: PlanId | null } {
  const programado = args.planProgramado ?? null;
  if (!programado || !args.hasta || fechaAR(args.ahora) < fechaAR(args.hasta)) {
    return { planId: args.planId, planProgramado: programado };
  }
  return { planId: programado, planProgramado: null };
}
