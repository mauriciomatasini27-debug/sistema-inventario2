// LANE planes — Catálogo de EJEMPLO (PRD-PLAN-01, PLAN-S1 parcial).
//
// Datos de ejemplo, no contractuales: precios de referencia interna de
// docs/01-fundacion/costos-por-cliente.md (Básico 15 / Plus 35 / Pro 59 USD)
// y cupos a definir salvo bot en Básico (100 mensajes, onboarding-parte-2).
// Las tablas plans/plan_features/subscriptions quedan para una migración
// futura; acá solo hay constantes puras + override por config.
//
// Núcleo puro: sin IO, sin Drizzle, sin reloj. Todo congelado.

import { leerVarEntorno } from "../../lib/env.js";

export type PlanId = "basico" | "plus" | "pro";

export type Feature =
  | "nucleo"
  | "alertas_email"
  | "bot_consulta"
  | "alertas_whatsapp"
  | "bot_rubro"
  | "asistente_ia";

export interface PlanEjemplo {
  readonly id: PlanId;
  readonly nombre: string;
  // Precio mensual de referencia en USD, no publicado. A definir.
  readonly precioMensualUSD: number;
  // Siempre true: distingue estos datos de un catálogo real futuro.
  readonly ejemplo: true;
  readonly features: Readonly<Record<Feature, boolean>>;
  // Cupo mensual por feature; null = incluido sin techo definido aún.
  readonly cupos: Readonly<Record<Feature, number | null>>;
  // Módulos de rubro del bot habilitados (ADR-0039); vacío = ninguno.
  readonly modulosRubro: ReadonlyArray<string>;
}

export type Catalogo = ReadonlyArray<PlanEjemplo>;

// TARIFA-META: la tarifa USD de WhatsApp/Meta no se publica ni se fija en el
// catálogo de planes (confirmar contra Meta; ver costos-por-cliente). Evita
// hardcodear la tarifa Meta como verdad de producto mientras el catálogo sigue ejemplo.
export const TARIFA_META_USD_FIJADA_EN_PRODUCTO = false as const;

/** Centavos USD a contabilizar por consulta bot; 0 hasta tarifa contractual. */
export function costoContabilidadBotConsultaUsdCentavos(): bigint {
  return 0n;
}

function plan(
  id: PlanId,
  nombre: string,
  precioMensualUSD: number,
  features: Readonly<Record<Feature, boolean>>,
  cupos: Readonly<Record<Feature, number | null>>,
  modulosRubro: ReadonlyArray<string>,
): PlanEjemplo {
  return Object.freeze({
    id,
    nombre,
    precioMensualUSD,
    ejemplo: true as const,
    features: Object.freeze({ ...features }),
    cupos: Object.freeze({ ...cupos }),
    modulosRubro: Object.freeze([...modulosRubro]),
  });
}

const SIN_CUPO: Readonly<Record<Feature, number | null>> = Object.freeze({
  nucleo: null,
  alertas_email: null,
  bot_consulta: null,
  alertas_whatsapp: null,
  bot_rubro: null,
  asistente_ia: null,
});

export const PLANES_EJEMPLO: Catalogo = Object.freeze([
  plan(
    "basico",
    "Básico",
    15,
    { nucleo: true, alertas_email: true, bot_consulta: true, alertas_whatsapp: false, bot_rubro: false, asistente_ia: false },
    { ...SIN_CUPO, bot_consulta: 100 },
    [],
  ),
  plan(
    "plus",
    "Plus",
    35,
    { nucleo: true, alertas_email: true, bot_consulta: true, alertas_whatsapp: true, bot_rubro: true, asistente_ia: true },
    { ...SIN_CUPO },
    ["quiosco"],
  ),
  plan(
    "pro",
    "Pro",
    59,
    { nucleo: true, alertas_email: true, bot_consulta: true, alertas_whatsapp: true, bot_rubro: true, asistente_ia: true },
    { ...SIN_CUPO },
    ["quiosco", "pyme", "fabrica"],
  ),
]);

export function planDe(catalogo: Catalogo, id: string): PlanEjemplo {
  const encontrado = catalogo.find((p) => p.id === id);
  if (!encontrado) throw new Error(`plan desconocido: ${id}`);
  return encontrado;
}

export function tieneFeature(planActual: PlanEjemplo, feature: Feature): boolean {
  return planActual.features[feature];
}

// Restante del cupo mensual; null = sin techo definido. Nunca negativo.
export function cupoRestante(
  planActual: PlanEjemplo,
  feature: Feature,
  usado: number,
): number | null {
  if (!tieneFeature(planActual, feature)) return null;
  const cupo = planActual.cupos[feature];
  if (cupo === null) return null;
  return Math.max(0, cupo - usado);
}

