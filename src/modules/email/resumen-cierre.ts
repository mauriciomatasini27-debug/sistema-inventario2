// Núcleo puro NE4/NE11: evento resumen_cierre + encolado idempotente.
// Patrón vender_mostrador: el núcleo decide, el adaptador persiste.
// La misma tx que inserta closing_summaries inserta evento + outbox.

import { armar_cierre, type DatosCierre } from "./plantilla-cierre.js";
import { puede_enviar_email, type EmailProvider, type PreferenciasEmail } from "./proveedor.js";

export interface ResumenCierrePayload {
  readonly cierreId: string;
  readonly fechaJornada: string;
  readonly totalCentavos: string;
  readonly porMedio: Record<string, string>;
  readonly tipo: string;
}

export interface EventoResumen {
  readonly tipo: "resumen_cierre";
  readonly dedupeKey: string;
  readonly idempotencyKey: string;
  readonly payload: ResumenCierrePayload;
}

export function clave_resumen_cierre(tenantId: string, fechaJornada: string): string {
  return `resumen_cierre:${tenantId}:${fechaJornada}`;
}

export function describir_resumen_cierre(args: {
  tenantId: string;
  cierreId: string;
  fechaJornada: string;
  totalCentavos: bigint;
  porMedio: Record<string, bigint>;
  tipo: string;
}): EventoResumen {
  const dedupeKey = clave_resumen_cierre(args.tenantId, args.fechaJornada);
  const porMedio: Record<string, string> = {};
  for (const [k, v] of Object.entries(args.porMedio)) porMedio[k] = v.toString();
  return {
    tipo: "resumen_cierre",
    dedupeKey,
    idempotencyKey: `cierre-email:${args.tenantId}:${args.fechaJornada}`,
    payload: {
      cierreId: args.cierreId,
      fechaJornada: args.fechaJornada,
      totalCentavos: args.totalCentavos.toString(),
      porMedio,
      tipo: args.tipo,
    },
  };
}

export interface OutboxPendiente {
  idempotencyKey: string;
  destinatario: string;
  asunto: string;
  html: string;
  texto: string;
  estado: "pendiente" | "enviado";
  intentos: number;
  providerMessageId: string | null;
}

export type EncolarResultado =
  | { status: 201; evento: EventoResumen; envio: OutboxPendiente }
  | { status: 409; error: string };

// Encola evento + email en memoria (el adaptador Drizzle usa la misma
// forma contra notification_events + email_outbox en una tx).
export function encolar_resumen_cierre(
  tiendas: { eventos: Map<string, EventoResumen>; outbox: Map<string, OutboxPendiente> },
  args: {
    tenantId: string;
    cierreId: string;
    fechaJornada: string;
    totalCentavos: bigint;
    porMedio: Record<string, bigint>;
    tipo: string;
    datosPlantilla: DatosCierre;
    destinatario: string;
  },
): EncolarResultado {
  const evento = describir_resumen_cierre(args);
  if (tiendas.eventos.has(evento.dedupeKey)) return { status: 409, error: "resumen ya encolado" };
  const previoOutbox = tiendas.outbox.get(evento.idempotencyKey);
  if (previoOutbox) return { status: 409, error: "idempotency-key repetida" };
  const plantilla = armar_cierre(args.datosPlantilla);
  const envio: OutboxPendiente = {
    idempotencyKey: evento.idempotencyKey,
    destinatario: args.destinatario,
    asunto: plantilla.asunto,
    html: plantilla.html,
    texto: plantilla.texto,
    estado: "pendiente",
    intentos: 0,
    providerMessageId: null,
  };
  tiendas.eventos.set(evento.dedupeKey, evento);
  tiendas.outbox.set(evento.idempotencyKey, envio);
  return { status: 201, evento, envio };
}

// Orquestador mínimo del slice: procesa pendientes con gate NE9.
// Backoff completo 24h + jitter quedan para P1 (NE11).
export async function procesar_pendientes(
  tiendas: { outbox: Map<string, OutboxPendiente> },
  provider: EmailProvider,
  prefs: PreferenciasEmail,
  ahoraMs: number,
): Promise<{ enviados: number; omitidos: number }> {
  let enviados = 0;
  let omitidos = 0;
  if (!puede_enviar_email(prefs, ahoraMs)) {
    for (const envio of tiendas.outbox.values()) {
      if (envio.estado === "pendiente") omitidos += 1;
    }
    return { enviados, omitidos };
  }
  for (const envio of tiendas.outbox.values()) {
    if (envio.estado !== "pendiente") continue;
    envio.intentos += 1;
    const r = await provider.send({
      para: envio.destinatario,
      asunto: envio.asunto,
      html: envio.html,
      texto: envio.texto,
      idempotencyKey: envio.idempotencyKey,
      categoria: "cierre",
      plantilla: "cierre_v1",
    });
    if (r.ok) {
      envio.estado = "enviado";
      envio.providerMessageId = r.providerMessageId;
      enviados += 1;
    }
  }
  return { enviados, omitidos };
}
