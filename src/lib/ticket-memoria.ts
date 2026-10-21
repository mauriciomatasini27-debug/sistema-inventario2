import { store } from "./store.js";

export interface LineaTicketMemoria {
  sale_id: string;
  product_id: string;
  qty: number;
  precio_centavos: string;
}

export interface DescuentoTicketMemoria {
  sale_id: string;
  linea_idx: number;
  sku: string;
  bruto_centavos: string;
  desc_linea_centavos: string;
  desc_ticket_centavos: string;
  neto_centavos: string;
}

export interface TicketFiadoMemoria {
  sale_id: string;
  ticket_definitivo: string | null;
  ticket_provisorio: string;
  total_centavos: string;
  medio: string;
  sobreventa: boolean;
  idempotency_key: string;
}

export function guardarTicketFiado(saleId: string, ticket: TicketFiadoMemoria): void {
  store.fiadoTickets.set(saleId, ticket);
}

export function obtenerTicketFiado(saleId: string): TicketFiadoMemoria | undefined {
  return store.fiadoTickets.get(saleId);
}

export function listarTicketsFiado(): TicketFiadoMemoria[] {
  return [...store.fiadoTickets.values()];
}

export function agregarLineaTicket(linea: LineaTicketMemoria): void {
  store.ticketLineas.push(linea);
}

export function listarLineasTicket(saleId: string): LineaTicketMemoria[] {
  return store.ticketLineas.filter((l) => l.sale_id === saleId);
}

export function listarTodasLasLineasTicket(): LineaTicketMemoria[] {
  return store.ticketLineas;
}

export function listarAltasAlVender(): string[] {
  return [...store.altasAlVender];
}

export function agregarDescuentoTicket(descuento: DescuentoTicketMemoria): void {
  store.ticketDescuentos.push(descuento);
}

export function listarDescuentosTicket(saleId: string): DescuentoTicketMemoria[] {
  return store.ticketDescuentos.filter((d) => d.sale_id === saleId);
}

export function listarTodosLosDescuentosTicket(): DescuentoTicketMemoria[] {
  return store.ticketDescuentos;
}

export function agregarStockMoveMemoria(m: (typeof store)["stockMoves"][number]): void {
  store.stockMoves.push(m);
}
