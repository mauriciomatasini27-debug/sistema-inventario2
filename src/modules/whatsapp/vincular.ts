// Núcleo puro B1 Vinculación (PRD Bot B1.1-B1.5). Sin IO, sin Drizzle:
// el adaptador (ruta) genera el código, guarda el hash y compara.
// Normalización E.164 AR: sin 0 ni 15, mismo criterio que F6.

export const VINCULAR_TTL_MIN = 10 as const;
export const VINCULAR_LEN = 6 as const;
// AU11.2: máximo 5 intentos por código; al agotarlos se invalida.
export const MAX_INTENTOS_VINCULAR = 5 as const;

export function debeInvalidarPorIntentos(intentos: number): boolean {
  return intentos >= MAX_INTENTOS_VINCULAR;
}

export function normalizar_ar(input: string): string | null {
  const dig = input.replace(/\D/g, "");
  if (!dig) return null;
  let d = dig;
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("54")) {
    // E.164 AR móvil: 54 + 9 + área + número. El 15 troncal nunca aparece acá.
    if (!/^549\d{10}$/.test(d)) return null;
    return `+${d}`;
  }
  // Local: quita el 15 troncal tras el área (11 15-5555-1234 -> 11 55551234).
  const m = d.match(/^(\d{2,4})15(\d{6,8})$/);
  if (m) d = `${m[1]}${m[2]}`;
  if (/^\d{10}$/.test(d)) {
    // 11 55551234 -> 54911 55551234
    return `+549${d}`;
  }
  return null;
}

export function generar_codigo_vincular(random6: () => string = por_defecto): string {
  const c = random6();
  if (!/^\d{6}$/.test(c)) throw new Error("random debe dar 6 digitos");
  return c;
}

function por_defecto(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export interface CodigoPendiente {
  readonly codigoHash: string;
  readonly expiraEn: number;
  readonly usado: boolean;
  readonly numeroRegistrado: string;
}

export type VerificarVincular =
  | { readonly ok: true; readonly numero: string }
  | { readonly ok: false; readonly motivo: "codigo_invalido" | "vencido" | "usado" | "numero_distinto" | "formato" };

export function parsear_vincular(texto: string): string | null {
  const m = texto.trim().toUpperCase().match(/^VINCULAR\s+(\d{6})$/);
  return m ? m[1]! : null;
}

// Compara el remitente real contra el número registrado + estado del código.
// El hash lo calcula el adaptador (evita traer crypto al núcleo).
export function verificar_vincular(opts: {
  textoEntrante: string;
  remitenteE164: string;
  codigoIngresadoHash: string;
  pendiente: CodigoPendiente | null;
  ahoraMs: number;
}): VerificarVincular {
  const codigo = parsear_vincular(opts.textoEntrante);
  if (!codigo) return { ok: false, motivo: "formato" };
  const p = opts.pendiente;
  if (!p) return { ok: false, motivo: "codigo_invalido" };
  if (p.usado) return { ok: false, motivo: "usado" };
  if (opts.ahoraMs > p.expiraEn) return { ok: false, motivo: "vencido" };
  // B1.2/B1.5: si el remitente no coincide con el ingresado, falla sin
  // revelar a qué comercio correspondía el código.
  if (p.numeroRegistrado !== opts.remitenteE164) return { ok: false, motivo: "numero_distinto" };
  if (p.codigoHash !== opts.codigoIngresadoHash) return { ok: false, motivo: "codigo_invalido" };
  return { ok: true, numero: opts.remitenteE164 };
}
