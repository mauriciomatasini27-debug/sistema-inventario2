import type { APIRoute } from "astro";
import { fiscalEmitirSchema } from "../../../lib/validation.js";
import {
  buscarFiscalDocPorId,
  obtenerPuertoFiscal,
  resolverCuitFiscal,
} from "../../../lib/repos/fiscal.js";
import {
  emitir_fiscal_durable,
  rehidratar_fiscal,
  type EmisionDurable,
  type PuertoFiscalDurable,
} from "../../../lib/fiscal-emitir.js";
import {
  crear_arca_provider,
  crear_arca_provider_desde_env,
} from "../../../modules/fiscal/arca-provider.js";
import { crear_homo_fake } from "../../../modules/fiscal/homo-fake.js";
import { taDurablePara } from "../../../lib/repos/fiscal-control.js";
import {
  type FiscalProvider,
} from "../../../modules/fiscal/fiscal.js";

export const prerender = false;

// POST /api/fiscal/emitir — cáscara fina sobre emitir_fiscal_durable (G2c).
// PERS2-S8: el puerto y el doc salen del repo fiscal (DB del tenant o memoria
// en single); sin boot hook en Astro standalone el reaper corre como
// barrido previo best-effort en este camino; el scheduler periódico queda
// para el slice Control.
function resolverProvider(): FiscalProvider {
  const cfg = crear_arca_provider_desde_env(process.env);
  return cfg ? crear_arca_provider(cfg, { ta: taDurablePara(cfg) }) : crear_homo_fake();
}

function aRespuesta(salida: EmisionDurable): Response {
  const doc = salida.doc;
  switch (salida.salida) {
    case "autorizado":
      return Response.json(
        {
          fiscal_estado: "autorizado",
          doc_id: doc.id,
          cae: doc.cae,
          cae_vto: doc.cae_vto,
          cbte_nro: doc.cbte_nro,
          cbte_tipo: doc.cbte_tipo,
          pto_vta: doc.pto_vta,
        },
        { status: 200 },
      );
    case "rechazado":
      return Response.json(
        {
          error: doc.ultimo_error_codigo ?? "rechazado",
          fiscal_estado: "rechazado",
          motivo: doc.motivo_castellano,
        },
        { status: 422 },
      );
    case "pendiente-retry":
      return Response.json(
        {
          fiscal_estado: "pendiente",
          doc_id: doc.id,
          intentos: doc.intentos,
          proximo_intento: doc.proximo_intento,
          ultimo_error_codigo: doc.ultimo_error_codigo,
        },
        { status: 202 },
      );
    case "respuesta_incierta":
      return Response.json(
        {
          fiscal_estado: "respuesta_incierta",
          doc_id: doc.id,
          cbte_nro: doc.cbte_nro,
        },
        { status: 202 },
      );
    case "difiere":
      return Response.json(
        { error: "difiere", fiscal_estado: "pendiente", motivo: doc.motivo_castellano },
        { status: 409 },
      );
    case "ocupado":
      return Response.json(
        { error: "secuencia ocupada", fiscal_estado: doc.estado },
        { status: 409 },
      );
  }
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const parsed = fiscalEmitirSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  const b = parsed.data;

  const puerto: PuertoFiscalDurable = obtenerPuertoFiscal();
  const provider = resolverProvider();
  const cuit = await resolverCuitFiscal(b.cuit);
  if (cuit === null) return Response.json({ error: "sin cuit fiscal configurado" }, { status: 422 });

  try {
    await rehidratar_fiscal({ cuit, provider }, puerto);
  } catch {
    // Barrido best-effort: nunca frena la emisión pedida.
  }

  let salida: EmisionDurable;
  try {
    salida = await emitir_fiscal_durable({ docId: b.fiscal_document_id, cuit, provider }, puerto);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("inexistente")) return Response.json({ error: "documento inexistente" }, { status: 404 });
    if (msg.includes("no-facturar")) return Response.json({ error: "cerrado como no facturar" }, { status: 422 });
    if (msg.includes("no-reintentable")) {
      const doc = await buscarFiscalDocPorId(b.fiscal_document_id);
      return Response.json(
        { error: "documento ya emitido", fiscal_estado: doc?.estado ?? "desconocido" },
        { status: 409 },
      );
    }
    return Response.json({ error: "emision fiscal no disponible" }, { status: 422 });
  }
  return aRespuesta(salida);
};
