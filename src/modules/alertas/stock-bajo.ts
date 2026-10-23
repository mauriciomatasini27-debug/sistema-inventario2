// Núcleo puro ALR-S1 a S4 (PRD-ALR-01, ADR-0043). Sin IO, sin red, sin env.
// Cierra los huecos que no piden migración: umbral efectivo con fallback de
// rotación 7d (S1), clave tenant+producto+día y ventana de quiebre (S2),
// destinatarios por rol y canal con pausa (S3) y pie ver-todo + cobertura (S4).
// La persistencia de min_stock/reorder_qty y pg_cron quedan pendientes.

export type CanalAlerta = "whatsapp" | "email";
export type CanalElegido = "whatsapp" | "email" | "ambos";

// ALR-S1 AC: con mínimo se usa el mínimo; sin mínimo se usa la demanda de
// rotación 7d como umbral; sin ninguno no hay alerta.
export function umbral_efectivo(minimo: number | null | undefined, ventas7d: number): number | null {
  if (typeof minimo === "number" && minimo > 0) return Math.floor(minimo);
  if (ventas7d > 0) return Math.max(1, Math.ceil(ventas7d));
  return null;
}

// ALR-S2 AC: una sola alerta por tenant+producto+día. ADR-0043.
export function clave_alerta_stock(tenantId: string, sku: string, fecha: string): string {
  return `alerta_stock:${tenantId}:${sku}:${fecha}`;
}

export function es_quiebre(stock: number): boolean {
  return stock <= 0;
}

// ALR-S2: quiebre solo de 10:00 a 20:00. Hora "HH:MM" de America/Argentina.
export function en_ventana_quiebre(horaHHMM: string): boolean {
  const m = horaHHMM.match(/^(\d{2}):(\d{2})$/);
  if (!m?.[1] || !m?.[2]) return false;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min >= 10 * 60 && min <= 20 * 60;
}

export interface PersonaDueno {
  readonly rol: "dueno";
  readonly googleSub: string;
  readonly optInWa: boolean;
  readonly email?: string;
  readonly avisoHora: string;
  readonly pausaHastaMs: number | null;
}

export interface PersonaEncargado {
  readonly rol: "encargado";
  readonly googleSub: string;
  readonly optInWa: boolean;
  readonly email?: string;
  readonly canal: CanalElegido;
  readonly avisoHora: string;
  readonly pausaHastaMs: number | null;
}

export interface DestinatarioAlerta {
  readonly googleSub: string;
  readonly rol: "dueno" | "encargado";
  readonly canales: ReadonlyArray<CanalAlerta>;
}

function pausado(pausaHastaMs: number | null, ahoraMs: number): boolean {
  return pausaHastaMs != null && ahoraMs < pausaHastaMs;
}

export function canalesEfectivos(p: PersonaDueno | PersonaEncargado): CanalAlerta[] {
  if (p.rol === "dueno") {
    const out: CanalAlerta[] = ["email"];
    if (p.optInWa) out.unshift("whatsapp");
    return out;
  }
  const base: CanalAlerta[] =
    p.canal === "whatsapp" ? ["whatsapp"] : p.canal === "email" ? ["email"] : ["whatsapp", "email"];
  return base.filter((c) => {
    if (c === "whatsapp") return p.optInWa;
    if (c === "email") return !!p.email;
    return false;
  });
}

// ALR-S3 / DASH-S5: Dueños fijos, encargado con canal elegido, matutino filtra hora.
export function resolver_destinatarios(args: {
  readonly duenos: readonly PersonaDueno[];
  readonly encargados: readonly PersonaEncargado[];
  readonly ahoraMs: number;
  readonly modo: "matutino" | "quiebre";
  readonly horaTick: string;
}): DestinatarioAlerta[] {
  const out: DestinatarioAlerta[] = [];
  const horaOk = (avisoHora: string): boolean => args.modo === "quiebre" || avisoHora === args.horaTick;

  for (const d of args.duenos) {
    if (pausado(d.pausaHastaMs, args.ahoraMs)) continue;
    if (!horaOk(d.avisoHora)) continue;
    const canales = canalesEfectivos(d);
    if (canales.length === 0) continue;
    out.push({ googleSub: d.googleSub, rol: "dueno", canales: Object.freeze(canales) });
  }
  for (const e of args.encargados) {
    if (pausado(e.pausaHastaMs, args.ahoraMs)) continue;
    if (!horaOk(e.avisoHora)) continue;
    const canales = canalesEfectivos(e);
    if (canales.length === 0) continue;
    out.push({ googleSub: e.googleSub, rol: "encargado", canales: Object.freeze(canales) });
  }
  return out;
}

// ALR-S4: días de cobertura desde stock vivo y venta diaria. Null sin venta.
export function cobertura_dias(stock: number, ventaDiaria: number): number | null {
  if (!(ventaDiaria > 0)) return null;
  return Math.max(0, Math.floor((stock / ventaDiaria) * 10) / 10);
}

// ALR-S4 AC: un mensaje por canal con 10 ítems y link ver-todo si sobran.
export function armar_pie_ver_todo(args: { total: number; pagina: number; porPagina: number }): string {
  const pp = Math.max(1, Math.min(10, Math.floor(args.porPagina)));
  if (args.total <= pp) return "";
  const totalPaginas = Math.ceil(args.total / pp);
  return `Página ${args.pagina} de ${totalPaginas}: mostré ${pp} de ${args.total}. Ver todo en la app.`;
}

export function filtrar_pendientes(skus: ReadonlyArray<string>, yaEnviados: ReadonlySet<string>): string[] {
  return skus.filter((s) => !yaEnviados.has(s));
}
