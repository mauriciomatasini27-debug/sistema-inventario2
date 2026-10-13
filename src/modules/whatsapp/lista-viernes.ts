// Núcleo puro Track2 Bot WA B6: urgente-ya / no-urgente-viernes + lista del viernes.
// Sin IO, sin Drizzle, sin reloj propio. Todo inmutable: se devuelven valores
// nuevos congelados, nunca se muta la entrada.
// Convenciones: ESM, bigint en dinero (centavos), rioplatense en textos.
//
// B6.1 Pedir ahora crea/reutiliza borrador por proveedor (marcaSemanal false).
// B6.2 Guardar viernes agrega a borrador semanal (estado "Borrador", marca semanal).
// B6.3 Decisión por producto o por grupo (decidir_grupo).
// B6.4 Guardado que llega a 0 se avisa (promover_a_urgente).
// B6.5 Repuesto antes del viernes sale (quitar_repuestos).
// B6.6 Comandos lista del viernes (parsear_comando_viernes).
// B6.7 Visible en web: todo es plano y serializable (listar_para_web).

export interface ItemViernes {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor: string;
  readonly urgente: boolean;
  readonly sugerido: number;
}

// Lista del viernes agrupada por proveedor (Map proveedor -> items).
export type ListaViernes = ReadonlyMap<string, ReadonlyArray<ItemViernes>>;

export const PROVEEDOR_SIN_DATO = "Sin proveedor" as const;

const SIN_TILDES = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Misma fórmula que email/stock-matutino.ts (sugerido_para): base + mitad del
// umbral; si no hay base pero es urgente se sugiere al menos el umbral.
export function sugerido_viernes(stock: number, umbral: number, urgente: boolean): number {
  const base = Math.max(umbral - stock, 0);
  if (base > 0) return base + Math.ceil(umbral / 2);
  return urgente ? Math.max(umbral, 1) : 0;
}

export function es_urgente(stock: number, umbral: number, critico = false): boolean {
  return stock <= 0 || critico || stock < umbral / 2;
}

function proveedor_clave(proveedor: string | null | undefined): string {
  const p = (proveedor ?? "").trim();
  return p.length > 0 ? p : PROVEEDOR_SIN_DATO;
}

// Arma un ItemViernes desde un snapshot vivo (forma de ItemVivo en
// whatsapp/servicio.ts). Calcula urgente + sugerido acá para que el adaptador
// no duplique la regla.
export function crear_item_viernes(input: {
  readonly sku: string;
  readonly nombre: string;
  readonly stock: number;
  readonly umbral: number;
  readonly proveedor?: string | null | undefined;
  readonly critico?: boolean | undefined;
}): ItemViernes {
  const urgente = es_urgente(input.stock, input.umbral, input.critico ?? false);
  return Object.freeze({
    sku: input.sku,
    nombre: input.nombre,
    stock: input.stock,
    umbral: input.umbral,
    proveedor: proveedor_clave(input.proveedor),
    urgente,
    sugerido: sugerido_viernes(input.stock, input.umbral, urgente),
  });
}

// B6.2: agrega sin duplicar (por sku en cualquier proveedor). Si el sku ya
// está guardado se devuelve la misma lista. No muta la entrada.
export function agregar_al_viernes(lista: ListaViernes, item: ItemViernes): ListaViernes {
  for (const items of lista.values()) {
    if (items.some((i) => i.sku === item.sku)) return lista;
  }
  const clave = proveedor_clave(item.proveedor);
  const previa = lista.get(clave) ?? [];
  const next = new Map<string, ReadonlyArray<ItemViernes>>();
  for (const [k, v] of lista) next.set(k, v);
  next.set(clave, Object.freeze([...previa, Object.freeze({ ...item, proveedor: clave })]));
  return next;
}

// B6.5: saca los que se repusieron antes del viernes (stock vivo > umbral).
// Los urgentes que siguen bajos quedan pendientes. Los sku sin dato vivo se
// conservan. Devuelve la lista nueva + los que salieron (para avisar).
export function quitar_repuestos(
  lista: ListaViernes,
  stockVivo: ReadonlyMap<string, number>,
): { readonly lista: ListaViernes; readonly salieron: ReadonlyArray<ItemViernes> } {
  const salieron: ItemViernes[] = [];
  const next = new Map<string, ReadonlyArray<ItemViernes>>();
  for (const [prov, items] of lista) {
    const quedan: ItemViernes[] = [];
    for (const it of items) {
      const vivo = stockVivo.get(it.sku);
      if (vivo !== undefined && vivo > it.umbral) {
        salieron.push(it);
      } else {
        quedan.push(it);
      }
    }
    if (quedan.length > 0) next.set(prov, Object.freeze(quedan));
  }
  return { lista: next, salieron: Object.freeze(salieron) };
}

