// Núcleo puro inventario (F1-F14, ADR-0003/0004). Sin IO, sin Drizzle, sin store.
// El estado entra como valor inmutable y sale como valor nuevo; el adaptador
// (sales.ts hoy sobre store.stock, Drizzle con FOR UPDATE mañana) aplica.
// Misma disciplina que confirmar_venta / caja / sync-policy.

declare const SkuBrand: unique symbol;
export type Sku = string & { readonly [SkuBrand]: "Sku" };

declare const LotBrand: unique symbol;
export type LotId = string & { readonly [LotBrand]: "LotId" };

export type Resultado<T, E extends string> = { ok: true; valor: T } | { ok: false; codigo: E };

export interface CodigoProducto {
  readonly codigo: string;
  readonly sku: Sku;
  readonly padre: string | null;
}

export interface Lote {
  readonly id: LotId;
  readonly sku: Sku;
  readonly cantidad: number;
  /** Vencimiento nullable: NULLS LAST en FEFO (stock sin vencimiento migra así). */
  readonly venceEl: Date | null;
  readonly costoCentavos: bigint;
}

export type TipoMovimiento = "ALTA" | "VENTA" | "COMPENSATORIO" | "MERMA" | "AJUSTE_CONTEO";

export interface MovimientoStock {
  readonly idemKey: string;
  readonly sku: Sku;
  readonly loteId: LotId | null;
  /** Unidades con signo (+alta, -venta). Number int: son conteos, no dinero. */
  readonly delta: number;
  readonly tipo: TipoMovimiento;
  readonly motivo: string | null;
}

export interface LineaInventario {
  readonly sku: Sku;
  readonly cantidad: number;
}

export interface DescuentoPorLote {
  readonly loteId: LotId;
  readonly sku: Sku;
  readonly cantidad: number;
}

export interface Faltante {
  readonly sku: Sku;
  readonly faltante: number;
}

export type ModoDescuento = "ONLINE" | "OFFLINE_PERMITIDO";

/** Normaliza código escaneado (F2): trim + mayúsculas. */
export function normalizarCodigo(raw: string): string {
  return raw.trim().toUpperCase();
}
/** Resuelve código a SKU canónico por match exacto normalizado. Null si desconocido. */
export function resolverCodigo(codigos: ReadonlyArray<CodigoProducto>, raw: string): Sku | null {
  const norm = normalizarCodigo(raw);
  if (!norm) return null;
  for (const c of codigos) {
    if (normalizarCodigo(c.codigo) === norm) return c.sku;
  }
  return null;
}

/**
 * Adaptador mínimo store->núcleo: un lote semilla por SKU con stock>0.
 * Slice-0 no persiste qtyRestante por lote; cuando el backing sea Drizzle
 * este helper desaparece y los lotes vienen de stock_lots (FOR UPDATE).
 */
export function lotesDesdeStock(stock: ReadonlyMap<string, number>): Lote[] {
  const out: Lote[] = [];
  for (const [s, qty] of stock) {
    if (!Number.isInteger(qty) || qty <= 0) continue;
    out.push({ id: `seed-${s}` as LotId, sku: s as Sku, cantidad: qty, venceEl: null, costoCentavos: 0n });
  }
  return out;
}

function esCantidadValida(n: number): boolean {
  return Number.isInteger(n) && n > 0 && n <= 999;
}

