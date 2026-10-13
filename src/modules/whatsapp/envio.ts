// Núcleo puro envío Cloud API (PRD Bot 6.4). Builders de payloads con los
// límites Meta + decisión libre-vs-plantilla. Sin IO, sin red, sin env:
// el adaptador (cliente-cloud.ts) hace el fetch con token del servidor.

// Plantilla de utilidad paga (~USD 0,026 AR). Dinero siempre bigint.
export const COSTO_PLANTILLA_CENTAVOS = 2600n as const;
export const API_VERSION_DEFECTO = "v21.0" as const;

export interface PayloadTexto {
  readonly type: "text";
  readonly text: { readonly body: string; readonly preview_url: false };
}

export interface PayloadBotones {
  readonly type: "interactive";
  readonly interactive: {
    readonly type: "button";
    readonly body: { readonly text: string };
    readonly action: { readonly buttons: ReadonlyArray<{ readonly type: "reply"; readonly reply: { readonly id: string; readonly title: string } }> };
  };
}

export interface PayloadLista {
  readonly type: "interactive";
  readonly interactive: {
    readonly type: "list";
    readonly body: { readonly text: string };
    readonly action: {
      readonly button: string;
      readonly sections: ReadonlyArray<{
        readonly title: string;
        readonly rows: ReadonlyArray<{ readonly id: string; readonly title: string; readonly description?: string | undefined }>;
      }>;
    };
  };
}

export type PayloadEnvio = PayloadTexto | PayloadBotones | PayloadLista;

// Trunca sin romper surrogate (límite Meta, no cambia semántica).
export function truncar_titulo(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  return `${chars.slice(0, max - 1).join("")}…`;
}

export function construir_texto(body: string): PayloadTexto {
  return { type: "text", text: { body, preview_url: false } };
}

export function construir_botones(body: string, opciones: ReadonlyArray<{ id: string; titulo: string }>): PayloadBotones {
  const botones = opciones.slice(0, 3).map((o) => ({ type: "reply" as const, reply: { id: o.id, title: truncar_titulo(o.titulo, 20) } }));
  return { type: "interactive", interactive: { type: "button", body: { text: body }, action: { buttons: botones } } };
}

export function construir_lista(
  body: string,
  botonTexto: string,
  filas: ReadonlyArray<{ id: string; titulo: string; descripcion?: string | undefined }>,
): PayloadLista {
  const rows = filas.slice(0, 10).map((f) => ({
    id: f.id,
    title: truncar_titulo(f.titulo, 24),
    ...(f.descripcion ? { description: f.descripcion } : {}),
  }));
  return {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: { button: truncar_titulo(botonTexto, 20), sections: [{ title: "Opciones", rows }] },
    },
  };
}

export function construir_mark_read(wamidEntrante: string): { messaging_product: "whatsapp"; status: "read"; message_id: string } {
  return { messaging_product: "whatsapp", status: "read", message_id: wamidEntrante };
}

export function construir_body_envio(toE164: string, payload: PayloadEnvio): Record<string, unknown> {
  return { messaging_product: "whatsapp", recipient_type: "individual", to: toE164, ...payload };
}

// Fuera de la ventana 24h solo sale plantilla aprobada (PRD 6.4).
// El contenido de plantillas queda fuera del slice.
export type ModoEnvio = "libre" | "requiere_plantilla";
export function decidir_modo(dentroVentana24h: boolean): ModoEnvio {
  return dentroVentana24h ? "libre" : "requiere_plantilla";
}