// B6.4: un guardado que llega a 0 se promueve a urgente y se avisa.
// Si el sku no está en la lista o ya era urgente, no hay aviso.
export function promover_a_urgente(
  lista: ListaViernes,
  sku: string,
  stockActual: number,
): { readonly lista: ListaViernes; readonly aviso: string | null } {
  if (stockActual > 0) return { lista, aviso: null };
  let encontrado: ItemViernes | null = null;
  let provDe: string | null = null;
  for (const [prov, items] of lista) {
    const hit = items.find((i) => i.sku === sku);
    if (hit) {
      encontrado = hit;
      provDe = prov;
      break;
    }
  }
  if (!encontrado || !provDe) return { lista, aviso: null };
  if (encontrado.urgente) return { lista, aviso: null };
  const promovido: ItemViernes = Object.freeze({
    ...encontrado,
    stock: stockActual,
    urgente: true,
    sugerido: sugerido_viernes(stockActual, encontrado.umbral, true),
  });
  const next = new Map<string, ReadonlyArray<ItemViernes>>();
  for (const [prov, items] of lista) {
    if (prov !== provDe) {
      next.set(prov, items);
      continue;
    }
    next.set(
      prov,
      Object.freeze(items.map((i) => (i.sku === sku ? promovido : i))),
    );
  }
  return {
    lista: next,
    aviso: `Che, ${promovido.nombre} se quedó sin stock. Lo pasé a urgente para pedirlo ya.`,
  };
}

// B6.3: decisión por producto o por grupo, en texto libre.
// "todo / todos / ambos / los dos / el grupo" -> grupo.
// Si el texto nombra un candidato -> producto. Si hay un solo candidato y el
// texto confirma ("ese / dale / sí") -> ese producto. Si no, nada.
export type DecisionGrupo =
  | { readonly kind: "grupo" }
  | { readonly kind: "producto"; readonly sku: string }
  | { readonly kind: "nada" };

export function decidir_grupo(
  texto: string,
  candidatos: ReadonlyArray<{ readonly sku: string; readonly nombre: string }>,
): DecisionGrupo {
  const t = ` ${SIN_TILDES(texto).replace(/[¡!¿?.,;:()"]/g, " ").replace(/\s+/g, " ")} `;
  if (candidatos.length === 0) return { kind: "nada" };
  const diceGrupo =
    t.includes(" todo ") ||
    t.includes(" todos ") ||
    t.includes(" todas ") ||
    t.includes(" ambos ") ||
    t.includes(" ambas ") ||
    t.includes(" los dos ") ||
    t.includes(" las dos ") ||
    t.includes(" el grupo ") ||
    t.includes(" todos esos ") ||
    t.includes(" todo junto ");
  if (diceGrupo) return { kind: "grupo" };
  for (const c of candidatos) {
    const nombre = SIN_TILDES(c.nombre).trim();
    if (nombre.length >= 3 && t.includes(` ${nombre} `)) {
      return { kind: "producto", sku: c.sku };
    }
  }
  // Palabra distintiva: está en un solo candidato ("oreo" decide m2 aunque
  // "milka" esté en los dos). Si dos candidatos distintos aciertan, no se decide.
  {
    const palabrasPorCandidato = candidatos.map((c) =>
      SIN_TILDES(c.nombre)
        .split(/\s+/)
        .filter((p) => p.length >= 4),
    );
    const aciertos = new Set<string>();
    for (let i = 0; i < candidatos.length; i++) {
      const palabras = palabrasPorCandidato[i] ?? [];
      const otros = new Set(palabrasPorCandidato.flatMap((ps, j) => (j === i ? [] : ps)));
      const c = candidatos[i];
      if (!c) continue;
      if (palabras.some((p) => !otros.has(p) && t.includes(` ${p} `))) {
        aciertos.add(c.sku);
      }
    }
    if (aciertos.size === 1) {
      const [sku] = aciertos;
      if (sku !== undefined) return { kind: "producto", sku };
    }
  }
  if (candidatos.length === 1) {
    const unico = candidatos[0];
    if (!unico) return { kind: "nada" };
    if (
      t.includes(" ese ") ||
      t.includes(" este ") ||
      t.includes(" dale ") ||
      t.includes(" si ") ||
      t.includes(" guardalo ") ||
      t.includes(" pedilo ")
    ) {
      return { kind: "producto", sku: unico.sku };
    }
  }
  return { kind: "nada" };
}

