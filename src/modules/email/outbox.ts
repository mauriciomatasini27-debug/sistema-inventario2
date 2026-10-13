// Núcleo puro NE11: cola, reintentos e idempotencia. Sin IO.
// La tx de negocio inserta el evento; el worker procesa por fuera.

export type ErrorProv = "transitorio" | "permanente";

// Transitorios: timeout, 429, 5xx. Permanentes: dirección inválida o
// suprimida, 4xx de validación (no se reintentan).
export function clasificar_error(codigo: string | number): ErrorProv {
  if (codigo === "timeout" || codigo === 429) return "transitorio";
  if (typeof codigo === "number" && codigo >= 500) return "transitorio";
  if (typeof codigo === "string" && /^5\d\d$/.test(codigo)) return "transitorio";
  return "permanente";
}

// Backoff con jitter: 1m, 5m, 30m, 2h, 6h; tope 24h. null = fallida.
const PASOS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];

export function proximo_reintento(intentos: number, ahoraMs: number): number | null {
  if (intentos >= PASOS_MS.length) return null;
  const paso = PASOS_MS[intentos];
  if (paso == null) return null;
  const jitter = (ahoraMs % 60_000) / 60_000;
  const demora = Math.floor(paso * (0.9 + 0.2 * jitter));
  if (ahoraMs + demora - ahoraMs > 24 * 3600_000) return null;
  return ahoraMs + demora;
}

// Programados vencen fuera de su ventana útil (matutino después de las
// 12:00 se cancela); seguridad y cuenta no vencen (NE11.5).
export function vencido(categoria: string, ahoraMin: number): boolean {
  if (categoria === "seguridad" || categoria === "cuenta") return false;
  if (categoria === "stock_bajo" || categoria === "matutino") return ahoraMin >= 12 * 60;
  return false;
}

// Dispersa programados 0-10 min por hash de tenant (NE11.6: 500 comercios
// a las 08:00 salen entre 08:00 y 08:10).
export function jitter_programado(baseMs: number, tenantId: string): number {
  let h = 0;
  for (let i = 0; i < tenantId.length; i++) h = (h * 31 + tenantId.charCodeAt(i)) >>> 0;
  return baseMs + (h % (10 * 60_000));
}

// Idempotency key canónica (NE11.3).
export function clave_entrega(args: { tenant: string; tipo: string; referencia: string; periodo: string; usuario: string; canal: string }): string {
  return `email:${args.tenant}:${args.tipo}:${args.referencia}:${args.periodo}:${args.usuario}:${args.canal}`;
}
