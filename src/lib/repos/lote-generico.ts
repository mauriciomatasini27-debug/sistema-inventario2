import { stockLots } from "../../db/schema.js";
import { idLoteGenerico } from "../../modules/inventario/lote-generico.js";
import { dbVivaTenant, type TenantDb } from "../server-db.js";
import { filaConTenant } from "../tenant-scope.js";
import { crearAlmacenLotes } from "./_almacen.js";

export async function asegurarLoteGenerico(
  sku: string,
  tx?: Pick<TenantDb, "insert">,
  teorico?: number,
): Promise<string> {
  const id = idLoteGenerico(sku);
  const almacenLotes = crearAlmacenLotes();
  const yaExiste = almacenLotes.contiene(id);
  let restanteInicial = 0;
  if (teorico !== undefined && !yaExiste) {
    const suma = [...almacenLotes.comoMapaSoloLectura().values()]
      .filter((l) => l.sku === sku)
      .reduce((a, l) => a + l.cantidadRestante, 0);
    restanteInicial = Math.max(0, teorico - suma);
  }
  if (!yaExiste) {
    almacenLotes.guardar(id, {
      id,
      sku,
      cantidad: restanteInicial,
      cantidadRestante: restanteInicial,
      venceEl: null,
      costoCentavos: "0",
    });
  }
  const db = tx ?? dbVivaTenant();
  if (db) {
    await db
      .insert(stockLots)
      .values(
        filaConTenant({
          id,
          sku,
          cantidad: restanteInicial,
          cantidadRestante: restanteInicial,
          venceEl: null,
          costoCentavos: 0n,
        }),
      )
      .onConflictDoNothing();
  }
  return id;
}
