// BOT-S3 (PRD-BOT-01, ADR-0039): mensaje diario del bot para rubro quiosco.
// Une los módulos rotacion (RT6) y vencimientos (CAT-S4 15/7/3d) en UN envío
// por comercio y día. Núcleo puro: recibe los datos ya leídos y el `enviar`
// inyectado; no toca red, Drizzle ni env. Sin IA, sin emojis, rioplatense.

import { MAX_SUGERENCIAS, armar_linea_promo, topear_3_por_impacto, type Sugerencia } from "../modules/whatsapp/promos.js";
import { puede_enviar_whatsapp, type Preferencias } from "../modules/whatsapp/optin.js";
import type { ModuloBot } from "../modules/bot/modulos-rubro.js";
import type { AlertaLote, ClasificacionLotes } from "../lib/repos/lotes.js";

export interface ProductoQuiosco {
  readonly nombre: string;
  readonly precioCentavos: bigint;
}

// RT4 ya seleccionó el dormido; acá solo se necesita lo que arma la promo.
export interface DormidoQuiosco {
  readonly sku: string;
  readonly diasSinVenta: number;
  readonly inmovilizadoCentavos: bigint;
}

export interface ComercioQuiosco {
  readonly tenantId: string;
  readonly nombreComercio: string;
  readonly modulos: ReadonlyArray<ModuloBot>;
  readonly lotes: ClasificacionLotes;
  readonly productos: ReadonlyMap<string, ProductoQuiosco>;
  readonly dormidos: ReadonlyArray<DormidoQuiosco>;
  readonly prefs: Preferencias;
}

export type EstadoComercioQuiosco =
  | "enviado"
  | "omitido_sin_novedad"
  | "omitido_optout"
  | "omitido_ya_enviado"
  | "fallo";

export type SeccionQuiosco = "vencimientos" | "rotacion";

export interface ResultadoQuiosco {
  readonly tenantId: string;
  readonly clave: string;
  readonly estado: EstadoComercioQuiosco;
  readonly secciones: ReadonlyArray<SeccionQuiosco>;
  readonly promos: ReadonlyArray<Sugerencia>;
  readonly texto: string | null;
  readonly error: string | null;
}

export interface EnvioQuiosco {
  readonly ok: boolean;
  readonly error?: string | undefined;
}

export function clave_bot_quiosco(tenantId: string, fecha: string): string {
  return `bot_quiosco:${tenantId}:${fecha}`;
}

// Corridas ya registradas en este proceso (idempotencia en memoria).
const corridas = new Set<string>();

export function limpiar_corridas_quiosco(): void {
  corridas.clear();
}

function nombreDe(productos: ReadonlyMap<string, ProductoQuiosco>, sku: string): string {
  return productos.get(sku)?.nombre ?? sku;
}

// Lote por vencer -> Sugerencia motivo "vencer": el impacto es el precio vivo
// por lo que queda del lote (lo que se recupera si sale en promo).
function promoVencer(a: AlertaLote, productos: ReadonlyMap<string, ProductoQuiosco>): Sugerencia {
  const precio = productos.get(a.sku)?.precioCentavos ?? 0n;
  return {
    sku: a.sku,
    nombre: nombreDe(productos, a.sku),
    motivo: "vencer",
    promo: "2x1",
    impactoCentavos: precio * BigInt(a.cantidad_restante),
    detalle: "Ponelo en oferta antes del vencimiento",
    venceEnDias: a.dias,
  };
}

// RT4 dormido -> Sugerencia motivo "dormido": impacto = stock inmovilizado.
function promoDormido(d: DormidoQuiosco, productos: ReadonlyMap<string, ProductoQuiosco>): Sugerencia {
  return {
    sku: d.sku,
    nombre: nombreDe(productos, d.sku),
    motivo: "dormido",
    promo: "2x1",
    impactoCentavos: d.inmovilizadoCentavos,
    detalle: "Revisá si sigue a la venta",
    diasDormido: d.diasSinVenta,
  };
}

interface Armado {
  readonly texto: string;
  readonly secciones: ReadonlyArray<SeccionQuiosco>;
  readonly promos: ReadonlyArray<Sugerencia>;
}

function cuandoVence(dias: number): string {
  if (dias === 0) return "vence hoy";
  if (dias === 1) return "vence mañana";
  return `vence en ${dias} días`;
}

