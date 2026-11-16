import { PERMISOS_EMPLEADO_DEFAULT } from "../auth/modelo.js";
import { normalizarEmail } from "../auth/oidc.js";
import {
  LIMITE_USUARIOS_POR_PLAN,
  crearInvitacion,
  reenviarInvitacion,
  type RegistroInvitacion,
} from "./invitaciones.js";

// P1-88: un solo comando decide cupo, el mismo email y el link.
// La ruta no puede repetir ninguna de las tres.

export type EmailInvitacion = string & { readonly __emailInvitacion: true };
export type LinkInvitacion = string & { readonly __linkInvitacion: true };
export type IntencionInvitar = "crear" | "reenviar";

export interface PedidoInvitar {
  readonly tenantId: string;
  readonly email: EmailInvitacion;
  readonly creadaPor: string;
  readonly intencion: IntencionInvitar;
  readonly origen: string;
  readonly ahora: Date;
}

export interface MiembroFoto {
  readonly email: string;
  readonly rol: "dueno" | "empleado";
}

export interface FotoInvitar {
  readonly plan: string;
  readonly miembrosActivos: number;
  readonly miembros: readonly MiembroFoto[];
  readonly pendientes: readonly RegistroInvitacion[];
}

export interface EfectoInvitacion {
  readonly insertar: RegistroInvitacion;
  readonly cancelarHashes: readonly string[];
  readonly link: LinkInvitacion;
  readonly entrega: "nueva" | "reenvio";
}

export type ResultadoInvitar =
  | { readonly tipo: "lista"; readonly efecto: EfectoInvitacion; readonly expiraAt: string }
  | { readonly tipo: "ya_pendiente"; readonly expiraAt: string }
  | { readonly tipo: "ya_miembro" }
  | { readonly tipo: "cupo_lleno"; readonly limite: number; readonly ocupados: number }
  | { readonly tipo: "nada_que_reenviar" };

export interface MiembroVista {
  readonly email: string;
  readonly rol: "dueno" | "empleado";
}

export interface InvitacionVista {
  readonly email: string;
  readonly estado: "pendiente" | "vencida";
  readonly expiraAt: string;
}

export interface VistaUsuarios {
  readonly limite: number;
  readonly ocupados: number;
  readonly miembros: readonly MiembroVista[];
  readonly invitaciones: readonly InvitacionVista[];
}

export function parseEmailInvitacion(raw: string): EmailInvitacion | null {
  if (typeof raw !== "string") return null;
  const texto = raw.trim();
  if (texto.length < 3 || texto.length > 320) return null;
  if (/\s/u.test(texto)) return null;
  const arroba = texto.indexOf("@");
  if (arroba <= 0 || arroba !== texto.lastIndexOf("@") || arroba === texto.length - 1) return null;
  const normal = normalizarEmail(texto);
  if (normal.length < 3 || normal.length > 320) return null;
  return normal as EmailInvitacion;
}

function limiteDe(plan: string): number {
  return LIMITE_USUARIOS_POR_PLAN[plan] ?? 2;
}

// P1-88: el asiento es la membership activa, el mismo corte que decidirAceptacion.
// Una invitación pendiente no ocupa cupo.
function cupoDe(foto: FotoInvitar): { limite: number; ocupados: number } {
  return { limite: limiteDe(foto.plan), ocupados: foto.miembrosActivos };
}

function esVigente(inv: RegistroInvitacion, ahora: Date): boolean {
  return inv.estado === "pendiente" && new Date(inv.expiraAt).getTime() > ahora.getTime();
}

function mismoEmail(inv: RegistroInvitacion, pedido: PedidoInvitar): boolean {
  return inv.tenantId === pedido.tenantId && normalizarEmail(inv.email) === pedido.email;
}

function linkDe(origen: string, tokenPlano: string): LinkInvitacion {
  const url = new URL("/api/auth/login", origen);
  url.searchParams.set("invitation_token", tokenPlano);
  return url.toString() as LinkInvitacion;
}

function efectoNuevo(
  registro: RegistroInvitacion,
  tokenPlano: string,
  origen: string,
  cancelarHashes: readonly string[],
  entrega: EfectoInvitacion["entrega"],
): ResultadoInvitar {
  return {
    tipo: "lista",
    expiraAt: registro.expiraAt,
    efecto: {
      insertar: registro,
      cancelarHashes,
      link: linkDe(origen, tokenPlano),
      entrega,
    },
  };
}

export function invitarEmpleado(pedido: PedidoInvitar, foto: FotoInvitar): ResultadoInvitar {
  const emails = new Set(foto.miembros.map((m) => normalizarEmail(m.email)));
  if (emails.has(pedido.email)) return { tipo: "ya_miembro" };

  const delEmail = foto.pendientes.filter((inv) => mismoEmail(inv, pedido));
  const vigentes = delEmail.filter((inv) => esVigente(inv, pedido.ahora));
  if (pedido.intencion === "crear" && vigentes.length > 0) {
    const ultima = vigentes.reduce((a, b) => (a.expiraAt >= b.expiraAt ? a : b));
    return { tipo: "ya_pendiente", expiraAt: ultima.expiraAt };
  }

  const cupo = cupoDe(foto);
  if (pedido.intencion === "crear" && cupo.ocupados >= cupo.limite) {
    return { tipo: "cupo_lleno", limite: cupo.limite, ocupados: cupo.ocupados };
  }

  if (pedido.intencion === "crear") {
    const creada = crearInvitacion({
      tenantId: pedido.tenantId,
      email: pedido.email,
      rol: "empleado",
      permisos: [...PERMISOS_EMPLEADO_DEFAULT],
      creadaPor: pedido.creadaPor,
      ahora: pedido.ahora,
    });
    const cancelarHashes = delEmail
      .filter((inv) => !esVigente(inv, pedido.ahora) && (inv.estado === "pendiente" || inv.estado === "vencida"))
      .map((inv) => inv.tokenHash);
    return efectoNuevo(creada.registro, creada.tokenPlano, pedido.origen, cancelarHashes, "nueva");
  }

  if (vigentes.length === 0) return { tipo: "nada_que_reenviar" };
  const base = vigentes.reduce((a, b) => (a.expiraAt >= b.expiraAt ? a : b));
  const reenvio = reenviarInvitacion({ invitacion: base, ahora: pedido.ahora });
  return efectoNuevo(
    reenvio.nueva,
    reenvio.tokenPlano,
    pedido.origen,
    vigentes.map((inv) => inv.tokenHash),
    "reenvio",
  );
}

export function proyectarUsuarios(foto: FotoInvitar, ahora: Date): VistaUsuarios {
  const cupo = cupoDe(foto);
  const invitaciones: InvitacionVista[] = [];
  for (const inv of foto.pendientes) {
    if (inv.estado === "aceptada" || inv.estado === "cancelada") continue;
    if (inv.estado !== "pendiente" && inv.estado !== "vencida") continue;
    invitaciones.push({
      email: inv.email,
      estado: esVigente(inv, ahora) ? "pendiente" : "vencida",
      expiraAt: inv.expiraAt,
    });
  }
  return {
    limite: cupo.limite,
    ocupados: cupo.ocupados,
    miembros: foto.miembros.map((m) => ({ email: normalizarEmail(m.email), rol: m.rol })),
    invitaciones,
  };
}