/** Orden FEFO: venceEl ASC, NULLS LAST, desempate id ASC. */
function ordenarFefo(lotes: ReadonlyArray<Lote>): Lote[] {
  return [...lotes].sort((a, b) => {
    if (a.venceEl == null && b.venceEl == null) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (a.venceEl == null) return 1;
    if (b.venceEl == null) return -1;
    const d = a.venceEl.getTime() - b.venceEl.getTime();
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface DescuentoOk {
  readonly descuentos: ReadonlyArray<DescuentoPorLote>;
  readonly movimientos: ReadonlyArray<MovimientoStock>;
  readonly sobreventa: ReadonlyArray<Faltante>;
}

/**
 * Descuenta líneas por FEFO. Puro.
 * ONLINE: faltante de 1 unidad => ok:false SIN_STOCK, sin parcial.
 * OFFLINE_PERMITIDO: acepta y marca sobreventa (E2), nunca bloquea mostrador.
 */
export function descontar(args: {
  readonly lotes: ReadonlyArray<Lote>;
  readonly lineas: ReadonlyArray<LineaInventario>;
  readonly modo: ModoDescuento;
  readonly idemKey: string;
  // PRD-STOCK-01 STOCK-S2 (ADR-0106): SKUs con alta al vuelo y stock inicial
  // 0. En ONLINE no bloquean el mostrador: su faltante se registra como
  // sobreventa, igual que el camino offline, en vez de devolver SIN_STOCK.
  readonly sobreventaPermitida?: ReadonlySet<string> | undefined;
}): Resultado<DescuentoOk, "SIN_STOCK" | "LINEA_INVALIDA"> {
  if (args.lineas.length === 0 || !args.idemKey) return { ok: false, codigo: "LINEA_INVALIDA" };
  for (const l of args.lineas) {
    if (!l.sku || !esCantidadValida(l.cantidad)) return { ok: false, codigo: "LINEA_INVALIDA" };
  }

  const pedidos = new Map<Sku, number>();
  for (const l of args.lineas) pedidos.set(l.sku, (pedidos.get(l.sku) ?? 0) + l.cantidad);

  const porSku = new Map<Sku, Lote[]>();
  for (const lote of args.lotes) {
    if (!lote.sku || lote.cantidad <= 0) continue;
    const arr = porSku.get(lote.sku);
    if (arr) arr.push(lote);
    else porSku.set(lote.sku, [lote]);
  }
  for (const [sku, arr] of porSku) porSku.set(sku, ordenarFefo(arr));

  const descuentos: DescuentoPorLote[] = [];
  const movimientos: MovimientoStock[] = [];
  const sobreventa: Faltante[] = [];

  for (const [sku, pedido] of pedidos) {
    let resto = pedido;
    for (const lote of porSku.get(sku) ?? []) {
      if (resto <= 0) break;
      const toma = Math.min(resto, lote.cantidad);
      if (toma <= 0) continue;
      descuentos.push({ loteId: lote.id, sku, cantidad: toma });
      movimientos.push({ idemKey: args.idemKey, sku, loteId: lote.id, delta: -toma, tipo: "VENTA", motivo: null });
      resto -= toma;
    }
    if (resto > 0) {
      if (args.modo === "ONLINE" && !args.sobreventaPermitida?.has(sku)) {
        return { ok: false, codigo: "SIN_STOCK" };
      }
      sobreventa.push({ sku, faltante: resto });
    }
  }

  return { ok: true, valor: { descuentos, movimientos, sobreventa } };
}

export interface AltaLote {
  readonly id: LotId;
  readonly sku: Sku;
  readonly cantidad: number;
  readonly venceEl: Date | null;
  readonly costoCentavos: bigint;
}

/**
 * Da de alta lotes + movimientos ALTA. Puro, no muta la entrada.
 * Lote sin vencimiento se acepta (migra stock actual); FEFO lo deja último.
 */
// Nivel 1 — Inmutable: el stock NUNCA se edita; solo se agregan movimientos.
// Este compensatorio vinculado corrige por conteo/devolución con motivo
// obligatorio (auditoría). Puro, no muta nada.
export function compensar(args: {
  readonly sku: Sku;
  readonly loteId: LotId | null;
  readonly cantidad: number;
  readonly motivo: string;
  readonly idemKey: string;
}): Resultado<MovimientoStock, "COMPENSATORIO_INVALIDO"> {
  if (!args.idemKey || !args.sku) return { ok: false, codigo: "COMPENSATORIO_INVALIDO" };
  if (!Number.isInteger(args.cantidad) || args.cantidad === 0 || Math.abs(args.cantidad) > 9999) {
    return { ok: false, codigo: "COMPENSATORIO_INVALIDO" };
  }
  const motivo = (args.motivo ?? "").trim();
  if (!motivo || motivo.length > 280) return { ok: false, codigo: "COMPENSATORIO_INVALIDO" };
  return {
    ok: true,
    valor: { idemKey: args.idemKey, sku: args.sku, loteId: args.loteId, delta: args.cantidad, tipo: "COMPENSATORIO", motivo },
  };
}

// Nivel 1 — Verifica sin autocorregir (estilo verificar_cache): deriva stock
// por sku desde movimientos y reporta idemKeys duplicados. Solo reporta.
export function verificar_movimientos(movs: ReadonlyArray<MovimientoStock>): {
  readonly derivadoPorSku: ReadonlyMap<Sku, number>;
  readonly idemDuplicados: ReadonlyArray<string>;
} {
  const derivado = new Map<Sku, number>();
  const vistos = new Set<string>();
  const dupls = new Set<string>();
  for (const m of movs) {
    derivado.set(m.sku, (derivado.get(m.sku) ?? 0) + m.delta);
    if (vistos.has(m.idemKey)) dupls.add(m.idemKey);
    else vistos.add(m.idemKey);
  }
  return { derivadoPorSku: derivado, idemDuplicados: [...dupls] };
}

export function ingresar(args: {
  readonly altas: ReadonlyArray<AltaLote>;
  readonly idemKey: string;
}): Resultado<{ readonly lotes: ReadonlyArray<Lote>; readonly movimientos: ReadonlyArray<MovimientoStock> }, "LOTE_INVALIDO"> {
  if (!args.idemKey) return { ok: false, codigo: "LOTE_INVALIDO" };
  const lotes: Lote[] = [];
  const movimientos: MovimientoStock[] = [];
  for (const a of args.altas) {
    if (!a.id || !a.sku || !esCantidadValida(a.cantidad) || a.costoCentavos < 0n) {
      return { ok: false, codigo: "LOTE_INVALIDO" };
    }
    if (a.venceEl != null && Number.isNaN(a.venceEl.getTime())) return { ok: false, codigo: "LOTE_INVALIDO" };
    lotes.push({ id: a.id, sku: a.sku, cantidad: a.cantidad, venceEl: a.venceEl, costoCentavos: a.costoCentavos });
    movimientos.push({ idemKey: args.idemKey, sku: a.sku, loteId: a.id, delta: a.cantidad, tipo: "ALTA", motivo: null });
  }
  return { ok: true, valor: { lotes, movimientos } };
}
