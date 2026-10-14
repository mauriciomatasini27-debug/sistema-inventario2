import { gateJob } from "./tenant-context.js";
import { conTenant } from "./tenant-mode.js";
import { BaseNoDisponible } from "./server-db.js";
import { jsonError } from "./control.js";

// Por qué helper compartido: los seis jobs repetían gate + contexto + 503;
// el fan-out recorre cada comercio en su conTenant y resume por tenant (SEC4-S2).
export async function correrJob(
  request: Request,
  cuerpo: (tenantId: string) => Promise<Response>,
  opciones?: { fanOut?: boolean },
): Promise<Response> {
  const g = gateJob(request);
  if (!g) return Response.json({ error: "no autorizado" }, { status: 403 });
  if (!g.ok) return g.respuesta;
  if ("tenantIds" in g) {
    if (opciones?.fanOut === false) {
      return jsonError("No tenés permiso para ver este comercio.", 403);
    }
    const resultados: Array<{ tenant_id: string; status: number; cuerpo: unknown }> = [];
    for (const id of g.tenantIds) {
      try {
        const r = await conTenant(id, () => cuerpo(id));
        resultados.push({ tenant_id: id, status: r.status, cuerpo: (await r.json()) as unknown });
      } catch (e) {
        if (e instanceof BaseNoDisponible) {
          resultados.push({ tenant_id: id, status: 503, cuerpo: { error: "base_no_disponible" } });
        } else {
          resultados.push({ tenant_id: id, status: 500, cuerpo: { error: "error_interno" } });
        }
      }
    }
    return Response.json({
      fan_out: true,
      total: resultados.length,
      fallidos: resultados.filter((r) => r.status >= 500).length,
      resultados,
    });
  }
  try {
    return await conTenant(g.tenantId, () => cuerpo(g.tenantId));
  } catch (e) {
    if (e instanceof BaseNoDisponible) return Response.json({ error: "base_no_disponible" }, { status: 503 });
    throw e;
  }
}
