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

// PLAN-S9: una ruta fuera de plan muestra esta pantalla (qué hace, plan actual,
// plan que lo incluye y CTA según el rol). No es un 404. El mail de alertas
// sigue en Básico, así que esa ruta no se reemplaza entera.
export const SUPERFICIES_UPSELL = ["bot", "alertas_whatsapp", "asistente"] as const;
export type SuperficieUpsell = (typeof SUPERFICIES_UPSELL)[number];
export type CtaUpsell = "ver_planes" | "pedile_al_dueno";

export interface PantallaUpsell {
  readonly superficie: SuperficieUpsell;
  readonly titulo: string;
  readonly queHace: string;
  readonly planActualId: PlanId | null;
  readonly planActualNombre: string;
  readonly planActualTexto: string;
  readonly planDelModuloId: PlanId | null;
  readonly planDelModuloNombre: string | null;
  readonly planModuloTexto: string | null;
  readonly cta: CtaUpsell;
  readonly reemplazaPagina: boolean;
}

export type AccesoSuperficie =
  | { readonly tipo: "incluido" }
  | { readonly tipo: "upsell"; readonly pantalla: PantallaUpsell };

const DEF_SUPERFICIE: Record<
  SuperficieUpsell,
  { readonly nombre: string; readonly queHace: string; readonly requisito: RequisitoIndice; readonly feature: "bot_consulta" | "alertas_whatsapp" | "asistente_ia" }
> = {
  bot: {
    nombre: COPY.bot.nombre,
    queHace: COPY.bot.texto,
    requisito: { tipo: "feature", feature: "bot_consulta" },
    feature: "bot_consulta",
  },
  alertas_whatsapp: {
    nombre: "Alertas por WhatsApp",
    queHace: "Avisos de stock bajo por WhatsApp y el resumen de la mañana.",
    requisito: { tipo: "feature", feature: "alertas_whatsapp" },
    feature: "alertas_whatsapp",
  },
  asistente: {
    nombre: COPY.asistente.nombre,
    queHace: COPY.asistente.texto,
    requisito: { tipo: "feature", feature: "asistente_ia" },
    feature: "asistente_ia",
  },
};

export function esSuperficieUpsell(valor: unknown): valor is SuperficieUpsell {
  return valor === "bot" || valor === "alertas_whatsapp" || valor === "asistente";
}

function esPlanIdONull(valor: unknown): valor is PlanId | null {
  return valor === null || esPlanId(valor);
}

function esCtaUpsell(valor: unknown): valor is CtaUpsell {
  return valor === "ver_planes" || valor === "pedile_al_dueno";
}

export function esPantallaUpsell(valor: unknown): valor is PantallaUpsell {
  if (typeof valor !== "object" || valor === null) return false;
  const o = valor as Record<string, unknown>;
  return (
    esSuperficieUpsell(o["superficie"]) &&
    typeof o["titulo"] === "string" &&
    o["titulo"].length > 0 &&
    typeof o["queHace"] === "string" &&
    o["queHace"].length > 0 &&
    esPlanIdONull(o["planActualId"]) &&
    typeof o["planActualNombre"] === "string" &&
    o["planActualNombre"].length > 0 &&
    typeof o["planActualTexto"] === "string" &&
    o["planActualTexto"].length > 0 &&
    esPlanIdONull(o["planDelModuloId"]) &&
    (o["planDelModuloNombre"] === null ||
      (typeof o["planDelModuloNombre"] === "string" && o["planDelModuloNombre"].length > 0)) &&
    (o["planModuloTexto"] === null ||
      (typeof o["planModuloTexto"] === "string" && o["planModuloTexto"].length > 0)) &&
    esCtaUpsell(o["cta"]) &&
    typeof o["reemplazaPagina"] === "boolean"
  );
}

export function accesoSuperficie(args: {
  readonly superficie: SuperficieUpsell;
  readonly planId: PlanId | null;
  readonly rol: "dueno" | "empleado";
  readonly catalogo?: Catalogo;
}): AccesoSuperficie {
  const catalogo = args.catalogo ?? PLANES_EJEMPLO;
  const def = DEF_SUPERFICIE[args.superficie];
  const plan = args.planId === null ? null : (catalogo.find((p) => p.id === args.planId) ?? null);
  if (plan?.features[def.feature] === true) return { tipo: "incluido" };
  const destino = planMasBarato(catalogo, def.requisito);
  const pantalla: PantallaUpsell = {
    superficie: args.superficie,
    titulo: destino ? `${def.nombre} en ${destino.nombre}` : def.nombre,
    queHace: def.queHace,
    planActualId: plan?.id ?? null,
    planActualNombre: plan?.nombre ?? "Sin plan activo",
    planActualTexto: plan ? `Tu plan actual es ${plan.nombre}.` : "No tenés un plan activo.",
    planDelModuloId: destino?.id ?? null,
    planDelModuloNombre: destino?.nombre ?? null,
    planModuloTexto: destino ? `Está en el plan ${destino.nombre}.` : null,
    cta: args.rol === "dueno" ? "ver_planes" : "pedile_al_dueno",
    reemplazaPagina: args.superficie === "alertas_whatsapp" ? plan?.features.alertas_email !== true : true,
  };
  return { tipo: "upsell", pantalla };
}

export function upsellDeRespuestaAsistente(valor: unknown): PantallaUpsell | null {
  if (typeof valor !== "object" || valor === null) return null;
  const fila = valor as Record<string, unknown>;
  if (fila["incluido"] !== false) return null;
  return esPantallaUpsell(fila["upsell"]) ? fila["upsell"] : null;
}
