// Job Track1 B5: aviso matutino por WhatsApp, un envío por comercio.
// Calcula con stock vivo al momento del envío, respeta opt-in/pausa
// (optin.ts via puede_enviar_whatsapp), es idempotente por comercio+fecha+
// canal y registra el fallo por canal sin bloquear el email (B5.6).
//
// El envío real lo inyecta el llamador (adaptador con Cloud API): este job
// nunca toca red, Drizzle ni env directamente, así se puede probar sin IO.

import {
  armar_cuerpo_matutino,
  armar_variables_matutino,
  botones_matutino,
  clave_aviso_wa,
  decidir_envio_matutino,
  type AlertaStock,
  type VariablesMatutino,
} from "../modules/whatsapp/aviso-matutino.js";
import { puede_enviar_whatsapp, type Preferencias } from "../modules/whatsapp/optin.js";
import type { ItemStock } from "../modules/email/stock-matutino.js";

export interface ComercioMatutinoWa {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly prefs: Preferencias;
  readonly catalogoVivo: ReadonlyArray<ItemStock>;
  readonly enAlertaPrevia: ReadonlySet<string>;
}

export type EstadoComercioWa =
  | "enviado"
  | "omitido_sin_novedad"
  | "omitido_optout"
  | "omitido_ya_enviado"
  | "fallo";

export interface ResultadoComercioWa {
  readonly tenantId: string;
  readonly clave: string;
  readonly estado: EstadoComercioWa;
  readonly demoraMs: number;
  readonly variables: VariablesMatutino | null;
  readonly alertas: ReadonlyArray<AlertaStock>;
  readonly error: string | null;
}

export interface EnvioWa {
  readonly ok: boolean;
  readonly error?: string | undefined;
}

// Corridas ya registradas en este proceso (idempotencia en memoria).
const corridasWa = new Set<string>();

export function limpiar_corridas_wa(): void {
  corridasWa.clear();
}

export function fechaBA(ahora = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(ahora);
}

// Reparte los envíos en el tiempo para no pegar todo junto: el comercio
// i de n sale a los i*n-ésimos de la ventana. Puro.
export function demora_para(indice: number, total: number, ventanaMs = 600000): number {
  if (total <= 0) return 0;
  const i = Math.max(0, Math.min(indice, total - 1));
  return Math.floor((i * ventanaMs) / total);
}

export function ejecutar_aviso_matutino_wa(args: {
  readonly comercios: ReadonlyArray<ComercioMatutinoWa>;
  readonly fecha: string;
  readonly ahoraMs: number;
  readonly ventanaMs?: number | undefined;
  readonly yaEnviados?: ReadonlySet<string> | undefined;
  readonly enviar: (tenantId: string, payload: { readonly texto: string; readonly variables: VariablesMatutino; readonly clave: string; readonly botones: ReadonlyArray<{ readonly id: string; readonly titulo: string }> }) => EnvioWa;
  readonly registrar?: ((clave: string, r: ResultadoComercioWa) => void) | undefined;
}): { readonly resultados: ReadonlyArray<ResultadoComercioWa> } {
  const ventana = args.ventanaMs ?? 600000;
  const total = args.comercios.length;
  const resultados: ResultadoComercioWa[] = [];
  args.comercios.forEach((comercio, indice) => {
    const clave = clave_aviso_wa(comercio.tenantId, args.fecha);
    const demoraMs = demora_para(indice, total, ventana);
    const terminar = (r: ResultadoComercioWa): void => {
      resultados.push(r);
      args.registrar?.(clave, r);
    };
    // Idempotente por comercio: memoria del proceso + registro externo.
    if (corridasWa.has(clave) || args.yaEnviados?.has(clave) === true) {
      terminar({
        tenantId: comercio.tenantId,
        clave,
        estado: "omitido_ya_enviado",
        demoraMs,
        variables: null,
        alertas: [],
        error: null,
      });
      return;
    }
    // Respeta opt-in/pausa antes de calcular de más.
    if (!puede_enviar_whatsapp(comercio.prefs, args.ahoraMs)) {
      terminar({
        tenantId: comercio.tenantId,
        clave,
        estado: "omitido_optout",
        demoraMs,
        variables: null,
        alertas: [],
        error: null,
      });
      return;
    }
    // Cálculo vivo al envío; sin novedad no sale nada (B5.1).
    const decision = decidir_envio_matutino(comercio.catalogoVivo, comercio.enAlertaPrevia);
    if (!decision.enviar) {
      terminar({
        tenantId: comercio.tenantId,
        clave,
        estado: "omitido_sin_novedad",
        demoraMs,
        variables: null,
        alertas: [],
        error: null,
      });
      return;
    }
    const variables = armar_variables_matutino({
      comercio: comercio.nombreComercio,
      fecha: args.fecha,
      alertas: decision.alertas,
    });
    const texto = armar_cuerpo_matutino(variables);
    const botones = botones_matutino();
    let envio: EnvioWa;
    try {
      envio = args.enviar(comercio.tenantId, { texto, variables, clave, botones });
    } catch (e) {
      // Fallo solo del canal WA: se registra y se sigue con el resto.
      // El email corre por su propia clave y no se ve afectado (B5.6).
      terminar({
        tenantId: comercio.tenantId,
        clave,
        estado: "fallo",
        demoraMs,
        variables,
        alertas: decision.alertas,
        error: e instanceof Error ? e.message : "fallo_envio",
      });
      return;
    }
    if (!envio.ok) {
      terminar({
        tenantId: comercio.tenantId,
        clave,
        estado: "fallo",
        demoraMs,
        variables,
        alertas: decision.alertas,
        error: envio.error ?? "fallo_envio",
      });
      return;
    }
    corridasWa.add(clave);
    terminar({
      tenantId: comercio.tenantId,
      clave,
      estado: "enviado",
      demoraMs,
      variables,
      alertas: decision.alertas,
      error: null,
    });
  });
  return { resultados: Object.freeze(resultados) };
}