// B6.6: comandos de la lista del viernes en texto libre.
export type ComandoViernes =
  | { readonly kind: "ver_lista" }
  | { readonly kind: "que_guarde" }
  | { readonly kind: "guardar_viernes"; readonly resto: string }
  | { readonly kind: "pedir_ahora"; readonly resto: string }
  | { readonly kind: "ninguno" };

export function parsear_comando_viernes(texto: string): ComandoViernes {
  const crudo = texto.trim();
  const normalizado = SIN_TILDES(crudo).replace(/\s+/g, " ").trim();
  const t = ` ${normalizado} `;
  if (/lista del viernes|ver (el |mi )?viernes|mostrame (el |mi )?viernes|resumen del viernes/.test(t)) {
    return { kind: "ver_lista" };
  }
  if (/que (tengo )?guardad[oa]|que guarde|que anote|que tengo para el viernes/.test(t)) {
    return { kind: "que_guarde" };
  }
  const pedir =
    normalizado.match(/^pedir ahora\s*(.*)$/) ??
    normalizado.match(/^pedilo ya\s*(.*)$/) ??
    normalizado.match(/^urgente\s+(.*)$/) ??
    normalizado.match(/^ya\s+(.*)$/);
  if (pedir) return { kind: "pedir_ahora", resto: (pedir[1] ?? "").trim() };
  // Cada alternativa tiene el resto en un grupo distinto: se matchea por
  // separado para no devolver el conector ("para el") como resto.
  const guardarVerbo = normalizado.match(
    /^(?:guardar|guarda|guardalo|guardala|anotar|anota|anotalo) (?:para el|en el|el) viernes\s*(.*)$/,
  );
  if (guardarVerbo) return { kind: "guardar_viernes", resto: (guardarVerbo[1] ?? "").trim() };
  const guardarCola = normalizado.match(/^(.*) (?:para el|en el) viernes$/);
  if (guardarCola) return { kind: "guardar_viernes", resto: (guardarCola[1] ?? "").trim() };
  const guardarViernes = normalizado.match(/^viernes\s+(.*)$/);
  if (guardarViernes) return { kind: "guardar_viernes", resto: (guardarViernes[1] ?? "").trim() };
  return { kind: "ninguno" };
}

// Respuesta corta rioplatense para confirmar un guardado (B6.2).

// B6.6: texto de la lista agrupado por proveedor, rioplatense. Vacía avisa
// que no hay nada guardado. Urgentes primero dentro de cada proveedor.
export function armar_texto_viernes(lista: ListaViernes, comercio: string): string {
  const total = contar_guardados(lista);
  if (total === 0) {
    return `Todavía no guardaste nada para el viernes en ${comercio}. Decime "guardalo para el viernes" y te lo anoto.`;
  }
  const bloques: string[] = [];
  const proveedores = [...lista.keys()].sort((a, b) => (a < b ? -1 : 1));
  for (const prov of proveedores) {
    const items = [...(lista.get(prov) ?? [])].sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      return a.nombre < b.nombre ? -1 : 1;
    });
    const lineas = items.map(
      (i) =>
        `  • ${i.nombre} — quedan ${i.stock} (umbral ${i.umbral}) — sugerido: ${i.sugerido}${i.urgente ? " URGENTE" : ""}`,
    );
    bloques.push(`${prov} (${items.length})\n${lineas.join("\n")}`);
  }
  const titulo =
    total === 1
      ? `Lista del viernes en ${comercio} — 1 producto guardado:`
      : `Lista del viernes en ${comercio} — ${total} productos guardados:`;
  return `${titulo}\n\n${bloques.join("\n\n")}\n\nEl viernes la vemos juntos. Si algo se acaba antes, pedilo ya.`;
}

export function contar_guardados(lista: ListaViernes): number {
  let n = 0;
  for (const items of lista.values()) n += items.length;
  return n;
}

// B6.7: planilla plana para la web (tabla de la lista del viernes).
// Ordenada por proveedor y nombre, serializable.
export function listar_para_web(
  lista: ListaViernes,
): ReadonlyArray<ItemViernes & { readonly proveedorGrupo: string }> {
  const out: Array<ItemViernes & { readonly proveedorGrupo: string }> = [];
  const proveedores = [...lista.keys()].sort((a, b) => (a < b ? -1 : 1));
  for (const prov of proveedores) {
    const items = [...(lista.get(prov) ?? [])].sort((a, b) => {
      if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
      return a.nombre < b.nombre ? -1 : 1;
    });
    for (const i of items) out.push(Object.freeze({ ...i, proveedorGrupo: prov }));
  }
  return Object.freeze(out);
}

