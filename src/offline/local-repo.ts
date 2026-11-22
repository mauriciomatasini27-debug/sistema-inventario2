import { confirmar_venta } from "../modules/sales/confirmar_venta.js";
import { descontar, type Sku } from "../modules/inventario/inventario.js";
import { lotesDesdeStockGenerico } from "../modules/inventario/lote-generico.js";
import { store } from "../lib/store.js";
import { encolar } from "./outbox-store.js";
import type {
  IdProv,
  MovimientoProv,
  OpLocal,
  RegistrarCajaInput,
  TicketProv,
  VenderInput,
} from "./types.js";

// Efecto local síncrono dentro de la misma transacción que encolar:
// "aplico + encolo o nada" (per make-operations-idempotent).
// El núcleo puro confirmar_venta sigue sin IO; este módulo es el adaptador
// que lo aplica sobre local_* y devuelve provisorios.

const DEFAULT_DEVICE = "caja-01";

/** Convierte VenderInput a efecto encolable (resumen determinista para dedup). */
export function toEfectoVenta(input: VenderInput): { kind: "venta"; resumen: string } {
  return { kind: "venta", resumen: `${input.sku}x${input.cant}:${input.medio}` };
}

/** Aplica venta sobre local_* y devuelve ticket provisorio + op. */
export async function aplicarVenta(input: VenderInput, deviceCode: string = DEFAULT_DEVICE): Promise<{ ticket: TicketProv; op: OpLocal }> {
  // Sin transact externo: encolar() ya serializa la asignación de seq.
  // Anidar transact() acá colgaría (la cola serial espera al outer pendiente).
  // Cuando el backing sea SQLite real, este cuerpo será una sola tx.
  if (!input.sku || input.cant < 1 || input.cant > 999) throw new Error("venta invalida");
  const stock = store.stock.get(input.sku) ?? store.stock.get("demo-sku-1") ?? 0;
  const precio = store.prices.get(input.sku) ?? store.prices.get("demo-sku-1") ?? 0;
  const op = await encolar(toEfectoVenta(input), deviceCode);
  // Cobertura FEFO antes del ticket; offline nunca bloquea (E2 marca sobreventa).
  const decision = descontar({
    lotes: lotesDesdeStockGenerico(store.stock),
    lineas: [{ sku: input.sku as Sku, cantidad: input.cant }],
    modo: "OFFLINE_PERMITIDO",
    idemKey: op.opId,
  });
  if (!decision.ok) throw new Error("venta invalida");
  const provisorio = `${deviceCode}-${op.seq}` as IdProv;
  const r = confirmar_venta({
    idempotencyKey: op.opId,
    lineas: [{ product_id: input.sku, qty: input.cant, precio_centavos: BigInt(precio) }],
    medio: input.medio,
    device_code: deviceCode,
    seq_local: Number(op.seq),
    offline: true,
    stockDisponible: new Map([[input.sku, stock]]),
    vistos: new Map(),
    proximoDefinitivo: () => `T-${op.opId.slice(0, 8)}`,
    clientOccurredAt: new Date().toISOString(),
  });
  if (r.status !== 201) throw new Error(r.error);
  void r.ticket.sobreventa;
  const ticket: TicketProv = { provisorio, total: r.ticket.total_centavos, medio: input.medio };
  return { ticket, op };
}

/** Aplica movimiento de caja sobre cash_*_local. */
export async function aplicarMovCaja(
  input: RegistrarCajaInput,
  deviceCode: string = DEFAULT_DEVICE,
): Promise<{ idProvisorio: string; op: OpLocal; prov: MovimientoProv }> {
  if (input.montoCentavos <= 0n) throw new Error("monto invalido");
  const op = await encolar({ kind: "mov_caja", resumen: `${input.tipo}:${input.montoCentavos}:${input.motivo}` }, deviceCode);
  const idProvisorio = `${deviceCode}-${op.seq}`;
  const prov: MovimientoProv = { idProvisorio: idProvisorio as IdProv, estadoSync: "pendiente" };
  return { idProvisorio, op, prov };
}
