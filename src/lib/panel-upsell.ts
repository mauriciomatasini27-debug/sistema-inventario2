import {
  PLANES_EJEMPLO,
  type Catalogo,
  type PlanEjemplo,
  type PlanId,
} from "../modules/planes/catalogo.js";
import {
  MODULOS_INDICE,
  cumpleRequisito,
  type FeaturesPlan,
  type RequisitoIndice,
} from "./panel-modulos.js";

export type ModuloUpsell = "bot" | "alertas" | "asistente";

export interface OfertaUpsell {
  readonly modulo: ModuloUpsell;
  readonly titulo: string;
  readonly texto: string;
  readonly planId: PlanId;
  readonly planNombre: string;
}

export type DescartesUpsell = Readonly<Record<string, number>>;

export const VENTANA_DESCARTE_MS = 30 * 24 * 60 * 60 * 1000;
export const CLAVE_DESCARTES_UPSELL = "panel:upsell-descartes";

const COPY: Record<ModuloUpsell, { readonly nombre: string; readonly texto: string }> = {
  bot: {
    nombre: "Bot de WhatsApp",
    texto: "Consultá stock y movimientos por WhatsApp, sin abrir el panel.",
  },
  alertas: {
    nombre: "Alertas",
    texto: "Avisos cuando un producto baja del stock mínimo, sin revisar todo a mano.",
  },
  asistente: {
    nombre: "Asistente IA",
    texto: "Preguntale al negocio por ventas, stock y movimientos en tus palabras.",
  },
};

function esModuloUpsell(valor: unknown): valor is ModuloUpsell {
  return valor === "bot" || valor === "alertas" || valor === "asistente";
}

function esPlanId(valor: unknown): valor is PlanId {
  return valor === "basico" || valor === "plus" || valor === "pro";
}

export function esOfertaUpsell(valor: unknown): valor is OfertaUpsell {
  if (typeof valor !== "object" || valor === null) return false;
  const o = valor as Record<string, unknown>;
  return (
    esModuloUpsell(o["modulo"]) &&
    typeof o["titulo"] === "string" &&
    o["titulo"].length > 0 &&
    typeof o["texto"] === "string" &&
    o["texto"].length > 0 &&
    esPlanId(o["planId"]) &&
    typeof o["planNombre"] === "string" &&
    o["planNombre"].length > 0
  );
}

function planMasBarato(
  catalogo: Catalogo,
  requisito: RequisitoIndice,
): PlanEjemplo | null {
  let mejor: PlanEjemplo | null = null;
  for (const plan of catalogo) {
    if (!cumpleRequisito(requisito, plan.features)) continue;
    if (mejor === null || plan.precioMensualUSD < mejor.precioMensualUSD) mejor = plan;
  }
  return mejor;
}

export function ofertasUpsell(
  features: FeaturesPlan,
  catalogo: Catalogo = PLANES_EJEMPLO,
): OfertaUpsell[] {
  const ofertas: OfertaUpsell[] = [];
  for (const entrada of MODULOS_INDICE) {
    if (entrada.requisito.tipo === "siempre") continue;
    if (cumpleRequisito(entrada.requisito, features)) continue;
    const modulo = entrada.id;
    if (!esModuloUpsell(modulo)) continue;
    const plan = planMasBarato(catalogo, entrada.requisito);
    if (!plan) continue;
    const copy = COPY[modulo];
    ofertas.push({
      modulo,
      titulo: `${copy.nombre} en ${plan.nombre}`,
      texto: copy.texto,
      planId: plan.id,
      planNombre: plan.nombre,
    });
  }
  return ofertas;
}

export function elegirOferta(args: {
  readonly ofertas: ReadonlyArray<OfertaUpsell>;
  readonly descartes: DescartesUpsell;
  readonly ahora: number;
}): OfertaUpsell | null {
  for (const oferta of args.ofertas) {
    const descartado = args.descartes[oferta.modulo];
    if (
      typeof descartado === "number" &&
      Number.isFinite(descartado) &&
      args.ahora - descartado < VENTANA_DESCARTE_MS
    ) {
      continue;
    }
    return oferta;
  }
  return null;
}

export function ofertaUpsell(args: {
  readonly features: FeaturesPlan;
  readonly catalogo?: Catalogo;
  readonly descartes: DescartesUpsell;
  readonly ahora: number;
}): OfertaUpsell | null {
  return elegirOferta({
    ofertas: ofertasUpsell(args.features, args.catalogo ?? PLANES_EJEMPLO),
    descartes: args.descartes,
    ahora: args.ahora,
  });
}
