import { cantidad_reponer, costoCentavosReponer } from "../bot/acciones-propuestas.js";
import {
  crearOrden,
  editarOrden,
  elegirProveedorUnico,
  normalizarCuit,
  type PurchaseOrder,
  type PurchaseOrderLine,
} from "../purchases/proveedores.js";

export type DestinoBorrador =
  | { readonly kind: "ahora"; readonly ancla: string }
  | { readonly kind: "viernes"; readonly ancla: string };

export interface OrdenBorradorAlerta extends PurchaseOrder {
  readonly estado: "abierta";
  readonly esSemanal: boolean;
  readonly origen: "web";
}

export interface PlanLinea {
  readonly clave: string;
  readonly supplierCuit: string;
  readonly proveedorNombre: string;
  readonly esSemanal: boolean;
  readonly destino: "ahora" | "viernes";
  readonly linea: PurchaseOrderLine;
  readonly creadoPor: string;
  readonly ahoraIso: string;
  readonly producto: string;
}

export type BorradorVisto =
  | null
  | { readonly estado: "abierta"; readonly orden: OrdenBorradorAlerta }
  | { readonly estado: "cerrada" };

export type CodigoDecision =
  | "ALERTA_INEXISTENTE"
  | "SKU_AUSENTE"
  | "SIN_PROVEEDOR"
  | "YA_CERRADA"
  | "NO_VALIDA";

export type DecisionAlerta =
  | { readonly tipo: "rechazar"; readonly codigo: CodigoDecision }
  | { readonly tipo: "incorporar"; readonly plan: PlanLinea };

export type EfectoLinea =
  | { readonly tipo: "rechazar"; readonly codigo: "YA_CERRADA" | "NO_VALIDA" }
  | { readonly tipo: "ya_estaba"; readonly orden: OrdenBorradorAlerta }
  | { readonly tipo: "crear"; readonly orden: OrdenBorradorAlerta }
  | { readonly tipo: "agregar"; readonly orden: OrdenBorradorAlerta; readonly linea: PurchaseOrderLine };

export function fechaAR(input: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (m?.[1] === undefined || m?.[2] === undefined || m?.[3] === undefined) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return input;
}

export function skuAlerta(input: string): string | null {
  if (!input || input.length > 64 || input.includes(":")) return null;
  return input;
}

