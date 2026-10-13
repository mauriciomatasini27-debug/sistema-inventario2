// Job P1-1/P1-2: alertas de seguridad WA con fallback a email.
// Puro sin IO directa: decide con decidirAlertaSeguridad() y envía por los
// senders inyectados. Idempotente por event_id + memoria del proceso, con
// claves independientes por canal. Best-effort: un fallo no bloquea nada.

import {
  armarTextoAlertaSeguridad,
  claveAlertaSeguridad,
  decidirAlertaSeguridad,
  esEventoAlertaSeguridad,
  type EventoAlertaSeguridad,
} from "../modules/auth/bot.js";
import {
  armarEmailSeguridad,
  claveAlertaEmail,
  debeProbarEmail,
} from "../modules/auth/segundo-canal.js";

export interface EventoSeguridadEntrada {
  readonly eventId: string;
  readonly tipo: string;
  readonly tenantId: string;
  readonly googleSubDestino: string;
  readonly rolDestino: "dueno" | "empleado";
  readonly vinculado: boolean;
  readonly puedeUsarBot?: boolean | undefined;
  readonly comercio: string;
  readonly detalle?: string | undefined;
  readonly destinoWa: string;
  readonly emailDestino?: string | undefined;
  readonly emailVerificado?: boolean | undefined;
}

export type EstadoAlertaSeg =
  | "enviado"
  | "enviado_email"
  | "omitido_no_alerta"
  | "omitido_no_vinculado"
  | "omitido_no_habilitado"
  | "omitido_ya_enviado"
  | "omitido_sin_canal"
  | "fallo";

export interface ResultadoAlertaSeg {
  readonly eventId: string;
  readonly clave: string;
  readonly estado: EstadoAlertaSeg;
  readonly texto: string | null;
  readonly error: string | null;
}

export type EnviadorSeg = (args: { destino: string; texto: string; idempotencyKey: string }) => { ok: boolean; error?: string | undefined };

export type EnviadorEmailSeg = (args: { para: string; asunto: string; texto: string; idempotencyKey: string }) => { ok: boolean; error?: string | undefined };

const corridasSeg = new Set<string>();

export function limpiar_corridas_seguridad(): void {
  corridasSeg.clear();
  corridasEmail.clear();
}

const corridasEmail = new Set<string>();

export function ejecutar_alertas_seguridad_wa(args: {
  readonly eventos: ReadonlyArray<EventoSeguridadEntrada>;
  readonly yaEnviados?: ReadonlySet<string> | undefined;
  readonly yaEnviadosEmail?: ReadonlySet<string> | undefined;
  readonly enviar: EnviadorSeg;
  readonly enviarEmail?: EnviadorEmailSeg | undefined;
  readonly registrar?: ((clave: string, r: ResultadoAlertaSeg) => void) | undefined;
}): { readonly resultados: ReadonlyArray<ResultadoAlertaSeg> } {
  const resultados: ResultadoAlertaSeg[] = [];
  for (const e of args.eventos) {
    const terminar = (r: ResultadoAlertaSeg): void => {
      resultados.push(r);
      args.registrar?.(r.clave, r);
    };
    if (!esEventoAlertaSeguridad(e.tipo)) {
      terminar({ eventId: e.eventId, clave: claveAlertaSeguridad(e.eventId), estado: "omitido_no_alerta", texto: null, error: null });
      continue;
    }
    const clave = claveAlertaSeguridad(e.eventId);
    if (corridasSeg.has(clave) || args.yaEnviados?.has(clave) === true) {
      terminar({ eventId: e.eventId, clave, estado: "omitido_ya_enviado", texto: null, error: null });
      continue;
    }
    const d = decidirAlertaSeguridad({
      evento: e.tipo as EventoAlertaSeguridad,
      rolDestino: e.rolDestino,
      vinculado: e.vinculado,
      puedeUsarBot: e.puedeUsarBot,
    });
    const fallbackEmail = (estadoWA: string, textoWA: string | null): boolean => {
      if (!debeProbarEmail(estadoWA)) return false;
      if (!args.enviarEmail || !e.emailDestino || e.emailVerificado !== true) return false;
      const claveMail = claveAlertaEmail(e.eventId);
      if (corridasEmail.has(claveMail) || args.yaEnviadosEmail?.has(claveMail) === true) {
        terminar({ eventId: e.eventId, clave, estado: "omitido_ya_enviado", texto: textoWA, error: null });
        return true;
      }
      const mail = armarEmailSeguridad({ evento: e.tipo as EventoAlertaSeguridad, comercio: e.comercio, detalle: e.detalle });
      let r: { ok: boolean; error?: string | undefined };
      try {
        r = args.enviarEmail({ para: e.emailDestino, asunto: mail.asunto, texto: mail.texto, idempotencyKey: claveMail });
      } catch (err) {
        terminar({ eventId: e.eventId, clave, estado: "fallo", texto: textoWA, error: err instanceof Error ? err.message : "fallo_email" });
        return true;
      }
      if (!r.ok) {
        terminar({ eventId: e.eventId, clave, estado: "fallo", texto: textoWA, error: r.error ?? "fallo_email" });
        return true;
      }
      corridasEmail.add(claveMail);
      terminar({ eventId: e.eventId, clave, estado: "enviado_email", texto: textoWA, error: null });
      return true;
    };
    if (!d.enviar) {
      const estadoWA = d.motivo === "no_vinculado" ? "omitido_no_vinculado" : "omitido_no_habilitado";
      if (fallbackEmail(estadoWA, null)) continue;
      terminar({
        eventId: e.eventId,
        clave,
        estado: args.enviarEmail && e.emailDestino && e.emailVerificado === true ? "fallo" : estadoWA,
        texto: null,
        error: null,
      });
      continue;
    }
    const texto = armarTextoAlertaSeguridad({ evento: e.tipo as EventoAlertaSeguridad, comercio: e.comercio, detalle: e.detalle });
    let envio: { ok: boolean; error?: string | undefined };
    try {
      envio = args.enviar({ destino: e.destinoWa, texto, idempotencyKey: clave });
    } catch (err) {
      if (fallbackEmail("fallo", texto)) continue;
      terminar({ eventId: e.eventId, clave, estado: "fallo", texto, error: err instanceof Error ? err.message : "fallo_envio" });
      continue;
    }
    if (!envio.ok) {
      if (fallbackEmail("fallo", texto)) continue;
      terminar({ eventId: e.eventId, clave, estado: "fallo", texto, error: envio.error ?? "fallo_envio" });
      continue;
    }
    corridasSeg.add(clave);
    terminar({ eventId: e.eventId, clave, estado: "enviado", texto, error: null });
  }
  return { resultados: Object.freeze(resultados) };
}
