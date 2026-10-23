import { eq } from "drizzle-orm";
import { purchaseOrderLines, purchaseOrders } from "../../db/schema-proveedores.js";
import { conTenant } from "../tenant-mode.js";
import { dbVivaTenant, BaseNoDisponible } from "../server-db.js";
import {
  crearAlmacenOrderVistos,
  crearAlmacenPurchaseOrders,
} from "./_almacen.js";
import { listarCatalogoVivo, leerAlertaStock } from "./whatsapp.js";
import { listarProveedores } from "./proveedores.js";
import {
  asegurarLinea,
  decidirResolucion,
  fechaAR,
  skuAlerta,
  textoBorrador,
  type BorradorVisto,
  type CodigoDecision,
  type EfectoLinea,
  type OrdenBorradorAlerta,
  type PlanLinea,
} from "../../modules/alertas/armar-pedido.js";
import type { PurchaseOrder } from "../../modules/purchases/proveedores.js";

export const VER_BORRADOR = "/panel/proveedores" as const;

export type ResultadoArmarPedido =
  | {
      readonly ok: true;
      readonly reusado: boolean;
      readonly destino: "ahora" | "viernes";
      readonly orderId: string;
      readonly verEn: typeof VER_BORRADOR;
      readonly texto: string;
    }
  | {
      readonly ok: false;
      readonly codigo:
        | "FECHA_INVALIDA"
        | "SKU_INVALIDO"
        | CodigoDecision;
      readonly error: string;
    };

type CodigoError = "FECHA_INVALIDA" | "SKU_INVALIDO" | CodigoDecision;

const ERRORES: Record<CodigoError, string> = {
  FECHA_INVALIDA: "Fecha inválida.",
  SKU_INVALIDO: "SKU inválido.",
  ALERTA_INEXISTENTE: "No encontramos esa alerta.",
  SKU_AUSENTE: "Ese producto ya no está en el catálogo.",
  SIN_PROVEEDOR: "No hay un proveedor único para este producto.",
  YA_CERRADA: "Ese borrador ya está cerrado.",
  NO_VALIDA: "No se pudo armar el pedido.",
};

function asOrdenBorrador(orden: PurchaseOrder): OrdenBorradorAlerta {
  if (orden.estado !== "abierta") throw new Error("orden no abierta");
  return Object.freeze({
    ...orden,
    estado: "abierta",
    esSemanal: orden.esSemanal ?? false,
    origen: "web",
  });
}

function borradorVisto(clave: string): BorradorVisto {
  const vistos = crearAlmacenOrderVistos();
  const orden = vistos.obtener(clave) ?? crearAlmacenPurchaseOrders().obtener(`oc-${clave}`);
  if (!orden) return null;
  if (orden.estado !== "abierta") return { estado: "cerrada" };
  return { estado: "abierta", orden: asOrdenBorrador(orden) };
}

function espejarOrden(orden: OrdenBorradorAlerta): void {
  crearAlmacenOrderVistos().guardar(orden.idempotencyKey, orden);
  crearAlmacenPurchaseOrders().guardar(orden.id, orden);
}

function ordenDeFilas(
  head: typeof purchaseOrders.$inferSelect,
  lineas: ReadonlyArray<typeof purchaseOrderLines.$inferSelect>,
): PurchaseOrder {
  return Object.freeze({
    id: `oc-${head.idempotencyKey}`,
    idempotencyKey: head.idempotencyKey,
    supplierCuit: head.supplierCuit,
    estado: head.estado as "abierta" | "cerrada",
    lineas: Object.freeze(lineas.map((l) => ({ sku: l.sku, qty: l.qty, costoCentavos: l.costoCentavos }))),
    totalCentavos: head.totalCentavos,
    creadoPor: head.creadoPor,
    creadoEn: head.createdAt.toISOString(),
    cerradoEn: head.cerradoEn ? head.cerradoEn.toISOString() : null,
    esSemanal: head.esSemanal,
    origen: head.origen,
  });
}

function ordenDesdeEfecto(efecto: EfectoLinea): OrdenBorradorAlerta {
  if (efecto.tipo === "ya_estaba" || efecto.tipo === "crear" || efecto.tipo === "agregar") return efecto.orden;
  throw new Error("sin orden");
}

async function incorporarLinea(plan: PlanLinea): Promise<
  | { ok: true; reusado: boolean; orden: OrdenBorradorAlerta }
  | { ok: false; codigo: "YA_CERRADA" | "NO_VALIDA" }
