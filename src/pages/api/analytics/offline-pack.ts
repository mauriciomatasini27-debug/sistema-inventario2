import type { APIRoute } from "astro";
import { offlinePackSchema } from "../../../lib/validation-analytics.js";
import { calcular_rotacion } from "../../../modules/analytics/agregador.js";
import { fuente_memoria } from "../../../modules/analytics/fuente.js";
import { armar_offline_pack, estima_bytes } from "../../../modules/analytics/offline-vista.js";
import { describir_snapshot } from "../../../modules/analytics/snapshots.js";
import { recortar_para_rol, puede_ver_tablero } from "../../../modules/analytics/permisos.js";
import { resolverSesion, membershipActiva } from "../../../lib/control.js";
import type { Grant, SkuRot } from "../../../modules/analytics/tipos.js";

export const prerender = false;

// GET /api/analytics/offline-pack?alcance=7d|30d|mes — RT11 básico.
// Snapshot compacto (solo agregados) + aviso de fecha. El recorte financiero
// para Empleado ocurre en servidor.
export const GET: APIRoute = async ({ request, url }) => {
  const parsed = offlinePackSchema.safeParse({ alcance: url.searchParams.get("alcance") ?? "30d" });
  if (!parsed.success) return Response.json({ error: "alcance inválido" }, { status: 422 });
  let grant: Grant = { rol: "dueno", permisos: [] };
  const ctx = resolverSesion(request);
  if (ctx?.tenantId) {
    const m = membershipActiva(ctx.tenantId, ctx.googleSub);
    if (!m) return Response.json({ error: "No tenés permiso para ver este comercio." }, { status: 403 });
    grant =
      m.rol === "dueno"
        ? { rol: "dueno", permisos: [] }
        : { rol: "empleado", permisos: [...(m.permisos as string[])] };
  }
  if (!puede_ver_tablero(grant)) {
    return Response.json({ error: "No tenés permiso para ver la rotación." }, { status: 403 });
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const dias = parsed.data.alcance === "7d" ? 7 : 30;
  const desde = new Date(Date.parse(hoy + "T00:00:00Z") - (dias - 1) * 86400000).toISOString().slice(0, 10);
  const { movimientos, catalogo } = fuente_memoria();
  const r = calcular_rotacion({
    movimientos,
    stockInicial: new Map<SkuRot, number>(),
    catalogo,
    params: { desde, hasta: hoy, hoy, ventanaCoberturaDias: 28 },
  });
  if (!r.ok) return Response.json({ error: "ventana inválida" }, { status: 422 });
  const recortadas = recortar_para_rol(r.valor, grant);
  const snap = describir_snapshot({
    id: crypto.randomUUID(),
    desde,
    hasta: hoy,
    filas: [...recortadas] as typeof r.valor,
    origen: "offline",
    creadoEn: new Date().toISOString(),
  });
  const pack = armar_offline_pack({ alcance: parsed.data.alcance, snapshot: snap, generadoEn: snap.creadoEn });
  return Response.json(
    {
      alcance: pack.alcance,
      aviso: pack.aviso,
      generado_en: pack.generadoEn,
      bytes_estimados: estima_bytes(pack.filas.length),
      snapshot_id: pack.snapshotId,
      filas: pack.filas.length,
    },
    { status: 200 },
  );
};
