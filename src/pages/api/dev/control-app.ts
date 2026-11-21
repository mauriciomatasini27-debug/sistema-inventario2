import type { APIRoute } from "astro";
import {
  controlAppDevHabilitado,
  iniciarSesionControlApp,
  iniciarSesionInvitadoControlApp,
  fallarProvisionControlApp,
  agregarMiembrosControlApp,
  sembrarControlApp,
  TENANT_CONTROL_APP,
} from "../../../lib/control-app-dev.js";

export { TENANT_CONTROL_APP };

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  if (!controlAppDevHabilitado()) {
    return Response.json(
      {
        error: "La API de control-app está apagada.",
        hint: "Levantá la app con `control-app levantar`: exporta CONTROL_APP_DEV=1 y no corre en producción.",
      },
      { status: 404 },
    );
  }
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo no es JSON válido." }, { status: 422 });
  }
  const accion = (cuerpo as { accion?: unknown } | null)?.accion;
  if (accion === "seed") {
    const dias = (cuerpo as { vencido_hace_dias?: unknown }).vencido_hace_dias;
    const flota = (cuerpo as { flota?: unknown }).flota === true;
    return sembrarControlApp(typeof dias === "number" && Number.isInteger(dias) && dias >= 0 ? dias : undefined, flota);
  }
  if (accion === "login") {
    const rol = (cuerpo as { rol?: unknown }).rol;
    if (rol !== "duenio" && rol !== "empleado") {
      return Response.json(
        { error: "Rol inválido.", hint: "Usá `control-app login --rol duenio` o `--rol empleado`." },
        { status: 422 },
      );
    }
    return iniciarSesionControlApp(rol);
  }
  if (accion === "agregar_miembros") {
    const tenantId = (cuerpo as { tenant_id?: unknown }).tenant_id;
    const cantidad = (cuerpo as { cantidad?: unknown }).cantidad;
    if (typeof tenantId !== "string" || !tenantId) {
      return Response.json({ error: "Falta tenant_id." }, { status: 422 });
    }
    return agregarMiembrosControlApp(tenantId, Number(cantidad));
  }
  if (accion === "fallar_provision") {
    const tenantId = (cuerpo as { tenant_id?: unknown }).tenant_id;
    if (typeof tenantId !== "string" || !tenantId) {
      return Response.json({ error: "Falta tenant_id." }, { status: 422 });
    }
    return fallarProvisionControlApp(tenantId);
  }
  if (accion === "login_invitado") {
    const email = (cuerpo as { email?: unknown }).email;
    if (typeof email !== "string") {
      return Response.json({ error: "Falta el email del invitado." }, { status: 422 });
    }
    return iniciarSesionInvitadoControlApp(email);
  }
  return Response.json(
    { error: "Acción desconocida.", hint: "Acciones: seed, login, login_invitado, fallar_provision, agregar_miembros." },
    { status: 422 },
  );
};