export function viernesDe(fecha: string): string {
  const base = Date.parse(`${fecha}T00:00:00Z`);
  const dias = Math.floor(base / 86_400_000);
  const dow = (dias + 4) % 7;
  const faltan = (5 - dow + 7) % 7;
  if (faltan === 0) return fecha;
  const d = new Date(base + faltan * 86_400_000);
  const p2 = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

export function destinoDeAlerta(urgente: boolean, fecha: string): DestinoBorrador {
  if (urgente) return { kind: "ahora", ancla: fecha };
  return { kind: "viernes", ancla: viernesDe(fecha) };
}

export function claveBorrador(cuit: string, destino: DestinoBorrador): string {
  return `alerta-borrador:v1:${normalizarCuit(cuit)}:${destino.kind}:${destino.ancla}`;
}

export function conDestino(orden: PurchaseOrder, esSemanal: boolean, clave: string): OrdenBorradorAlerta {
  if (orden.estado !== "abierta") throw new Error("orden no abierta");
  return Object.freeze({
    ...orden,
    id: `oc-${clave}`,
    idempotencyKey: clave,
    estado: "abierta",
    esSemanal,
    origen: "web",
  });
}

export function decidirResolucion(input: {
  readonly alerta: { readonly urgente: boolean; readonly nombre: string } | null;
  readonly item: {
    readonly sku: string;
    readonly nombre: string;
    readonly stock: number;
    readonly umbral: number;
    readonly precioCentavos: bigint;
    readonly costoCentavos?: bigint | undefined;
    readonly reorderQty?: number | null | undefined;
    readonly proveedor?: string | null | undefined;
  } | null;
  readonly proveedoresActivos: readonly { readonly cuit: string; readonly nombre: string }[];
  readonly creadoPor: string;
  readonly ahoraIso: string;
  readonly fecha: string;
}): DecisionAlerta {
  if (!input.alerta) return { tipo: "rechazar", codigo: "ALERTA_INEXISTENTE" };
  if (!input.item) return { tipo: "rechazar", codigo: "SKU_AUSENTE" };
  const elegido = elegirProveedorUnico(input.item.proveedor, input.proveedoresActivos);
  if (!elegido) return { tipo: "rechazar", codigo: "SIN_PROVEEDOR" };
  const destino = destinoDeAlerta(input.alerta.urgente, input.fecha);
  const esSemanal = destino.kind === "viernes";
  const qty = cantidad_reponer({
    sku: input.item.sku,
    nombre: input.item.nombre,
    stock: input.item.stock,
    umbral: input.item.umbral,
    reorderQty: input.item.reorderQty ?? null,
  });
  const costo = costoCentavosReponer(input.item);
  const clave = claveBorrador(elegido.cuit, destino);
  return {
    tipo: "incorporar",
    plan: {
      clave,
      supplierCuit: elegido.cuit,
      proveedorNombre: elegido.nombre,
      esSemanal,
      destino: destino.kind,
      linea: { sku: input.item.sku, qty, costoCentavos: costo },
      creadoPor: input.creadoPor,
      ahoraIso: input.ahoraIso,
      producto: input.alerta.nombre,
    },
  };
}

function borradorCoincide(plan: PlanLinea, orden: OrdenBorradorAlerta): boolean {
  return (
    normalizarCuit(orden.supplierCuit) === normalizarCuit(plan.supplierCuit) &&
    Boolean(orden.esSemanal) === plan.esSemanal
  );
}

export function asegurarLinea(plan: PlanLinea, actual: BorradorVisto, vistos: ReadonlyMap<string, PurchaseOrder>): EfectoLinea {
  if (actual?.estado === "cerrada") return { tipo: "rechazar", codigo: "YA_CERRADA" };
  if (actual?.estado === "abierta" && !borradorCoincide(plan, actual.orden)) {
    return { tipo: "rechazar", codigo: "NO_VALIDA" };
  }
  if (actual?.estado === "abierta") {
    const tiene = actual.orden.lineas.some((l) => l.sku === plan.linea.sku);
    if (tiene) return { tipo: "ya_estaba", orden: actual.orden };
    const editado = editarOrden(actual.orden, [...actual.orden.lineas, plan.linea], plan.ahoraIso);
    if (!editado.ok) return { tipo: "rechazar", codigo: "NO_VALIDA" };
    const orden = conDestino(editado.orden, plan.esSemanal, plan.clave);
    return { tipo: "agregar", orden, linea: plan.linea };
  }
  const creada = crearOrden({
    idempotencyKey: plan.clave,
    supplierCuit: plan.supplierCuit,
    lineas: [plan.linea],
    creadoPor: plan.creadoPor,
    ahoraIso: plan.ahoraIso,
    vistos,
  });
  if (creada.status !== 201) return { tipo: "rechazar", codigo: "NO_VALIDA" };
  return { tipo: "crear", orden: conDestino(creada.orden, plan.esSemanal, plan.clave) };
}

export function textoBorrador(args: {
  readonly destino: "ahora" | "viernes";
  readonly reusado: boolean;
  readonly producto: string;
  readonly proveedor: string;
}): string {
  const { destino, reusado, producto, proveedor } = args;
  if (destino === "viernes") {
    if (reusado) {
      return `Ese producto ya estaba en la lista del viernes de ${proveedor}. No se envió nada. Lo ves en Proveedores.`;
    }
    return `${producto} quedó en la lista del viernes de ${proveedor}. No se envió nada. Lo ves en Proveedores.`;
  }
  if (reusado) {
    return `Ese producto ya estaba en el pedido para ahora de ${proveedor}. No se envió nada. Lo ves en Proveedores.`;
  }
  return `${producto} quedó en el pedido para ahora de ${proveedor}. No se envió nada. Lo ves en Proveedores.`;
}
