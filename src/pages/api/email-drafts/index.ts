import type { APIRoute } from "astro";
import { exigirDuenoDeRequest } from "../../../lib/tenant-context.js";
import { BaseNoDisponible } from "../../../lib/server-db.js";
import { listarBorradoresPendientes } from "../../../lib/repos/gmail-borradores.js";

export const prerender = false;

const SIN_CACHE = { "Cache-Control": "no-store" };

export const GET: APIRoute = async ({ request }) => {
  const dueno = exigirDuenoDeRequest(request);
  if (!dueno.ok) return dueno.respuesta;
  try {
    const borradores = await listarBorradoresPendientes(dueno.tenantId);
    return Response.json(
      {
        items: borradores.map((b) => ({
          draft_id: b.id,
          message_id: b.messageId,
          account_id: b.accountId,
          remitente_dominio: b.remitenteDominio,
          periodo: b.periodo,
          vencimiento: b.vencimiento,
          monto_centavos: b.montoCentavos === null ? null : b.montoCentavos.toString(),
          origen: b.origen,
          confianza_monto: b.confianzaMonto,
          confianza_vencimiento: b.confianzaVencimiento,
          vence_en: b.venceEn.toISOString(),
          vencido: b.vencido,
          // GGL-S10b: el Dueño ve que hay que revisar y el PNG del cuerpo.
          pide_revision: b.pideRevision,
          comprobante_cuerpo_png: b.comprobanteCuerpo?.bytes.toString("base64") ?? null,
        })),
      },
      { headers: SIN_CACHE },
    );
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      return Response.json({ error: "base_no_disponible" }, { status: 503, headers: SIN_CACHE });
    }
    throw e;
  }
};