// ---------------------------------------------------------------------------
// Borradores por proveedor (forma de purchase_orders: estado "Borrador").
// B6.1 urgente-ya (marcaSemanal false) crea/reutiliza borrador del proveedor.
// B6.2 no-urgente-viernes agrega al borrador semanal (marcaSemanal true).
// Dinero siempre bigint centavos. Puro e inmutable para que la web (B6.7)
// lo muestre tal cual.
// ---------------------------------------------------------------------------

export interface LineaBorrador {
  readonly sku: string;
  readonly nombre: string;
  readonly qty: number;
  readonly costoCentavos: bigint;
}

export interface BorradorPedido {
  readonly proveedor: string;
  readonly estado: "Borrador";
  readonly marcaSemanal: boolean;
  readonly lineas: ReadonlyArray<LineaBorrador>;
  readonly totalCentavos: bigint;
}

export function total_borrador(lineas: ReadonlyArray<LineaBorrador>): bigint {
  let total = 0n;
  for (const l of lineas) total += BigInt(l.qty) * l.costoCentavos;
  return total;
}

function clonar_linea(l: LineaBorrador): LineaBorrador {
  return Object.freeze({ sku: l.sku, nombre: l.nombre, qty: l.qty, costoCentavos: l.costoCentavos });
}

// B6.1: pedir ahora. Busca el borrador urgente del proveedor y lo reutiliza;
// si el sku ya está suma cantidades (es un pedido, no una lista). Si no hay
// borrador urgente lo crea.
export function pedir_ahora(
  borradores: ReadonlyArray<BorradorPedido>,
  proveedor: string,
  linea: LineaBorrador,
): ReadonlyArray<BorradorPedido> {
  const clave = proveedor_clave(proveedor);
  const idx = borradores.findIndex((b) => b.proveedor === clave && !b.marcaSemanal);
  if (idx === -1) {
    const nuevo: BorradorPedido = Object.freeze({
      proveedor: clave,
      estado: "Borrador" as const,
      marcaSemanal: false,
      lineas: Object.freeze([clonar_linea(linea)]),
      totalCentavos: BigInt(linea.qty) * linea.costoCentavos,
    });
    return Object.freeze([...borradores, nuevo]);
  }
  return Object.freeze(
    borradores.map((b, i) => {
      if (i !== idx) return b;
      const ya = b.lineas.find((l) => l.sku === linea.sku);
      const lineas =
        ya === undefined
          ? Object.freeze([...b.lineas, clonar_linea(linea)])
          : Object.freeze(
              b.lineas.map((l) =>
                l.sku === linea.sku ? clonar_linea({ ...l, qty: l.qty + linea.qty }) : l,
              ),
            );
      return Object.freeze({
        ...b,
        lineas,
        totalCentavos: total_borrador(lineas),
      });
    }),
  );
}

// B6.2: guardar para el viernes. Agrega al borrador semanal del proveedor del
// item, sin duplicar (guardar dos veces el mismo sku no suma ni repite).
// Devuelve los borradores nuevos + si se agregó o ya estaba.
export function guardar_en_semanal(
  borradores: ReadonlyArray<BorradorPedido>,
  item: ItemViernes,
  qty?: number | undefined,
  costoCentavos?: bigint | undefined,
): { readonly borradores: ReadonlyArray<BorradorPedido>; readonly agregado: boolean } {
  const clave = proveedor_clave(item.proveedor);
  const cantidad = qty ?? (item.sugerido > 0 ? item.sugerido : 1);
  const costo = costoCentavos ?? 0n;
  const idx = borradores.findIndex((b) => b.proveedor === clave && b.marcaSemanal);
  if (idx === -1) {
    const linea: LineaBorrador = Object.freeze({
      sku: item.sku,
      nombre: item.nombre,
      qty: cantidad,
      costoCentavos: costo,
    });
    const nuevo: BorradorPedido = Object.freeze({
      proveedor: clave,
      estado: "Borrador" as const,
      marcaSemanal: true,
      lineas: Object.freeze([linea]),
      totalCentavos: BigInt(cantidad) * costo,
    });
    return { borradores: Object.freeze([...borradores, nuevo]), agregado: true };
  }
  const actual = borradores[idx];
  if (!actual) return { borradores, agregado: false };
  if (actual.lineas.some((l) => l.sku === item.sku)) {
    return { borradores, agregado: false };
  }
  const linea: LineaBorrador = Object.freeze({
    sku: item.sku,
    nombre: item.nombre,
    qty: cantidad,
    costoCentavos: costo,
  });
  const lineas = Object.freeze([...actual.lineas, linea]);
  const next = Object.freeze(
    borradores.map((b, i) =>
      i === idx
        ? Object.freeze({ ...b, lineas, totalCentavos: total_borrador(lineas) })
        : b,
    ),
  );
  return { borradores: next, agregado: true };
}
