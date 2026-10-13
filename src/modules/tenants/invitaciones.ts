import { randomBytes, createHash } from "node:crypto";
import { normalizarEmail } from "../auth/oidc.js";

// Invitaciones P0, puro sin IO (AU6/AU7). La tx lógica la ejecuta el adaptador;
// acá se decide cada transición para que sea testeable sin DB ni red.
export const DIAS_VIGENCIA_INVITACION = 7;

// Por qué Básico admite 2: límite del plan validado al invitar y al aceptar
// (AU6.8). Demo hereda el mismo tope en el MVP.
export const LIMITE_USUARIOS_POR_PLAN: Record<string, number> = {
  demo: 2,
  base: 2,
  plus: 10,
};

export type EstadoInvitacion = "pendiente" | "aceptada" | "vencida" | "cancelada";

export interface RegistroInvitacion {
  tokenHash: string;
  tenantId: string;
  email: string;
  rol: "dueno" | "empleado";
  permisos: string[];
  estado: EstadoInvitacion;
  expiraAt: string;
  creadaPor?: string | undefined;
  aceptadaPor?: string | undefined;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function crearInvitacion(input: {
  tenantId: string;
  email: string;
  rol: "dueno" | "empleado";
  permisos?: string[] | undefined;
  creadaPor?: string | undefined;
  ahora?: Date | undefined;
  diasVigencia?: number | undefined;
}): { tokenPlano: string; registro: RegistroInvitacion } {
  const ahora = input.ahora ?? new Date();
  // Por qué 256 bits y guardar solo el hash: el email viaja por correo y el
  // link puede reenviarse; con la tabla sola no se acepta nada (AU6.2).
  const tokenPlano = randomBytes(32).toString("base64url");
  const dias = input.diasVigencia ?? DIAS_VIGENCIA_INVITACION;
  return {
    tokenPlano,
    registro: {
      tokenHash: hashToken(tokenPlano),
      tenantId: input.tenantId,
      email: normalizarEmail(input.email),
      rol: input.rol,
      permisos: input.permisos ?? [],
      estado: "pendiente",
      expiraAt: new Date(ahora.getTime() + dias * 24 * 3600 * 1000).toISOString(),
      creadaPor: input.creadaPor,
    },
  };
}

export type MotivoRechazoAceptacion =
  | "no_verificado"
  | "email_distinto"
  | "vencida"
  | "cancelada"
  | "usada"
  | "cupo_plan"
  | "miembro_duplicado";

export interface DecisionAceptacion {
  acepta: boolean;
  motivo?: MotivoRechazoAceptacion;
}

export function decidirAceptacion(input: {
  invitacion: RegistroInvitacion;
  emailSesion: string;
  emailVerificado: boolean;
  ahora?: Date | undefined;
  miembrosActivos: number;
  plan?: string | undefined;
  yaEsMiembro?: boolean | undefined;
}): DecisionAceptacion {
  const ahora = input.ahora ?? new Date();
  const inv = input.invitacion;
  if (inv.estado === "aceptada") return { acepta: false, motivo: "usada" };
  if (inv.estado === "cancelada") return { acepta: false, motivo: "cancelada" };
  if (inv.estado === "vencida" || new Date(inv.expiraAt).getTime() <= ahora.getTime()) {
    return { acepta: false, motivo: "vencida" };
  }
  if (!input.emailVerificado) return { acepta: false, motivo: "no_verificado" };
  // Por qué mensaje genérico en la ruta: no revelar datos del comercio (AU6.5).
  if (normalizarEmail(input.emailSesion) !== normalizarEmail(inv.email)) {
    return { acepta: false, motivo: "email_distinto" };
  }
  if (input.yaEsMiembro) return { acepta: false, motivo: "miembro_duplicado" };
  const limite = LIMITE_USUARIOS_POR_PLAN[input.plan ?? "base"] ?? 2;
  if (input.miembrosActivos >= limite) return { acepta: false, motivo: "cupo_plan" };
  return { acepta: true };
}

// Reenviar genera un token nuevo e invalida el anterior (AU6.7).
export function reenviarInvitacion(input: {
  invitacion: RegistroInvitacion;
  ahora?: Date | undefined;
  diasVigencia?: number | undefined;
}): { tokenPlano: string; anterior: RegistroInvitacion; nueva: RegistroInvitacion } {
  const creada = crearInvitacion({
    tenantId: input.invitacion.tenantId,
    email: input.invitacion.email,
    rol: input.invitacion.rol,
    permisos: input.invitacion.permisos,
    creadaPor: input.invitacion.creadaPor,
    ahora: input.ahora,
    diasVigencia: input.diasVigencia,
  });
  const anterior: RegistroInvitacion = { ...input.invitacion, estado: "cancelada" };
  return { tokenPlano: creada.tokenPlano, anterior, nueva: creada.registro };
}

export function cancelarInvitacion(inv: RegistroInvitacion): RegistroInvitacion {
  return { ...inv, estado: "cancelada" };
}

export interface RevocacionLogica {
  membershipEstado: "revocado";
  revocadoAt: string;
  revocadoPor: string;
  sesionesARevocar: number;
  botLinksARevocar: number;
  invitacionesACancelar: number;
}

// Revocación en una tx lógica (AU7.2): membership + sesiones + bot_links +
// invitaciones pendientes, todo junto o nada. El adaptador la ejecuta en una
// sola transacción de control.
export function decidirRevocacion(input: {
  esDueno: boolean;
  sesionesActivas: number;
  botLinksActivos: number;
  invitacionesPendientes: number;
  revocadoPor: string;
  ahora?: Date | undefined;
}): RevocacionLogica | { error: "dueno_no_revocable" } {
  // Por qué el Dueño no se revoca a sí mismo: dejaría el comercio sin titular
  // (AU7.6); la transferencia es P1 o por soporte.
  if (input.esDueno) return { error: "dueno_no_revocable" };
  return {
    membershipEstado: "revocado",
    revocadoAt: (input.ahora ?? new Date()).toISOString(),
    revocadoPor: input.revocadoPor,
    sesionesARevocar: input.sesionesActivas,
    botLinksARevocar: input.botLinksActivos,
    invitacionesACancelar: input.invitacionesPendientes,
  };
}
