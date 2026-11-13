// TB-160: la consulta vacía no es "mostrar todo". El catálogo completo no entra al ticket.
// TB-160: "cafe" y "Café" ya coinciden en coincideDifuso. includes deja la tilde y tira la ficha.

import { coincideDifuso } from "../inventario/busqueda.js";

export type HitTicket = {
  readonly sku: string;
  readonly nombre: string;
  readonly precioCentavos: number;
  readonly stock: number | null;
};

export type SnapshotBusqueda = {
  readonly productos: Readonly<Record<string, { readonly stock: number; readonly precioCentavos: number }>>;
  readonly codigos: Readonly<Record<string, string>>;
};

export type FichaBusqueda = {
  readonly sku?: unknown;
  readonly nombre?: unknown;
  readonly precioCentavos?: unknown;
};

function texto(valor: string): string {
  return valor.trim().toLocaleLowerCase("es");
}

function precioEntero(valor: unknown): number | null {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0) return null;
  return valor;
}

export function hitsCatalogoLocal(snapshot: SnapshotBusqueda | null, consulta: string): HitTicket[] {
  const q = texto(consulta);
  if (!q || !snapshot) return [];
  const vistos = new Set<string>();
  const out: HitTicket[] = [];
  const sumar = (sku: string) => {
    if (vistos.has(sku)) return;
    const prod = snapshot.productos[sku];
    if (!prod) return;
    vistos.add(sku);
    out.push({ sku, nombre: sku, precioCentavos: prod.precioCentavos, stock: prod.stock });
  };
  for (const sku of Object.keys(snapshot.productos)) {
    if (texto(sku).includes(q)) sumar(sku);
  }
  for (const [codigo, sku] of Object.entries(snapshot.codigos)) {
    if (texto(codigo).includes(q)) sumar(sku);
  }
  return out;
}

export function unirHits(
  consulta: string,
  locales: readonly HitTicket[],
  fichas: readonly FichaBusqueda[],
): HitTicket[] {
  const q = texto(consulta);
  if (!q) return [];
  const porSku = new Map<string, HitTicket>();
  for (const local of locales) {
    if (local.sku.trim() === "") continue;
    porSku.set(local.sku, local);
  }
  for (const ficha of fichas) {
    if (typeof ficha.sku !== "string") continue;
    const sku = ficha.sku.trim();
    if (sku === "") continue;
    const nombre = typeof ficha.nombre === "string" ? ficha.nombre.trim() : "";
    if (!coincideDifuso([sku, nombre], consulta)) continue;
    const prev = porSku.get(sku);
    const precio = precioEntero(ficha.precioCentavos);
    porSku.set(sku, {
      sku,
      nombre: nombre || prev?.nombre || sku,
      precioCentavos: prev ? prev.precioCentavos : (precio ?? 0),
      stock: prev?.stock ?? null,
    });
  }
  return [...porSku.values()];
}
