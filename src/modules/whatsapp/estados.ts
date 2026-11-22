// WA-ESTADOS-WEBHOOK [plataforma]: el webhook de estados de Meta informa cada salto del mensaje (sent, delivered, read, failed) en un POST aparte a la misma URL, con la misma firma; antes se descartaba y estado quedaba en "enviado" para siempre.
// WA-ESTADOS-WEBHOOK [plataforma]: núcleo puro, sin IO ni env.

export type EstadoEnvio = "enviado" | "entregado" | "leido" | "fallido";

export interface EstadoRecibido {
  readonly wamid: string;
  readonly estado: EstadoEnvio;
  readonly timestampMs: number;
  readonly destinatario: string;
  readonly codigoError: number | null;
  readonly motivoError: string | null;
}

// WA-ESTADOS-WEBHOOK [plataforma]: deleted y warning no son un salto del mensaje, así que no mueven ni el estado ni las marcas.
const MAPA: Readonly<Record<string, EstadoEnvio>> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

// WA-ESTADOS-WEBHOOK [plataforma]: el rango decide quién gana al fusionar; fallido va último porque es terminal.
const RANGO: Readonly<Record<EstadoEnvio, number>> = { enviado: 1, entregado: 2, leido: 3, fallido: 4 };

export function rangoDeEstado(estado: EstadoEnvio): number {
  return RANGO[estado];
}

// WA-ESTADOS-WEBHOOK [plataforma]: Meta puede entregar los estados desordenados y reintentar el webhook, así que nunca se retrocede: un "sent" atrasado no pisa un "read" ya guardado.
export function ganaEstado(actual: EstadoEnvio | null, nuevo: EstadoEnvio): boolean {
  if (actual === null) return true;
  if (nuevo === "fallido") return actual !== "fallido";
  if (actual === "fallido") return false;
  return RANGO[nuevo] > RANGO[actual];
}

function textoONull(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function numeroONull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

interface CrudoEstado {
  readonly id?: unknown;
  readonly status?: unknown;
  readonly timestamp?: unknown;
  readonly recipient_id?: unknown;
  readonly errors?: unknown;
}

// WA-ESTADOS-WEBHOOK [plataforma]: el motivo visible sale de error_data.details, que es el que explica el caso concreto; si falta, cae a message y después a title.
function motivoDeErrores(errors: unknown): { codigo: number | null; motivo: string | null } {
  if (!Array.isArray(errors) || errors.length === 0) return { codigo: null, motivo: null };
  const e = errors[0] as { code?: unknown; title?: unknown; message?: unknown; error_data?: { details?: unknown } };
  const detalle = textoONull(e?.error_data?.details);
  return {
    codigo: numeroONull(e?.code),
    motivo: detalle ?? textoONull(e?.message) ?? textoONull(e?.title),
  };
}

// WA-ESTADOS-WEBHOOK [plataforma]: un webhook puede traer varios estados; se devuelven los reconocidos y se descarta el que no tenga wamid o destinatario, porque sin destinatario no se resuelve el comercio.
export function extraer_estados_meta(body: unknown): EstadoRecibido[] {
  const out: EstadoRecibido[] = [];
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown } })?.value?.statuses;
      if (!Array.isArray(statuses)) continue;
      for (const crudo of statuses as CrudoEstado[]) {
        const wamid = textoONull(crudo?.id);
        const destinatario = textoONull(crudo?.recipient_id);
        const estado = MAPA[String(crudo?.status ?? "")];
        if (!wamid || !destinatario || !estado) continue;
        const { codigo, motivo } = motivoDeErrores(crudo?.errors);
        const ts = numeroONull(crudo?.timestamp);
        out.push({
          wamid,
          estado,
          destinatario,
          timestampMs: ts === null ? Date.now() : ts * 1000,
          codigoError: estado === "fallido" ? codigo : null,
          motivoError: estado === "fallido" ? motivo : null,
        });
      }
    }
  }
  return out;
}
