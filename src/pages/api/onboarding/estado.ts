import type { APIRoute } from "astro";
import { control } from "../../../lib/store.js";
import { jsonError, membershipActiva, resolverSesion } from "../../../lib/control.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { conTenant } from "../../../lib/tenant-mode.js";
import { listarProductos } from "../../../lib/repos/catalogo.js";
import { listarProveedores } from "../../../lib/repos/proveedores.js";
import { crearAlmacenProductos, crearAlmacenSuppliers } from "../../../lib/repos/_almacen.js";
import { calcularChecklist, leerOnboarding } from "../../../modules/onboarding/onboarding.js";
import { tenantDelCuestionario } from "../../../modules/onboarding/acceso-tenant.js";
import { pasos_para_rol } from "../../../modules/onboarding/tour.js";

export const prerender = false;

// P1-26: listarProductos inventa demo-sku-1 cuando el catálogo está vacío
// y el stock de slice-0 sigue cargado. Esa fila no es un producto del comercio.
function esDemoInyectado(sku: string, nombre: string, mapa: ReadonlyMap<string, unknown>): boolean {
  return sku === "demo-sku-1" && nombre === "Demo" && !mapa.has("demo-sku-1") && !mapa.has("DEMO-SKU-1");
}

async function filasProducto(): Promise<Array<{ minStock: number | null }>> {
  const mapa = crearAlmacenProductos().comoMapaSoloLectura();
  try {
    const { fichas } = await listarProductos("");
    return fichas.filter((f) => !esDemoInyectado(f.sku, f.nombre, mapa));
  } catch (e) {
    if (e instanceof BaseNoDisponible) return [...mapa.values()];
    throw e;
  }
}

async function contarProveedores(): Promise<number> {
  try {
    return (await listarProveedores()).proveedores.length;
  } catch (e) {
    if (e instanceof BaseNoDisponible) return crearAlmacenSuppliers().comoMapaSoloLectura().size;
    throw e;
  }
}

function contarInvitaciones(tenantId: string): number {
  let n = 0;
  for (const inv of control.invitations.values()) {
    if (inv.tenantId === tenantId) n += 1;
  }
  return n;
}

// P1-26: /api/onboarding no está en PREFIJOS_DATOS, así que el middleware
// no fija el comercio. TB-165 [tenant]: el comercio lo fija la sesión; el
// query es sólo un atajo cuando coincide con el autorizado.
async function conteosDelComercio(tenantId: string) {
  return conTenant(tenantId, async () => {
    const filas = await filasProducto();
    return {
      productos: filas.length,
      productosConUmbral: filas.filter((f) => f.minStock !== null).length,
      proveedores: await contarProveedores(),
      invitaciones: contarInvitaciones(tenantId),
    };
  });
}

export const GET: APIRoute = async ({ request }) => {
  const ctx = resolverSesion(request);
  if (!ctx) return jsonError("Iniciá sesión con Google para continuar.", 403);
  const url = new URL(request.url);
  const autorizado = tenantDelCuestionario(
    request.headers.get("X-Tenant-Id") ?? ctx.tenantId ?? "",
    url.searchParams.get("tenant_id"),
  );
  // TB-165 [tenant]: sin sesión con comercio, o con un query de otro comercio,
  // se niega sin revelar si ese comercio existe.
  if (!autorizado.ok) return jsonError("No tenés permiso en este comercio.", 403);
  const tenantId = autorizado.tenantId;
  const m = membershipActiva(tenantId, ctx.googleSub);
  if (!m) return jsonError("No tenés permiso en este comercio.", 403);
  const estado = leerOnboarding(ctx.googleSub, tenantId);
  const pasos = pasos_para_rol(m.rol, m.permisos);
  const tenant = control.tenants.get(tenantId);
  const whatsappVerificado = [...control.botLinks.values()].some(
    (l) => l.tenantId === tenantId && l.googleSub === ctx.googleSub && l.estado === "verificado",
  );
  const conteos = await conteosDelComercio(tenantId);
  const checklist = calcularChecklist(estado, {
    ...conteos,
    whatsappVerificado,
  });
  const ejemplo = [...control.ejemplos.values()].find((e) => e.tenantRealId === tenantId) ?? null;
  // TB-165: el cuestionario no re-pregunta estos datos; los expone completos.
  const numeroWhatsapp = [...control.vincularCodes.values()].find(
    (c) => c.tenantId === tenantId && c.googleSub === ctx.googleSub,
  )?.numeroRegistrado ?? null;
  return Response.json({
    comercio: tenant
      ? {
          nombre: tenant.nombreComercio,
          estado: tenant.estado,
          plan: tenant.plan,
          rubro: tenant.rubro ?? null,
          whatsapp: numeroWhatsapp,
        }
      : null,
    dueno: { nombre: control.users.get(ctx.googleSub)?.nombre ?? null },
    whatsapp: { verificado: whatsappVerificado },
    tour: { version: estado.tourVersion, ultimo_paso: estado.tourUltimoPaso, estado: estado.tourEstado, pasos },
    checklist: { listos: checklist.listos, total: checklist.total, pasos: checklist.pasos, oculta: checklist.oculta },
    video: { visto: estado.videoVisto, progreso: estado.videoProgreso },
    ejemplo: ejemplo ? { activo: true, tenant_demo_id: ejemplo.tenantDemoId, banda: "Estás viendo datos de ejemplo" } : { activo: false },
  });
};