// Tramos CAT-S4 de más urgente a menos: 3d, 7d, 15d.
function alertasVencimientos(lotes: ClasificacionLotes): AlertaLote[] {
  return [...lotes.alertas_3d, ...lotes.alertas_7d, ...lotes.alertas_15d];
}

function seccionVencimientos(c: ComercioQuiosco, promos: Sugerencia[]): string | null {
  const alertas = alertasVencimientos(c.lotes);
  if (alertas.length === 0) return null;
  const promosVencer = topear_3_por_impacto(c.lotes.alertas_3d.map((a) => promoVencer(a, c.productos)));
  promos.push(...promosVencer);
  const lineas = [
    "Vencimientos:",
    ...alertas.map((a) => `- ${nombreDe(c.productos, a.sku)}: ${cuandoVence(a.dias)} (${a.cantidad_restante} u.)`),
  ];
  if (promosVencer.length > 0) {
    lineas.push("Promos:", ...promosVencer.map((s) => `- ${armar_linea_promo(s)}`));
  }
  return lineas.join("\n");
}

function seccionRotacion(c: ComercioQuiosco, promos: Sugerencia[]): string | null {
  const dormidos = c.dormidos.slice(0, MAX_SUGERENCIAS).map((d) => promoDormido(d, c.productos));
  if (dormidos.length === 0) return null;
  promos.push(...dormidos);
  return ["Rotación:", ...dormidos.map((s) => `- ${armar_linea_promo(s)}`)].join("\n");
}

// Un bloque por módulo activo con novedades. Sin ningún bloque no hay envío.
function armar(c: ComercioQuiosco, fecha: string): Armado | null {
  const activos = new Set<string>(c.modulos);
  const secciones: SeccionQuiosco[] = [];
  const bloques: string[] = [];
  const promos: Sugerencia[] = [];

  if (activos.has("vencimientos")) {
    const bloque = seccionVencimientos(c, promos);
    if (bloque !== null) {
      bloques.push(bloque);
      secciones.push("vencimientos");
    }
  }
  if (activos.has("rotacion")) {
    const bloque = seccionRotacion(c, promos);
    if (bloque !== null) {
      bloques.push(bloque);
      secciones.push("rotacion");
    }
  }
  if (bloques.length === 0) return null;
  return { texto: [`${c.nombreComercio} · ${fecha}`, ...bloques].join("\n"), secciones, promos };
}

export function ejecutar_bot_quiosco(args: {
  readonly comercios: ReadonlyArray<ComercioQuiosco>;
  readonly fecha: string;
  readonly ahoraMs: number;
  readonly yaEnviados?: ReadonlySet<string> | undefined;
  readonly enviar: (tenantId: string, payload: { readonly texto: string; readonly clave: string }) => EnvioQuiosco;
}): { readonly resultados: ReadonlyArray<ResultadoQuiosco> } {
  const resultados: ResultadoQuiosco[] = [];
  for (const c of args.comercios) {
    const clave = clave_bot_quiosco(c.tenantId, args.fecha);
    const terminar = (estado: EstadoComercioQuiosco, armado: Armado | null, error: string | null): void => {
      resultados.push({
        tenantId: c.tenantId,
        clave,
        estado,
        secciones: armado?.secciones ?? [],
        promos: armado?.promos ?? [],
        texto: armado?.texto ?? null,
        error,
      });
    };
    // Idempotente por comercio: memoria del proceso + registro externo.
    if (corridas.has(clave) || args.yaEnviados?.has(clave) === true) {
      terminar("omitido_ya_enviado", null, null);
      continue;
    }
    // Respeta opt-in/pausa antes de armar el mensaje.
    if (!puede_enviar_whatsapp(c.prefs, args.ahoraMs)) {
      terminar("omitido_optout", null, null);
      continue;
    }
    const armado = armar(c, args.fecha);
    if (armado === null) {
      terminar("omitido_sin_novedad", null, null);
      continue;
    }
    let envio: EnvioQuiosco;
    try {
      envio = args.enviar(c.tenantId, { texto: armado.texto, clave });
    } catch (e) {
      terminar("fallo", armado, e instanceof Error ? e.message : "fallo_envio");
      continue;
    }
    if (!envio.ok) {
      terminar("fallo", armado, envio.error ?? "fallo_envio");
      continue;
    }
    corridas.add(clave);
    terminar("enviado", armado, null);
  }
  return { resultados: Object.freeze(resultados) };
}
