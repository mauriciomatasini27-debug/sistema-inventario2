// P1-89: el listado de tenants no trae saldo, así que esta vista clasifica
// por calendario (POLITICA_DEFECTO) y no llama a evaluar_mora.
import { parseFechaAR, type FechaAR } from "../../lib/fecha-ar.js";
import { POLITICA_DEFECTO, type DunningPolicy } from "./mora.js";

export interface TenantAdminListado {
  readonly id: string;
  readonly nombre: string | null;
  readonly slug: string | null;
  readonly estado: string;
  readonly vencimiento: string | null;
}

export type CubetaMoraVista = "en_gracia" | "por_suspender" | "suspendido";

export const CUBETAS_MORA_VISTA: readonly CubetaMoraVista[] = [
  "en_gracia",
  "por_suspender",
  "suspendido",
];

export type FiltroMoraVista = CubetaMoraVista | "todos";

export type AccionMoraVista = "suspender" | "reactivar";

export interface FilaMoraVista {
  readonly tenant: TenantAdminListado;
  readonly cubeta: CubetaMoraVista;
  readonly diasAtraso: number;
  readonly accion: AccionMoraVista | null;
}

export interface ParticionMoraVista {
  readonly porCubeta: Readonly<Record<CubetaMoraVista, readonly FilaMoraVista[]>>;
  readonly totalEnMora: number;
}

export interface ConteosMoraVista {
  readonly en_gracia: number;
  readonly por_suspender: number;
  readonly suspendido: number;
  readonly total: number;
}

const DIA_MS = 86_400_000;

const ETIQUETA_CUBETA: Readonly<Record<CubetaMoraVista, string>> = {
  en_gracia: "En gracia",
  por_suspender: "Por suspender",
  suspendido: "Suspendido",
};

const ACCION_POR_CUBETA: Readonly<Record<CubetaMoraVista, AccionMoraVista | null>> = {
  en_gracia: null,
  por_suspender: "suspender",
  suspendido: "reactivar",
};

export function politicaMoraVista(): DunningPolicy {
  return POLITICA_DEFECTO;
}

function fechaVencimiento(vencimientoIso: string | null): FechaAR | null {
  if (!vencimientoIso) return null;
  return parseFechaAR(vencimientoIso.slice(0, 10));
}

export function diasAtrasoDesdeVencimiento(vencimientoIso: string | null, hoy: FechaAR): number {
  const vence = fechaVencimiento(vencimientoIso);
  if (!vence || vence >= hoy) return 0;
  const desde = Date.parse(`${vence}T00:00:00Z`);
  const hasta = Date.parse(`${hoy}T00:00:00Z`);
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return 0;
  return Math.round((hasta - desde) / DIA_MS);
}

// null = fuera de la lista. Suspendido entra siempre. El día de suspensión
// se evalúa antes que la gracia por si una política los solapa.
export function clasificarCubetaMoraVista(
  tenant: TenantAdminListado,
  hoy: FechaAR,
  policy: DunningPolicy = POLITICA_DEFECTO,
): CubetaMoraVista | null {
  if (tenant.estado === "suspendido") return "suspendido";
  if (tenant.estado !== "activo") return null;
  const dias = diasAtrasoDesdeVencimiento(tenant.vencimiento, hoy);
  if (dias <= 0) return null;
  if (dias >= policy.diasASuspension) return "por_suspender";
  if (dias <= policy.diasGracia) return "en_gracia";
  return null;
}

export function construirFilaMoraVista(
  tenant: TenantAdminListado,
  cubeta: CubetaMoraVista,
  diasAtraso: number,
): FilaMoraVista {
  return {
    tenant,
    cubeta,
    diasAtraso,
    accion: ACCION_POR_CUBETA[cubeta],
  };
}

function ordenNombre(a: FilaMoraVista, b: FilaMoraVista): number {
  const an = (a.tenant.nombre ?? a.tenant.slug ?? "").toLocaleLowerCase("es");
  const bn = (b.tenant.nombre ?? b.tenant.slug ?? "").toLocaleLowerCase("es");
  const porNombre = an.localeCompare(bn, "es");
  if (porNombre !== 0) return porNombre;
  return a.tenant.id.localeCompare(b.tenant.id);
}

export function particionarMoraVista(
  tenants: readonly TenantAdminListado[],
  hoy: FechaAR,
  policy: DunningPolicy = POLITICA_DEFECTO,
): ParticionMoraVista {
  const porCubeta: Record<CubetaMoraVista, FilaMoraVista[]> = {
    en_gracia: [],
    por_suspender: [],
    suspendido: [],
  };
  for (const tenant of tenants) {
    const cubeta = clasificarCubetaMoraVista(tenant, hoy, policy);
    if (!cubeta) continue;
    porCubeta[cubeta].push(
      construirFilaMoraVista(tenant, cubeta, diasAtrasoDesdeVencimiento(tenant.vencimiento, hoy)),
    );
  }
  for (const cubeta of CUBETAS_MORA_VISTA) {
    porCubeta[cubeta].sort(ordenNombre);
  }
  const totalEnMora = CUBETAS_MORA_VISTA.reduce((n, cubeta) => n + porCubeta[cubeta].length, 0);
  return { porCubeta, totalEnMora };
}

export function filasMoraParaTabla(
  particion: ParticionMoraVista,
  filtro: FiltroMoraVista,
): readonly FilaMoraVista[] {
  if (filtro === "todos") {
    return CUBETAS_MORA_VISTA.flatMap((cubeta) => particion.porCubeta[cubeta]);
  }
  return particion.porCubeta[filtro];
}

export function conteosMoraVista(particion: ParticionMoraVista): ConteosMoraVista {
  return {
    en_gracia: particion.porCubeta.en_gracia.length,
    por_suspender: particion.porCubeta.por_suspender.length,
    suspendido: particion.porCubeta.suspendido.length,
    total: particion.totalEnMora,
  };
}

export function etiquetaCubetaMoraVista(cubeta: CubetaMoraVista): string {
  return ETIQUETA_CUBETA[cubeta];
}
