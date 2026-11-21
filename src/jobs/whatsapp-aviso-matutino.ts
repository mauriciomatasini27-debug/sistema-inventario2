
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

const corridasWa = new Set<string>();

export function limpiar_corridas_wa(): void {
  corridasWa.clear();
}

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
