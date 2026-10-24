// ADMIN-USO-DIARIO: PA8 / PLAN-S12 comparan el precio del plan con el costo
// técnico de WhatsApp y del asistente. El panel solo recibe contadores; leer
// ventas, productos o clientes del comercio violaría ADR-0006.

import { parseFechaAR } from "../../lib/fecha-ar.js";
import { PLANES_EJEMPLO, type Catalogo, type PlanId } from "../planes/catalogo.js";

// Foto de un día. mensajesWa y consultasLlm son conteos; los costos ya vienen
// calculados en centavos USD. No hay monto de venta ni tarifa Meta fija.
export interface UsoDiarioContadores {
  readonly tenantId: string;
  readonly dia: string;
  readonly mensajesWa: number;
  readonly consultasLlm: number;
  readonly costoWaCentavos: bigint;
  readonly costoLlmCentavos: bigint;
}

// margen = precio del plan − costos técnicos del mes. marcado cuando ese
// costo es mayor estricto que la mitad del precio.
export interface MargenEstimado {
  readonly tenantId: string;
  readonly plan: string;
  readonly precioPlanCentavos: bigint | null;
  readonly costoTecnicoCentavos: bigint;
  readonly margenCentavos: bigint | null;
  readonly marcado: boolean;
}

export interface FilaUsoMargen {
  readonly tenantId: string;
  readonly slug: string;
  readonly plan: string;
  readonly dia: string;
  readonly mensajesWa: number;
  readonly consultasLlm: number;
  readonly costoWaCentavos: string;
  readonly costoLlmCentavos: string;
  readonly costoTecnicoCentavos: string;
  readonly precioPlanCentavos: string | null;
  readonly margenCentavos: string | null;
  readonly marcado: boolean;
  readonly ejemplo: boolean;
}

const ALIAS_PLAN: Readonly<Record<string, PlanId>> = {
  basico: "basico",
  base: "basico",
  plus: "plus",
  pro: "pro",
};

// El catálogo sigue siendo de ejemplo: no publica precio ni fija tarifa Meta.
export function precioReferenciaCentavos(plan: string, catalogo: Catalogo = PLANES_EJEMPLO): bigint | null {
  const id = ALIAS_PLAN[plan];
  if (!id) return null;
  const encontrado = catalogo.find((p) => p.id === id);
  if (!encontrado || !(encontrado.precioMensualUSD > 0)) return null;
  return BigInt(Math.round(encontrado.precioMensualUSD * 100));
}

export function estimarMargen(input: {
  readonly tenantId: string;
  readonly plan: string;
  readonly mes: string;
  readonly usos: readonly UsoDiarioContadores[];
  readonly precioPlanCentavos?: bigint | null;
}): MargenEstimado {
  const precio = input.precioPlanCentavos === undefined
    ? precioReferenciaCentavos(input.plan)
    : input.precioPlanCentavos;
  let costo = 0n;
  for (const u of input.usos) {
    // Aislamiento: otra fila, otro tenant u otro mes no mueven este margen.
    if (u.tenantId !== input.tenantId) continue;
    if (u.dia.slice(0, 7) !== input.mes) continue;
    costo += u.costoWaCentavos + u.costoLlmCentavos;
  }
  const marcado = precio !== null && precio > 0n && costo * 2n > precio;
  return {
    tenantId: input.tenantId,
    plan: input.plan,
    precioPlanCentavos: precio,
    costoTecnicoCentavos: costo,
    margenCentavos: precio === null ? null : precio - costo,
    marcado,
  };
}

function usoDelDia(usos: readonly UsoDiarioContadores[], tenantId: string, dia: string): UsoDiarioContadores {
  return usos.find((u) => u.tenantId === tenantId && u.dia === dia) ?? {
    tenantId,
    dia,
    mensajesWa: 0,
    consultasLlm: 0,
    costoWaCentavos: 0n,
    costoLlmCentavos: 0n,
  };
}

export function filasUsoMargen(input: {
  readonly tenants: readonly { id: string; slug: string; plan: string }[];
  readonly usos: readonly UsoDiarioContadores[];
  readonly dia: string;
}): FilaUsoMargen[] {
  const mes = input.dia.slice(0, 7);
  const ordenados = [...input.tenants].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return ordenados.map((t) => {
    const dia = usoDelDia(input.usos, t.id, input.dia);
    const margen = estimarMargen({ tenantId: t.id, plan: t.plan, mes, usos: input.usos });
    return {
      tenantId: t.id,
      slug: t.slug,
      plan: t.plan,
      dia: input.dia,
      mensajesWa: dia.mensajesWa,
      consultasLlm: dia.consultasLlm,
      costoWaCentavos: dia.costoWaCentavos.toString(),
      costoLlmCentavos: dia.costoLlmCentavos.toString(),
      costoTecnicoCentavos: margen.costoTecnicoCentavos.toString(),
      precioPlanCentavos: margen.precioPlanCentavos === null ? null : margen.precioPlanCentavos.toString(),
      margenCentavos: margen.margenCentavos === null ? null : margen.margenCentavos.toString(),
      marcado: margen.marcado,
      ejemplo: margen.precioPlanCentavos !== null,
    };
  });
}

function enteroNoNegativo(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

// Foto del día: el par (tenant, día) se reemplaza. Un contador negativo no entra.
export function guardarUsoDiario(
  destino: Map<string, UsoDiarioContadores>,
  uso: UsoDiarioContadores,
): { ok: true } | { ok: false; error: string } {
  if (!uso.tenantId) return { ok: false, error: "Falta el tenant." };
  if (!parseFechaAR(uso.dia)) return { ok: false, error: "El día tiene que ser AAAA-MM-DD." };
  if (!enteroNoNegativo(uso.mensajesWa) || !enteroNoNegativo(uso.consultasLlm)) {
    return { ok: false, error: "El contador tiene que ser un entero desde 0." };
  }
  if (uso.costoWaCentavos < 0n || uso.costoLlmCentavos < 0n) {
    return { ok: false, error: "El costo no puede ser negativo." };
  }
  destino.set(`${uso.tenantId}|${uso.dia}`, {
    tenantId: uso.tenantId,
    dia: uso.dia,
    mensajesWa: uso.mensajesWa,
    consultasLlm: uso.consultasLlm,
    costoWaCentavos: uso.costoWaCentavos,
    costoLlmCentavos: uso.costoLlmCentavos,
  });
  return { ok: true };
}
