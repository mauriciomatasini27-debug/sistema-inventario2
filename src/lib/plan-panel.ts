import { CUPO_ASISTENTE_POR_DEFECTO } from "../modules/ia/asistente.js";
import type { Catalogo, Feature, PlanId } from "../modules/planes/catalogo.js";
import type { FechaAR } from "./fecha-ar.js";

// DASH-S8 (PRD-DASH-01, ADR-0045): núcleo puro de la pantalla /panel/plan. Sin
// IO, sin red, sin reloj implícito. Traduce { plan activo, catálogo, uso del
// asistente del mes, hoy AR } a la vista que consumen la ruta y la página. El
// cupo efectivo del asistente usa la misma constante que crearAsistente para
// que el medidor y el bloqueo nunca discrepen.

// Orden de presentación de las features del plan (el del catálogo).
export const ORDEN_FEATURES: ReadonlyArray<Feature> = [
  "nucleo",
  "alertas_email",
  "bot_consulta",
  "alertas_whatsapp",
  "bot_rubro",
  "asistente_ia",
];

export const ETIQUETAS_FEATURE: Readonly<Record<Feature, string>> = {
  nucleo: "Inventario, ventas y caja",
  alertas_email: "Alertas de stock por email",
  bot_consulta: "Consultas de stock por WhatsApp",
  alertas_whatsapp: "Alertas de stock por WhatsApp",
  bot_rubro: "Bot adaptado a tu rubro",
  asistente_ia: "Asistente IA",
};

export interface FeatureVista {
  readonly clave: Feature;
  readonly etiqueta: string;
  readonly incluida: boolean;
}

export interface MedidorAsistente {
  readonly incluido: boolean;
  readonly usado: number;
  readonly cupo: number;
  readonly restante: number;
  readonly agotado: boolean;
  readonly porcentaje: number;
  readonly reinicia_el: FechaAR;
  readonly explicacion: string;
}

export interface VistaPlan {
  readonly plan_id: PlanId | null;
  readonly nombre: string;
  readonly es_catalogo_ejemplo: boolean;
  readonly features: ReadonlyArray<FeatureVista>;
  readonly asistente: MedidorAsistente;
}

// Día 1 del mes siguiente al de `hoy`, en el calendario civil de Argentina.
// Argentina no tiene horario de verano: el mes AR sale del mes de la FechaAR.
function primerDiaMesSiguiente(hoy: FechaAR): FechaAR {
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7));
  const proximoAnio = mes === 12 ? anio + 1 : anio;
  const proximoMes = mes === 12 ? 1 : mes + 1;
  return `${proximoAnio}-${String(proximoMes).padStart(2, "0")}-01` as FechaAR;
}

function diaMesTexto(fecha: FechaAR): string {
  return `${Number(fecha.slice(8, 10))}/${Number(fecha.slice(5, 7))}`;
}

export function vistaPlan(entrada: {
  readonly planId: PlanId | null;
  readonly catalogo: Catalogo;
  readonly consultasAsistenteMes: number;
  readonly hoy: FechaAR;
}): VistaPlan {
  const plan =
    entrada.planId === null ? null : (entrada.catalogo.find((p) => p.id === entrada.planId) ?? null);
  const usado = Math.max(0, Math.floor(entrada.consultasAsistenteMes));
  const reinicia_el = primerDiaMesSiguiente(entrada.hoy);
  const features: FeatureVista[] = ORDEN_FEATURES.map((clave) => ({
    clave,
    etiqueta: ETIQUETAS_FEATURE[clave],
    incluida: plan?.features[clave] === true,
  }));

  if (plan === null || plan.features.asistente_ia !== true) {
    return {
      plan_id: plan?.id ?? null,
      nombre: plan?.nombre ?? "Sin plan activo",
      es_catalogo_ejemplo: plan?.ejemplo === true,
      features,
      asistente: {
        incluido: false,
        usado,
        cupo: 0,
        restante: 0,
        agotado: false,
        porcentaje: 0,
        reinicia_el,
        explicacion:
          plan === null
            ? "Sin plan activo, el asistente IA no está disponible."
            : `Tu plan ${plan.nombre} no incluye el asistente IA.`,
      },
    };
  }

  const declarado = plan.cupos.asistente_ia;
  const cupo = typeof declarado === "number" ? declarado : CUPO_ASISTENTE_POR_DEFECTO;
  const restante = Math.max(0, cupo - usado);
  const agotado = usado >= cupo;
  const porcentaje = cupo > 0 ? Math.min(100, Math.round((usado / cupo) * 100)) : 0;
  return {
    plan_id: plan.id,
    nombre: plan.nombre,
    es_catalogo_ejemplo: plan.ejemplo === true,
    features,
    asistente: {
      incluido: true,
      usado,
      cupo,
      restante,
      agotado,
      porcentaje,
      reinicia_el,
      explicacion: agotado ? `Llegaste al cupo del mes. Se reinicia el ${diaMesTexto(reinicia_el)}.` : "",
    },
  };
}
