// Núcleo puro Track1 Bot WA B4: alertas de stock bajo.
// Sin IO, sin Drizzle, sin fetch, sin env. El adaptador arma el snapshot
// vivo y este módulo solo calcula + redacta en rioplatense (vos, sin
// tecnicismos). Límites Meta: botones max 3x20 chars, listas max 10 filas.
//
// B4.1 umbral 0 nunca alerta (sin umbral no hay alerta).
// B4.2 agrupar por proveedor + "Sin proveedor".
// B4.4 urgente si stock 0 o crítico o stock < umbral/2.
// B4.5 "qué me falta" se calcula en vivo al momento de la consulta.

export interface ItemAlertaEntrada {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor?: string | null | undefined;
  readonly critico?: boolean | undefined;
}

export interface Alerta {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor: string | null;
  readonly urgente: boolean;
  readonly sugerido: number;
}

export const PROVEEDOR_SIN_DATO = "Sin proveedor" as const;

// Por página de WhatsApp: nunca más de 10 filas (límite Meta listas).
export const ALERTAS_POR_PAGINA = 10 as const;

function proveedor_clave(proveedor: string | null | undefined): string {
  const p = (proveedor ?? "").trim();
  return p.length > 0 ? p : PROVEEDOR_SIN_DATO;
}

// B4.4: urgente si no queda nada, si está marcado crítico o si está por
// debajo de la mitad del umbral.
export function clasificar_urgencia(stock: number, umbral: number, critico = false): boolean {
  return stock <= 0 || critico || stock < umbral / 2;
}

// B4.1: sin umbral (0 o negativo) nunca hay alerta.
export function es_alerta(item: ItemAlertaEntrada): boolean {
  return item.umbral > 0 && item.stock <= item.umbral;
}

// Misma fórmula que email/stock-matutino.ts (sugerido_para): lo que falta
// para el umbral + la mitad del umbral de changüí; si no falta pero es
// urgente se sugiere al menos el umbral.
export function sugerido_alerta(stock: number, umbral: number, urgente: boolean): number {
  const base = Math.max(umbral - stock, 0);
  if (base > 0) return base + Math.ceil(umbral / 2);
  return urgente ? Math.max(umbral, 1) : 0;
}

function comparar_alertas(a: Alerta, b: Alerta): number {
  if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
  const ra = a.stock / a.umbral;
  const rb = b.stock / b.umbral;
  if (ra !== rb) return ra - rb;
  if (a.stock !== b.stock) return a.stock - b.stock;
  return a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0;
}

// Calcula las alertas desde un snapshot vivo, ordenadas por urgencia
// (urgentes primero, después por stock/umbral más bajo).
export function calcular_alertas(catalogo: ReadonlyArray<ItemAlertaEntrada>): Alerta[] {
  const out: Alerta[] = [];
  for (const it of catalogo) {
    if (!es_alerta(it)) continue;
    const urgente = clasificar_urgencia(it.stock, it.umbral, it.critico ?? false);
    out.push(
      Object.freeze({
        sku: it.sku,
        nombre: it.nombre,
        stock: it.stock,
        umbral: it.umbral,
        proveedor: it.proveedor ?? null,
        urgente,
        sugerido: sugerido_alerta(it.stock, it.umbral, urgente),
      }),
    );
  }
  out.sort(comparar_alertas);
  return out;
}

// B4.2: agrupa por proveedor; sin dato cae en "Sin proveedor".
export function agrupar_por_proveedor(alertas: ReadonlyArray<Alerta>): ReadonlyMap<string, ReadonlyArray<Alerta>> {
  const grupos = new Map<string, Alerta[]>();
  for (const a of alertas) {
    const k = proveedor_clave(a.proveedor);
    const arr = grupos.get(k);
    if (arr) arr.push(a);
    else grupos.set(k, [a]);
  }
  const ordenadas = new Map<string, ReadonlyArray<Alerta>>();
  const claves = [...grupos.keys()].sort((a, b) => (a < b ? -1 : 1));
  for (const k of claves) {
    const items = [...(grupos.get(k) ?? [])].sort(comparar_alertas);
    ordenadas.set(k, Object.freeze(items));
  }
  return ordenadas;
}

export interface PaginaAlertas {
  readonly texto: string;
  readonly pagina: number;
  readonly totalPaginas: number;
  readonly total: number;
  readonly urgentes: number;
}

// Texto paginado de a 10, rioplatense y sin tecnicismos. La página se
// cuenta desde 1; si pedís una página fuera de rango se ajusta sola.
export function armar_texto_alertas(
  alertas: ReadonlyArray<Alerta>,
  comercio: string,
  pagina = 1,
  porPagina: number = ALERTAS_POR_PAGINA,
): PaginaAlertas {
  const total = alertas.length;
  const urgentes = alertas.filter((a) => a.urgente).length;
  const porPag = Math.max(1, Math.min(10, Math.floor(porPagina)));
  const totalPaginas = Math.max(1, Math.ceil(total / porPag));
  const pag = Math.max(1, Math.min(pagina, totalPaginas));
  if (total === 0) {
    return {
      texto: `Todo tranqui en ${comercio}, no te falta nada.`,
      pagina: 1,
      totalPaginas: 1,
      total: 0,
      urgentes: 0,
    };
  }
  const ordenadas = [...alertas].sort(comparar_alertas);
  const desde = (pag - 1) * porPag;
  const lote = ordenadas.slice(desde, desde + porPag);
  const encabezado =
    total === 1
      ? `Che, en ${comercio} hay 1 producto con poco stock:`
      : urgentes > 0
        ? `Che, en ${comercio} hay ${total} productos con poco stock (${urgentes} urgentes):`
        : `Che, en ${comercio} hay ${total} productos con poco stock:`;
  const lineas = lote.map((a) => {
    const prov = proveedor_clave(a.proveedor);
    const queda = a.stock <= 0 ? "sin stock" : `quedan ${a.stock}`;
    const marca = a.urgente ? " — URGENTE, pedilo ya" : "";
    return `• ${a.nombre} — ${queda} (umbral ${a.umbral}) — ${prov} — sugerido: ${a.sugerido}${marca}`;
  });
  const pie =
    totalPaginas > 1
      ? `\n\nPágina ${pag} de ${totalPaginas}. Pedime "qué me falta" para ver el resto.`
      : "";
  return { texto: `${encabezado}\n${lineas.join("\n")}${pie}`, pagina: pag, totalPaginas, total, urgentes };
}

// B4.5: "qué me falta" siempre sobre stock vivo al momento de la consulta.
export function responder_que_falta(
  catalogoVivo: ReadonlyArray<ItemAlertaEntrada>,
  comercio: string,
  pagina = 1,
): PaginaAlertas {
  return armar_texto_alertas(calcular_alertas(catalogoVivo), comercio, pagina);
}

export interface BotonAlerta {
  readonly id: string;
  readonly titulo: string;
}

// Botones de la alerta (máx 3, máx 20 chars cada uno — límite Meta).
export function botones_alertas(): ReadonlyArray<BotonAlerta> {
  return Object.freeze([
    Object.freeze({ id: "pedir_ahora", titulo: "Pedir ahora" }),
    Object.freeze({ id: "guardar_viernes", titulo: "Guardar viernes" }),
    Object.freeze({ id: "ver_detalle", titulo: "Ver detalle" }),
  ]);
}
