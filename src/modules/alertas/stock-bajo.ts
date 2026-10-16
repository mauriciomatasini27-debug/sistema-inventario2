// Núcleo puro ALR-S1 a S4 (PRD-ALR-01, ADR-0043). Sin IO, sin red, sin env.
// Cierra los huecos que no piden migración: umbral efectivo con fallback de
// rotación 7d (S1), clave tenant+producto+día y ventana de quiebre (S2),
// destinatarios por rol y canal con pausa (S3) y pie ver-todo + cobertura (S4).
// La persistencia de min_stock/reorder_qty y pg_cron quedan pendientes.

export type CanalAlerta = "whatsapp" | "email";

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

export interface PersonaAlerta {
  readonly googleSub: string;
  readonly optInWa: boolean;
  readonly pausaHastaMs: number | null;
  readonly email?: string | undefined;
}

export interface DestinatarioAlerta {
  readonly googleSub: string;
  readonly rol: "dueno" | "encargado";
  readonly canales: ReadonlyArray<CanalAlerta>;
}

// ALR-S3 AC: el Dueño siempre entra; el encargado solo con opt-in de WA
// (sin opt-in recibe solo email si dejó email); con canal pausado no recibe.
export function resolver_destinatarios(args: {
  readonly dueno: PersonaAlerta;
  readonly encargados: ReadonlyArray<PersonaAlerta & { readonly email?: string | undefined }>;
  readonly ahoraMs: number;
}): DestinatarioAlerta[] {
  const out: DestinatarioAlerta[] = [];
  const pausado = (p: PersonaAlerta): boolean => p.pausaHastaMs != null && args.ahoraMs < p.pausaHastaMs;
  if (!pausado(args.dueno)) {
    const canales: CanalAlerta[] = ["email"];
    if (args.dueno.optInWa) canales.unshift("whatsapp");
    out.push({ googleSub: args.dueno.googleSub, rol: "dueno", canales: Object.freeze(canales) });
  }
  for (const e of args.encargados) {
    if (pausado(e)) continue;
    if (e.optInWa) out.push({ googleSub: e.googleSub, rol: "encargado", canales: Object.freeze(["whatsapp", "email"]) });
    else if (e.email) out.push({ googleSub: e.googleSub, rol: "encargado", canales: Object.freeze(["email"]) });
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
