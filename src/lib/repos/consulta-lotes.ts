import { conTenant } from "../tenant-mode.js";
import { dbVivaTenant } from "../server-db.js";
import { crearAlmacenLotes, crearAlmacenProductos } from "./_almacen.js";
import { listarLotesDetalle } from "./lotes.js";
import { armarRespuestaDetalle, type LoteCrudo } from "../../modules/whatsapp/consulta.js";

// BOT2-S4: el flag sigue en la ficha en memoria que escribe el alta (CAT-S3).
// Sin ese flag la consulta no inventa lotes, aunque haya filas en stock_lots.
function enTenant<T>(tenantId: string | null, fn: () => T): T {
  if (!tenantId) return fn();
  return conTenant(tenantId, fn);
}

export function controlaVencimientoDe(tenantId: string | null, sku: string): boolean {
  const clave = sku.trim().toUpperCase();
  return enTenant(tenantId, () => {
    for (const f of crearAlmacenProductos().comoMapaSoloLectura().values()) {
      if (f.sku.trim().toUpperCase() === clave) return f.controlaVencimiento === true;
    }
    return false;
  });
}

function lotesDeLaParticion(tenantId: string): LoteCrudo[] {
  return [...crearAlmacenLotes().comoMapaSoloLectura().values()].map((l) => ({
    id: l.id,
    tenantId,
    sku: l.sku,
    venceEl: l.venceEl,
    // Cantidad que queda: el vendedor pregunta stock, no el alta original.
    cantidad: l.cantidadRestante,
  }));
}

// Lotes de la partición de este tenant, sin filtrar sku: el recorte es de
// preparar_detalle_lotes, así un olvido del filtro se ve en el test.
export function lotesMemoriaDelTenant(tenantId: string): LoteCrudo[] {
  return conTenant(tenantId, () => lotesDeLaParticion(tenantId));
}

export async function cargarLotesConsulta(tenantId: string | null, sku: string): Promise<LoteCrudo[]> {
  const clave = sku.trim().toUpperCase();
  const marca = tenantId ?? "";
  return enTenant(tenantId, async () => {
    const db = dbVivaTenant(tenantId ?? undefined);
    if (!db) return lotesDeLaParticion(marca);
    const filas = await listarLotesDetalle(clave);
    return filas.map((l) => ({
      id: l.id,
      tenantId: marca,
      sku: l.sku,
      venceEl: l.venceEl,
      cantidad: l.cantidadRestante,
    }));
  });
}

export async function textoDetalleSiCorresponde(opts: {
  tenantId: string | null;
  sku: string;
  nombre: string;
  comercio: string;
}): Promise<string | null> {
  if (!controlaVencimientoDe(opts.tenantId, opts.sku)) return null;
  const lotes = await cargarLotesConsulta(opts.tenantId, opts.sku);
  return armarRespuestaDetalle({
    tenantId: opts.tenantId ?? "",
    sku: opts.sku,
    nombre: opts.nombre,
    comercio: opts.comercio,
    controlaVencimiento: true,
    lotes,
  });
}
