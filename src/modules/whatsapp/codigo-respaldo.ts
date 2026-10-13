// Núcleo puro B1.2 respaldo: código por plantilla de autenticación
// `codigo_verificacion` (PRD Bot B1.2). Distinto del código VINCULAR,
// nunca se muestra en la web, se guarda hash. Vence 10 min, un solo uso,
// 5 intentos por código, 3 envíos por número por hora. Pago (~USD 0,026).
// Sin IO: el adaptador persiste en whatsapp_codes y envía la plantilla.

export const RESPALDO_TTL_MIN = 10 as const;
export const RESPALDO_MAX_INTENTOS = 5 as const;
export const RESPALDO_MAX_ENVIOS_HORA = 3 as const;
export const RESPALDO_VENTANA_HORA_MS = 3600000 as const;
export const PLANTILLA_CODIGO = "codigo_verificacion" as const;

export interface CodigoRespaldo {
  readonly numeroE164: string;
  readonly codigoHash: string;
  readonly expiraEnMs: number;
  readonly usadoEnMs: number | null;
  readonly intentos: number;
}

export type DecisionEnvio =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: "limite_hora" | "plantilla_no_disponible" };

// 3 envíos por número por hora (snapshot de timestamps del adaptador).
export function puede_enviar_respaldo(opts: {
  enviosPreviosMs: ReadonlyArray<number>;
  ahoraMs: number;
  plantillaDisponible: boolean;
}): DecisionEnvio {
  if (!opts.plantillaDisponible) return { ok: false, motivo: "plantilla_no_disponible" };
  const recientes = opts.enviosPreviosMs.filter((t) => opts.ahoraMs - t < RESPALDO_VENTANA_HORA_MS);
  if (recientes.length >= RESPALDO_MAX_ENVIOS_HORA) return { ok: false, motivo: "limite_hora" };
  return { ok: true };
}

export type VerificarRespaldo =
  | { readonly ok: true }
  | { readonly ok: false; readonly motivo: "inexistente" | "vencido" | "usado" | "intentos_agotados" | "codigo_invalido" };

// El adaptador calcula el hash del código ingresado y suma el intento;
// acá la decisión pura (no muta: el adaptador persiste intentos/usadoEn).
export function verificar_respaldo(opts: {
  pendiente: CodigoRespaldo | null;
  codigoIngresadoHash: string;
  ahoraMs: number;
}): VerificarRespaldo {
  const p = opts.pendiente;
  if (!p) return { ok: false, motivo: "inexistente" };
  if (p.usadoEnMs != null) return { ok: false, motivo: "usado" };
  if (opts.ahoraMs > p.expiraEnMs) return { ok: false, motivo: "vencido" };
  if (p.intentos >= RESPALDO_MAX_INTENTOS) return { ok: false, motivo: "intentos_agotados" };
  if (p.codigoHash !== opts.codigoIngresadoHash) return { ok: false, motivo: "codigo_invalido" };
  return { ok: true };
}