> {
  const vistosMap = crearAlmacenOrderVistos().comoMapaSoloLectura();
  const db = dbVivaTenant();
  if (!db) {
    const visto = borradorVisto(plan.clave);
    const efecto = asegurarLinea(plan, visto, vistosMap);
    if (efecto.tipo === "rechazar") return { ok: false, codigo: efecto.codigo };
    const reusado = efecto.tipo === "ya_estaba";
    if (!reusado) espejarOrden(ordenDesdeEfecto(efecto));
    return { ok: true, reusado, orden: ordenDesdeEfecto(efecto) };
  }
  const efecto = await db.transaction(async (tx): Promise<EfectoLinea> => {
    const heads = await tx
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.idempotencyKey, plan.clave))
      .for("update")
      .limit(1);
    let visto: BorradorVisto = null;
    const head = heads[0];
    if (head) {
      const lineas = await tx
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.orderId, head.id));
      const orden = ordenDeFilas(head, lineas);
      visto = orden.estado === "abierta" ? { estado: "abierta", orden: asOrdenBorrador(orden) } : { estado: "cerrada" };
    }
    const efecto = asegurarLinea(plan, visto, vistosMap);
    if (efecto.tipo === "rechazar" || efecto.tipo === "ya_estaba") return efecto;
    if (efecto.tipo === "crear") {
      const ins = await tx
        .insert(purchaseOrders)
        .values({
          idempotencyKey: plan.clave,
          supplierCuit: efecto.orden.supplierCuit,
          estado: "abierta",
          totalCentavos: efecto.orden.totalCentavos,
          creadoPor: plan.creadoPor,
          esSemanal: plan.esSemanal,
          origen: "web",
        })
        .returning({ id: purchaseOrders.id });
      const fila = ins[0];
      if (fila) {
        await tx.insert(purchaseOrderLines).values({
          orderId: fila.id,
          sku: plan.linea.sku,
          qty: plan.linea.qty,
          costoCentavos: plan.linea.costoCentavos,
        });
      }
      return efecto;
    }
    if (efecto.tipo === "agregar" && head) {
      await tx.insert(purchaseOrderLines).values({
        orderId: head.id,
        sku: efecto.linea.sku,
        qty: efecto.linea.qty,
        costoCentavos: efecto.linea.costoCentavos,
      });
      await tx
        .update(purchaseOrders)
        .set({ totalCentavos: efecto.orden.totalCentavos })
        .where(eq(purchaseOrders.id, head.id));
    }
    return efecto;
  });
  if (efecto.tipo === "rechazar") return { ok: false, codigo: efecto.codigo };
  const reusado = efecto.tipo === "ya_estaba";
  if (!reusado) espejarOrden(ordenDesdeEfecto(efecto));
  return { ok: true, reusado, orden: ordenDesdeEfecto(efecto) };
}

async function ejecutar(input: {
  readonly tenantId: string;
  readonly creadoPor: string;
  readonly sku: string;
  readonly fecha: string;
  readonly ahoraIso: string;
}): Promise<ResultadoArmarPedido> {
  const fecha = fechaAR(input.fecha);
  if (!fecha) return { ok: false, codigo: "FECHA_INVALIDA", error: ERRORES.FECHA_INVALIDA };
  const sku = skuAlerta(input.sku);
  if (!sku) return { ok: false, codigo: "SKU_INVALIDO", error: ERRORES.SKU_INVALIDO };

  const alerta = await leerAlertaStock(input.tenantId, sku, fecha);
  const catalogo = await listarCatalogoVivo(input.tenantId);
  const item = catalogo.find((c) => c.sku === sku) ?? null;
  const { proveedores } = await listarProveedores();
  const activos = proveedores.filter((p) => p.activo);

  const decision = decidirResolucion({
    alerta: alerta ? { urgente: alerta.urgente, nombre: alerta.nombre } : null,
    item,
    proveedoresActivos: activos,
    creadoPor: input.creadoPor,
    ahoraIso: input.ahoraIso,
    fecha,
  });
  if (decision.tipo === "rechazar") {
    const codigo = decision.codigo;
    return { ok: false, codigo, error: ERRORES[codigo] };
  }

  let aplicado: Awaited<ReturnType<typeof incorporarLinea>>;
  try {
    aplicado = await incorporarLinea(decision.plan);
  } catch (e) {
    if (e instanceof BaseNoDisponible) throw e;
    return { ok: false, codigo: "NO_VALIDA", error: ERRORES.NO_VALIDA };
  }
  if (!aplicado.ok) {
    return { ok: false, codigo: aplicado.codigo, error: ERRORES[aplicado.codigo] };
  }

  const reusado = aplicado.reusado;
  const texto = textoBorrador({
    destino: decision.plan.destino,
    reusado,
    producto: decision.plan.producto,
    proveedor: decision.plan.proveedorNombre,
  });
  return {
    ok: true,
    reusado,
    destino: decision.plan.destino,
    orderId: aplicado.orden.id,
    verEn: VER_BORRADOR,
    texto,
  };
}

export async function armarPedidoDeAlerta(input: {
  readonly tenantId: string;
  readonly creadoPor: string;
  readonly sku: string;
  readonly fecha: string;
  readonly ahoraIso: string;
}): Promise<ResultadoArmarPedido> {
  return conTenant(input.tenantId, () => ejecutar(input));
}
