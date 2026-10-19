// BOT-S8 (PRD-BOT-01, ADR-0040): acciones propuestas del resumen mensual.
// Núcleo puro: sin IO, sin reloj ni env. Hasta 3 acciones deterministas por
// módulo activo; cada botón prepara un borrador y nunca ejecuta solo.
// Orden: reponer (urgencia de stock) antes que cobrar (deudor de mayor saldo).

import { truncar_titulo } from "../whatsapp/envio.js";
import { formatear_pesos } from "../email/plantilla-cierre.js";
import { deudores_a_cobrar, type ClientePyme } from "../../jobs/bot-pyme.js";
import type { ModuloBot } from "./modulos-rubro.js";

export const MAX_ACCIONES = 3;
export const PREFIJO_ACCION = "acc";
export const TEXTO_TITULO_ACCIONES = "Acciones sugeridas:";

export type TipoAccionPropuesta = "reponer" | "cobrar";

export interface ProductoAccion {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly reorderQty?: number | null | undefined;
  readonly proveedor?: string | null | undefined;
}

export interface AccionPropuesta {
  readonly tipo: TipoAccionPropuesta;
  readonly ref: string;
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
  readonly cantidad?: number | undefined;
  readonly proveedor?: string | null | undefined;
}

export interface EntradaAcciones {
  readonly modulos: ReadonlyArray<ModuloBot>;
  readonly productos: ReadonlyArray<ProductoAccion>;
  readonly clientes: ReadonlyArray<ClientePyme>;
}

const MODULO_DE_ACCION: Record<TipoAccionPropuesta, ModuloBot> = {
  reponer: "rotacion",
  cobrar: "cobranza",
};

export function id_accion(tipo: TipoAccionPropuesta, ref: string): string {
  return `${PREFIJO_ACCION}:${tipo}:${ref}`;
}

export function parsear_boton_accion(id: string): { readonly tipo: TipoAccionPropuesta; readonly ref: string } | null {
  const partes = id.split(":");
  if (partes.length < 3 || partes[0] !== PREFIJO_ACCION) return null;
  const tipo = partes[1];
  if (tipo !== "reponer" && tipo !== "cobrar") return null;
  const ref = partes.slice(2).join(":");
  if (!ref) return null;
  return { tipo, ref };
}

function es_urgente(p: ProductoAccion): boolean {
  return p.stock <= 0 || p.stock < p.umbral / 2;
}

// Misma fórmula que sugerido_alerta/lista-viernes: faltante + medio umbral.
// reorder_qty persistido manda; el tope de 9999 respeta la validación de OC.
export function cantidad_reponer(p: ProductoAccion): number {
  const stock = Math.floor(p.stock);
  const umbral = Math.floor(p.umbral);
  const reorder = p.reorderQty;
  if (typeof reorder === "number" && Number.isFinite(reorder) && reorder > 0) return Math.min(9999, Math.floor(reorder));
  const base = Math.max(umbral - stock, 0);
  const sugerida = base > 0 ? base + Math.ceil(umbral / 2) : es_urgente(p) ? Math.max(umbral, 1) : 0;
  return Math.min(9999, Math.max(1, sugerida));
}

function comparar_reponer(a: ProductoAccion, b: ProductoAccion): number {
  const ua = es_urgente(a) ? 0 : 1;
  const ub = es_urgente(b) ? 0 : 1;
  if (ua !== ub) return ua - ub;
  const ra = a.stock / a.umbral;
  const rb = b.stock / b.umbral;
  if (ra !== rb) return ra - rb;
  if (a.stock !== b.stock) return a.stock - b.stock;
  return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
}

function accion_reponer(p: ProductoAccion): AccionPropuesta {
  const cantidad = cantidad_reponer(p);
  return Object.freeze({
    tipo: "reponer",
    ref: p.sku,
    id: id_accion("reponer", p.sku),
    titulo: truncar_titulo(`Reponer ${p.nombre}`, 20),
    texto: `Reponer ${p.nombre}: quedan ${p.stock} (umbral ${p.umbral}).`,
    cantidad,
    ...(p.proveedor != null ? { proveedor: p.proveedor } : {}),
  });
}

function accion_cobrar(cliente: ClientePyme): AccionPropuesta {
  return Object.freeze({
    tipo: "cobrar",
    ref: cliente.id,
    id: id_accion("cobrar", cliente.id),
    titulo: truncar_titulo(`Cobrar a ${cliente.nombre}`, 20),
    texto: `Cobrar a ${cliente.nombre}: ${formatear_pesos(cliente.saldoCentavos)}.`,
  });
}

export function calcular_acciones_propuestas(args: EntradaAcciones): ReadonlyArray<AccionPropuesta> {
  const activos = new Set<string>(args.modulos);
  const acciones: AccionPropuesta[] = [];

  if (activos.has(MODULO_DE_ACCION.reponer)) {
    const bajos = args.productos.filter((p) => p.umbral > 0 && p.stock <= p.umbral).sort(comparar_reponer);
    for (const p of bajos) {
      if (acciones.length >= MAX_ACCIONES) break;
      acciones.push(accion_reponer(p));
    }
  }

  if (activos.has(MODULO_DE_ACCION.cobrar) && acciones.length < MAX_ACCIONES) {
    const deudor = deudores_a_cobrar(args.clientes)[0];
    if (deudor) acciones.push(accion_cobrar(deudor.cliente));
  }

  return Object.freeze(acciones.slice(0, MAX_ACCIONES));
}

export function acciones_a_botones(acciones: ReadonlyArray<AccionPropuesta>): ReadonlyArray<{ readonly id: string; readonly titulo: string }> {
  return Object.freeze(acciones.slice(0, MAX_ACCIONES).map((a) => ({ id: a.id, titulo: a.titulo })));
}

export function texto_acciones_sugeridas(acciones: ReadonlyArray<AccionPropuesta>): string {
  if (acciones.length === 0) return "";
  return [TEXTO_TITULO_ACCIONES, ...acciones.map((a) => `- ${a.texto}`)].join("\n");
}
