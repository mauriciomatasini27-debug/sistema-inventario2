// Promoción offline → fiscal (FE-S22/S23, ADR-0018 D6).
// Puro: ordena pendientes_de_sync por ocurrencia cliente, resuelve CbteFch con
// hora servidor y los deja en pendiente listos para el worker. No toca red ni DB.
import { resolver_cola_sync } from "./fecha.js";
import type { StoredFiscalDoc } from "../../lib/store.js";

export interface Promovido {
  readonly id: string;
  readonly fch: string;
  readonly leyenda: string | null;
}

export function promover_cola_sync(
  docs: ReadonlyArray<StoredFiscalDoc>,
  ultimoFch: string | null,
  hoyFch: string,
): { actualizados: StoredFiscalDoc[]; promovidos: Promovido[] } {
  const cola = docs
    .filter((d) => d.estado === "pendiente_de_sync")
    .map((d) => ({ id: d.id, clientOcurredAt: d.client_ocurred_at ?? d.cbte_fch, ventaFch: d.cbte_fch }));
  const resueltos = resolver_cola_sync(cola, ultimoFch, hoyFch);
  const porId = new Map(resueltos.map((r) => [r.id, r] as const));
  const actualizados = docs.map((d) => {
    const r = porId.get(d.id);
    if (!r) return d;
    return { ...d, cbte_fch: r.fch, estado: "pendiente" as const, venta_leyenda: r.leyenda };
  });
  return { actualizados, promovidos: resueltos.map((r) => ({ id: r.id, fch: r.fch, leyenda: r.leyenda })) };
}

// Aviso FE-S23: cuántas ventas siguen sin facturar (pendientes de sync o en
// espera de datos) para mostrar al recuperar conexión.
export function contar_sin_facturar(docs: ReadonlyArray<StoredFiscalDoc>): number {
  return docs.filter((d) => d.estado === "pendiente_de_sync" || d.estado === "en_espera_de_datos" || d.estado === "pendiente").length;
}

// FE-S14: las NC en espera_cae salen en orden tras autorizar la factura
// original. Completa CbtesAsoc con el número ya autorizado y las deja en
// pendiente listas para el worker. Puro.
export function promover_nc_tras_cae(docs: ReadonlyArray<StoredFiscalDoc>, saleId: string): StoredFiscalDoc[] {
  const factura = docs.find(
    (d) => d.sale_id === saleId && (d.cbte_tipo === "11" || d.cbte_tipo === "6" || d.cbte_tipo === "1") && d.estado === "autorizado",
  );
  if (!factura || factura.cbte_nro === null) return [...docs];
  return docs.map((d) => {
    if (d.sale_id !== saleId || d.estado !== "espera_cae") return d;
    return {
      ...d,
      estado: "pendiente" as const,
      cbtes_asoc_tipo: factura.cbte_tipo,
      cbtes_asoc_pto_vta: factura.pto_vta,
      cbtes_asoc_nro: factura.cbte_nro,
    };
  });
}
