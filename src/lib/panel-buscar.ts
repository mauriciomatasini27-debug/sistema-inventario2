import { BARRA_TABLERO, ENTRADAS_MAS, type EntradaMas, type IdGrupoMas } from "./panel-modulos.js";

export interface DestinoBuscar {
  readonly label: string;
  readonly href: string;
  readonly grupo?: IdGrupoMas;
}

const ETIQUETA_GRUPO: Record<IdGrupoMas, string> = {
  vender: "Vender",
  productos: "Productos",
  caja: "Caja",
  compras: "Compras",
  servicios: "Servicios",
  reportes: "Reportes",
  ajustes: "Ajustes",
};

export const MAX_SUGERENCIAS_BUSCAR = 8;

function entradaMasVisible(entrada: EntradaMas, rol: "dueno" | "empleado"): boolean {
  if (entrada.soloDueno && rol !== "dueno") return false;
  return true;
}

/** TB-158: pocas rutas frecuentes + Más visible por rol, para el buscador Ctrl/Cmd+K. */
export function destinosBuscar(rol: "dueno" | "empleado", permisos: readonly string[] = []): DestinoBuscar[] {
  const vistos = new Set<string>();
  const salida: DestinoBuscar[] = [];
  const push = (d: DestinoBuscar) => {
    if (vistos.has(d.href)) return;
    vistos.add(d.href);
    salida.push(d);
  };
  for (const a of BARRA_TABLERO) {
    if (!a.href) continue;
    push({ label: a.label, href: a.href });
  }
  for (const e of ENTRADAS_MAS) {
    if (!entradaMasVisible(e, rol)) continue;
    push({ label: e.label, href: e.href, grupo: e.grupo });
  }
  return salida;
}

export function filtrarDestinosBuscar(destinos: readonly DestinoBuscar[], consulta: string): DestinoBuscar[] {
  const q = consulta.trim().toLowerCase();
  if (!q) return [...destinos].slice(0, MAX_SUGERENCIAS_BUSCAR);
  const puntaje = (d: DestinoBuscar): number => {
    const label = d.label.toLowerCase();
    const grupo = d.grupo ? ETIQUETA_GRUPO[d.grupo].toLowerCase() : "";
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    if (grupo.startsWith(q)) return 2;
    if (grupo.includes(q)) return 3;
    if (d.href.toLowerCase().includes(q)) return 4;
    return 99;
  };
  return destinos
    .map((d) => ({ d, p: puntaje(d) }))
    .filter((x) => x.p < 99)
    .sort((a, b) => a.p - b.p || a.d.label.localeCompare(b.d.label, "es"))
    .slice(0, MAX_SUGERENCIAS_BUSCAR)
    .map((x) => x.d);
}
