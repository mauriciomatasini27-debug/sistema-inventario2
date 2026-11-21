import { normalizarEmail } from "../auth/oidc.js";
import { parseEmailInvitacion } from "./invitar-empleado.js";
import { crearInvitacion, type RegistroInvitacion } from "./invitaciones.js";
import { slugDeNombre } from "./aprovisionar.js";

export const PREFIJO_OWNER_PENDIENTE = "pendiente:";

export function ownerPendienteDe(email: string): string {
  return `${PREFIJO_OWNER_PENDIENTE}${normalizarEmail(email)}`;
}

export function esOwnerPendiente(sub: string | null | undefined): sub is string {
  return typeof sub === "string" && sub.startsWith(PREFIJO_OWNER_PENDIENTE);
}

export function emailDeOwnerPendiente(sub: string | null | undefined): string | null {
  if (!esOwnerPendiente(sub)) return null;
  return sub.slice(PREFIJO_OWNER_PENDIENTE.length);
}

export function linkInvitacion(origen: string, tokenPlano: string): string {
  const url = new URL("/api/auth/login", origen);
  url.searchParams.set("invitation_token", tokenPlano);
  return url.toString();
}

export function slugUnico(nombre: string, ocupados: Iterable<string>, pedido?: string, id = ""): string {
  const base = (pedido?.trim() ? slugDeNombre(pedido) : slugDeNombre(nombre)) || "comercio";
  const tomados = new Set(ocupados);
  if (!tomados.has(base)) return base;
  const sufijo = (id || crypto.randomUUID()).slice(0, 8);
  return `${base.slice(0, 51)}-${sufijo}`;
}

export function validarAltaAdmin(body: Record<string, unknown>):
  | { ok: true; nombre: string; plan: "demo" | "base" | "plus"; moneda: "ARS"; email: string; slugPedido?: string }
  | { ok: false; error: string } {
  const nombre = typeof body["nombre_comercio"] === "string" ? body["nombre_comercio"].trim() : "";
  if (nombre.length < 3 || nombre.length > 80) {
    return { ok: false, error: "El nombre del comercio debe tener entre 3 y 80 letras." };
  }
  const plan = body["plan"];
  if (plan !== "demo" && plan !== "base" && plan !== "plus") {
    return { ok: false, error: "El plan es inválido. Usá demo, base o plus." };
  }
  const moneda = body["moneda"] ?? "ARS";
  if (moneda !== "ARS") return { ok: false, error: "La moneda tiene que ser ARS." };
  const email = typeof body["email_dueno"] === "string" ? parseEmailInvitacion(body["email_dueno"]) : null;
  if (!email) return { ok: false, error: "El email del dueño no es válido." };
  const slugPedido = typeof body["slug"] === "string" && body["slug"].trim() ? body["slug"].trim() : undefined;
  return { ok: true, nombre, plan, moneda, email, ...(slugPedido ? { slugPedido } : {}) };
}

export function armarInvitacionDueno(input: {
  tenantId: string;
  email: string;
  creadaPor: string;
  ahora?: Date;
}): { tokenPlano: string; registro: RegistroInvitacion } {
  return crearInvitacion({
    tenantId: input.tenantId,
    email: input.email,
    rol: "dueno",
    permisos: [],
    creadaPor: input.creadaPor,
    ahora: input.ahora,
  });
}