// Override por config: PLANES_EJEMPLO_JSON como objeto {"plus":{"precioMensualUSD":40,
// "cupos":{"bot_consulta":500}}}. Solo pisa precio y cupos; el flag ejemplo
// no se puede apagar por config. JSON inválido o ids/features fuera del
// catálogo se rechazan en este borde, no adentro.
export function resolverCatalogo(env: NodeJS.ProcessEnv = process.env): Catalogo {
  const crudo = leerVarEntorno("PLANES_EJEMPLO_JSON", env);
  if (!crudo) return PLANES_EJEMPLO;
  let parche: unknown;
  try {
    parche = JSON.parse(crudo);
  } catch {
    throw new Error("PLANES_EJEMPLO_JSON inválido: no es JSON");
  }
  if (typeof parche !== "object" || parche === null || Array.isArray(parche)) {
    throw new Error("PLANES_EJEMPLO_JSON inválido: se espera objeto por plan");
  }
  const porPlan = parche as Record<string, { precioMensualUSD?: unknown; cupos?: unknown }>;
  return Object.freeze(
    PLANES_EJEMPLO.map((p) => {
      const entrada = porPlan[p.id];
      if (entrada === undefined) return p;
      if (typeof entrada !== "object" || entrada === null) {
        throw new Error(`PLANES_EJEMPLO_JSON inválido: entrada de ${p.id} no es objeto`);
      }
      let precio = p.precioMensualUSD;
      if (entrada.precioMensualUSD !== undefined) {
        if (typeof entrada.precioMensualUSD !== "number" || !(entrada.precioMensualUSD > 0)) {
          throw new Error(`PLANES_EJEMPLO_JSON inválido: precio de ${p.id}`);
        }
        precio = entrada.precioMensualUSD;
      }
      let cupos = p.cupos;
      if (entrada.cupos !== undefined) {
        if (typeof entrada.cupos !== "object" || entrada.cupos === null) {
          throw new Error(`PLANES_EJEMPLO_JSON inválido: cupos de ${p.id}`);
        }
        const next = { ...p.cupos };
        for (const [k, v] of Object.entries(entrada.cupos as Record<string, unknown>)) {
          if (!(k in p.cupos)) throw new Error(`PLANES_EJEMPLO_JSON inválido: feature ${k}`);
          if (v !== null && (!Number.isInteger(v) || (v as number) < 0)) {
            throw new Error(`PLANES_EJEMPLO_JSON inválido: cupo ${k}`);
          }
          next[k as Feature] = v as number | null;
        }
        cupos = Object.freeze(next);
      }
      return Object.freeze({ ...p, precioMensualUSD: precio, cupos, ejemplo: true as const });
    }),
  );
}

export type CambioDePlan =
  | { readonly efecto: "inmediato"; readonly montoProrrateoCentavos: bigint }
  | { readonly efecto: "fin_de_ciclo"; readonly planProgramado: PlanId }
  | { readonly efecto: "sin_cambio" };

// PLAN-S3/S4: subir es inmediato con prorrateo por días restantes del ciclo,
// bajar se programa a fin de período en planProgramado, sin reintegro.
// Prorrateo en centavos USD, mitad-arriba, sobre el catálogo dado.
export function cambioDePlan(args: {
  readonly catalogo?: Catalogo;
  readonly actualId: PlanId;
  readonly destinoId: PlanId;
  readonly diaDelCiclo: number;
  readonly diasCiclo: number;
}): CambioDePlan {
  const { actualId, destinoId, diaDelCiclo, diasCiclo } = args;
  if (actualId === destinoId) return { efecto: "sin_cambio" };
  const catalogo = args.catalogo ?? PLANES_EJEMPLO;
  const actual = planDe(catalogo, actualId);
  const destino = planDe(catalogo, destinoId);
  if (destino.precioMensualUSD > actual.precioMensualUSD) {
    if (!Number.isInteger(diaDelCiclo) || !Number.isInteger(diasCiclo) || diaDelCiclo < 1 || diasCiclo < 1 || diaDelCiclo > diasCiclo) {
      throw new Error("ciclo inválido");
    }
    const restantes = diasCiclo - diaDelCiclo;
    const difCentavos = BigInt(Math.round((destino.precioMensualUSD - actual.precioMensualUSD) * 100));
    const num = 2n * difCentavos * BigInt(restantes) + BigInt(diasCiclo);
    const monto = num / (2n * BigInt(diasCiclo));
    return { efecto: "inmediato", montoProrrateoCentavos: monto };
  }
  return { efecto: "fin_de_ciclo", planProgramado: destinoId };
}
