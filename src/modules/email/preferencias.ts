// Núcleo puro NE9: qué, frecuencia, silencio y pausa. Sin IO.
// El adaptador persiste en notification_preferences y audit_log.

import { CATALOGO, type FrecuenciaEmail, type TipoEmail } from "./catalogo.js";

export interface PrefsPorTipo {
  readonly activo: boolean;
  readonly frecuencia: FrecuenciaEmail;
  readonly hora: string | null;
  readonly tambienWA: boolean;
}

export interface Silencio {
  readonly inicioMin: number;
  readonly finMin: number;
}

// Por defecto NE9.2: 23:00 a 07:30. Se guarda en minutos para cálculo puro;
// el adaptador convierte ahoraMs (America/Argentina/Buenos_Aires) a ahoraMin.
export const SILENCIO_DEFECTO: Silencio = { inicioMin: 23 * 60, finMin: 7 * 60 + 30 };

export interface PrefsEmail {
  readonly porTipo: Record<TipoEmail, PrefsPorTipo>;
  readonly silencio: Silencio;
  readonly pausaHastaMs: number | null;
  readonly zona: "America/Argentina/Buenos_Aires";
}

function defecto_para(tipo: TipoEmail): PrefsPorTipo {
  const d = CATALOGO[tipo];
  return {
    activo: d.porDefecto,
    frecuencia: d.frecuenciaDefecto,
    hora: null,
    tambienWA: false,
  };
}

export function prefs_por_defecto(): PrefsEmail {
  return {
    porTipo: {
      stock_bajo: defecto_para("stock_bajo"),
      resumen_viernes: defecto_para("resumen_viernes"),
      resumen_cierre: defecto_para("resumen_cierre"),
      ventas_diaria: defecto_para("ventas_diaria"),
      vencimientos: defecto_para("vencimientos"),
      sistema_operacion: defecto_para("sistema_operacion"),
      seguridad: defecto_para("seguridad"),
      cuenta: defecto_para("cuenta"),
      diferencia_turno: defecto_para("diferencia_turno"),
      entrega_disputa: defecto_para("entrega_disputa"),
      ajuste_conteo: defecto_para("ajuste_conteo"),
      fiado: defecto_para("fiado"),
      lote_vencer: defecto_para("lote_vencer"),
      promo_vencer: defecto_para("promo_vencer"),
    },
    silencio: SILENCIO_DEFECTO,
    pausaHastaMs: null,
    zona: "America/Argentina/Buenos_Aires",
  };
}

export function en_silencio(ahoraMin: number, s: Silencio): boolean {
  if (s.inicioMin === s.finMin) return false;
  if (s.inicioMin < s.finMin) return ahoraMin >= s.inicioMin && ahoraMin < s.finMin;
  return ahoraMin >= s.inicioMin || ahoraMin < s.finMin;
}

// Gate único del orquestador. Seguridad ignora silencio y pausa (NE7.5);
// cuenta ignora pausa pero respeta silencio. Al terminar la pausa no se
// manda el acumulado: el orquestador retoma sin reencolar vencidos (NE9.3).
export function puede_enviar(
  tipo: TipoEmail,
  prefs: PrefsEmail,
  args: { ahoraMs: number; ahoraMin: number },
): boolean {
  const def = CATALOGO[tipo];
  const p = prefs.porTipo[tipo];
  if (def.desactivable && !p.activo) return false;
  if (!def.ignoraPausa && prefs.pausaHastaMs != null && args.ahoraMs < prefs.pausaHastaMs) return false;
  if (!def.ignoraSilencio && en_silencio(args.ahoraMin, prefs.silencio)) return false;
  return true;
}

export type RolPrefs = "dueno" | "empleado";

export type ActualizarError = "forbidden" | "no_desactivable" | "frecuencia_invalida" | "hora_invalida";

export interface CambioTipo {
  readonly activo?: boolean;
  readonly frecuencia?: FrecuenciaEmail;
  readonly hora?: string | null;
  readonly tambienWA?: boolean;
}

// Solo el Dueño edita (NE9.6). El adaptador registra anterior/nuevo en audit.
export function actualizar_tipo(
  prefs: PrefsEmail,
  tipo: TipoEmail,
  cambio: CambioTipo,
  rol: RolPrefs,
): { ok: true; prefs: PrefsEmail } | { ok: false; error: ActualizarError } {
  if (rol !== "dueno") return { ok: false, error: "forbidden" };
  const def = CATALOGO[tipo];
  const previo = prefs.porTipo[tipo];
  if (cambio.activo === false && !def.desactivable) return { ok: false, error: "no_desactivable" };
  if (cambio.frecuencia !== undefined && !def.frecuencias.includes(cambio.frecuencia)) {
    return { ok: false, error: "frecuencia_invalida" };
  }
  if (cambio.hora !== undefined && cambio.hora !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cambio.hora)) {
    return { ok: false, error: "hora_invalida" };
  }
  if (cambio.tambienWA === true && !def.permiteWAopcional) return { ok: false, error: "forbidden" };
  return {
    ok: true,
    prefs: {
      ...prefs,
      porTipo: {
        ...prefs.porTipo,
        [tipo]: {
          activo: cambio.activo ?? previo.activo,
          frecuencia: cambio.frecuencia ?? previo.frecuencia,
          hora: cambio.hora !== undefined ? cambio.hora : previo.hora,
          tambienWA: cambio.tambienWA ?? previo.tambienWA,
        },
      },
    },
  };
}

export function pausar(prefs: PrefsEmail, hastaMs: number, rol: RolPrefs): { ok: true; prefs: PrefsEmail } | { ok: false; error: ActualizarError } {
  if (rol !== "dueno") return { ok: false, error: "forbidden" };
  return { ok: true, prefs: { ...prefs, pausaHastaMs: hastaMs } };
}
