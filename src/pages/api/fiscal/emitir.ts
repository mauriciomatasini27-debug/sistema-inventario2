import type { APIRoute } from "astro";
import { fiscalEmitirSchema } from "../../../lib/validation.js";
import { store, type StoredFiscalDoc } from "../../../lib/store.js";
import {
  dbViva,
  leerFiscalDocPorId,
  type TenantDb,
} from "../../../lib/fiscal-db.js";
import {
  emitir_fiscal_durable,
  puertoMemoria,
  puertoPostgres,
  rehidratar_fiscal,
  type EmisionDurable,
  type PuertoFiscalDurable,
} from "../../../lib/fiscal-emitir.js";
import {
  crear_arca_provider,
  crear_arca_provider_desde_env,
} from "../../../modules/fiscal/arca-provider.js";
import { crear_homo_fake } from "../../../modules/fiscal/homo-fake.js";
import {
  validar_cuit,
  type FiscalProvider,
} from "../../../modules/fiscal/fiscal.js";
import { fiscalSettings } from "../../../db/schema-fiscal.js";

export const prerender = false;

// POST /api/fiscal/emitir — cáscara fina sobre emitir_fiscal_durable (G2c).
// DB por dbViva, provider por env (homo-fake sin vars) y cuit por body,
// fila fiscal_settings o ARCA_CUIT_PROVEEDOR. La unión cerrada se mapea
// mecánico a HTTP. Sin boot hook en Astro standalone el reaper corre como
// barrido previo best-effort en este camino; el scheduler periódico queda
// para el slice Control.
function resolverProvider(): FiscalProvider {
  const cfg = crear_arca_provider_desde_env(process.env);
  return cfg ? crear_arca_provider(cfg) : crear_homo_fake();
}

async function cuitDeSettings(db: TenantDb): Promise<string | null> {
  try {
    const filas = await db
      .select({ cuit: fiscalSettings.cuit })
      .from(fiscalSettings)
      .limit(1);
    return filas[0]?.cuit ?? null;
  } catch {
    return null;
  }
}

async function resolverCuit(
  db: TenantDb | null,
  bodyCuit: string | undefined,
): Promise<number | null> {
  const crudo =
    bodyCuit ?? (db ? await cuitDeSettings(db) : null) ?? process.env["ARCA_CUIT_PROVEEDOR"] ?? "";
  const digitos = crudo.replace(/\D/g, "");
  if (!digitos || !validar_cuit(digitos)) return null;
  return Number(digitos);
}

async function leerDocUnion(
  db: TenantDb | null,
  docId: string,
): Promise<StoredFiscalDoc | null> {
  for (const d of store.fiscalDocs.values()) {
    if (d.id === docId) return d;
  }
  if (!db) return null;
  try {
    return await leerFiscalDocPorId(db, docId);
  } catch {
    return null;
  }
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

  const db = dbViva();
  const puerto: PuertoFiscalDurable = db ? puertoPostgres(db) : puertoMemoria();
  const provider = resolverProvider();
  const cuit = await resolverCuit(db, b.cuit);
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
      const doc = await leerDocUnion(db, b.fiscal_document_id);
      return Response.json(
        { error: "documento ya emitido", fiscal_estado: doc?.estado ?? "desconocido" },
        { status: 409 },
      );
    }
    return Response.json({ error: "emision fiscal no disponible" }, { status: 422 });
  }
  return aRespuesta(salida);
};
