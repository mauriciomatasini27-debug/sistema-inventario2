// DASH-S1 (ADR-0039/0041): estado de vinculación por persona para la pantalla
// /panel/bot/config. Núcleo puro: recibe el plano de control ya leído, no hace
// IO ni conoce transporte. Nunca devuelve hash ni el número completo.
import { enmascararNumero, puedeUsarBot } from "../auth/bot.js";

export type EstadoTelefonoVinculo = "vinculado" | "pendiente" | "pausado";

export interface TelefonoVinculo {
  readonly numero_enmascarado: string;
  readonly estado: EstadoTelefonoVinculo;
  readonly expira_en?: string;
  readonly pausado_hasta?: string;
}

export interface PersonaVinculos {
  readonly google_sub: string;
  readonly nombre: string;
  readonly rol: "dueno" | "empleado";
  readonly puede_usar_bot: boolean;
  readonly opt_in: boolean;
  readonly telefonos: TelefonoVinculo[];
}

export interface MiembroFuente {
  readonly tenantId: string;
  readonly googleSub: string;
  readonly rol: "dueno" | "empleado";
  readonly estado: string;
  readonly puedeUsarBot?: boolean | undefined;
}

export interface UsuarioFuente {
  readonly googleSub: string;
  readonly email: string;
  readonly nombre?: string | undefined;
}

export interface BotLinkFuente {
  readonly numeroE164: string;
  readonly tenantId: string;
  readonly googleSub: string;
  readonly estado: string;
}

export interface CodigoVincularFuente {
  readonly numero: string;
  readonly tenantId: string;
  readonly googleSub: string;
  readonly expiraEn: number;
  readonly usado: boolean;
}

export interface PreferenciasFuente {
  readonly optIn: boolean;
  readonly pausadoHastaMs: number | null;
}

export interface EntradaVinculosPanel {
  readonly tenantId: string;
  readonly googleSub: string;
  readonly esDueno: boolean;
  readonly memberships: ReadonlyArray<MiembroFuente>;
  readonly users: ReadonlyMap<string, UsuarioFuente>;
  readonly botLinks: ReadonlyArray<BotLinkFuente>;
  readonly vincularCodes: ReadonlyArray<CodigoVincularFuente>;
  readonly waPrefs: ReadonlyMap<string, PreferenciasFuente>;
  readonly ahoraMs: number;
}

function claveVerificado(googleSub: string, numero: string): string {
  return `${googleSub}\u0000${numero}`;
}

function nombreDe(users: ReadonlyMap<string, UsuarioFuente>, googleSub: string): string {
  const u = users.get(googleSub);
  return u?.nombre?.trim() || u?.email || "Sin nombre";
}

function telefonosDe(
  input: EntradaVinculosPanel,
  googleSub: string,
  verificados: ReadonlySet<string>,
): TelefonoVinculo[] {
  const prefs = input.waPrefs.get(`${input.tenantId}:${googleSub}`);
  const telefonos: TelefonoVinculo[] = [];
  for (const l of input.botLinks) {
    if (l.tenantId !== input.tenantId || l.googleSub !== googleSub || l.estado !== "verificado") continue;
    const numero_enmascarado = enmascararNumero(l.numeroE164);
    if (prefs?.pausadoHastaMs != null && prefs.pausadoHastaMs > input.ahoraMs) {
      telefonos.push({ numero_enmascarado, estado: "pausado", pausado_hasta: new Date(prefs.pausadoHastaMs).toISOString() });
    } else {
      telefonos.push({ numero_enmascarado, estado: "vinculado" });
    }
  }
  for (const c of input.vincularCodes) {
    if (c.tenantId !== input.tenantId || c.googleSub !== googleSub) continue;
    if (c.usado || c.expiraEn < input.ahoraMs) continue;
    if (verificados.has(claveVerificado(googleSub, c.numero))) continue;
    telefonos.push({ numero_enmascarado: enmascararNumero(c.numero), estado: "pendiente", expira_en: new Date(c.expiraEn).toISOString() });
  }
  return telefonos;
}

export function armarVinculosPanel(input: EntradaVinculosPanel): PersonaVinculos[] {
  const verificados = new Set(
    input.botLinks
      .filter((l) => l.tenantId === input.tenantId && l.estado === "verificado")
      .map((l) => claveVerificado(l.googleSub, l.numeroE164)),
  );
  return input.memberships
    .filter((m) => m.tenantId === input.tenantId && m.estado === "activo" && (input.esDueno || m.googleSub === input.googleSub))
    .map((m) => ({
      google_sub: m.googleSub,
      nombre: nombreDe(input.users, m.googleSub),
      rol: m.rol,
      puede_usar_bot: puedeUsarBot({ rol: m.rol, puedeUsarBot: m.puedeUsarBot }),
      opt_in: input.waPrefs.get(`${input.tenantId}:${m.googleSub}`)?.optIn ?? false,
      telefonos: telefonosDe(input, m.googleSub, verificados),
    }))
    .sort((a, b) => (a.rol === b.rol ? a.nombre.localeCompare(b.nombre) : a.rol === "dueno" ? -1 : 1));
}
