import type { APIRoute } from "astro";
import { correrJob } from "../../../lib/jobs-tenant.js";
import { listarFiscalDocs, resolverCuitFiscal } from "../../../lib/repos/fiscal.js";
import type { StoredFiscalDoc } from "../../../lib/store.js";
import type { ConsultaEsperada } from "../../../modules/fiscal/fiscal.js";
import { crear_arca_provider, crear_arca_provider_desde_env } from "../../../modules/fiscal/arca-provider.js";
import { conciliarSerieDiaria } from "../../../modules/fiscal/worker.js";

export const prerender = false;

interface SerieLocal {
  ptoVta: number;
  cbteTipo: number;
  ultimoLocal: number;
  esperadoPorNro: Map<number, ConsultaEsperada>;
}

function totalCentavos(doc: StoredFiscalDoc): bigint | null {
  if (!doc.imp_total_centavos) return null;
  try {
    return BigInt(doc.imp_total_centavos);
  } catch {
    return null;
  }
}

function seriesLocales(docs: readonly StoredFiscalDoc[]): SerieLocal[] {
  const grupos = new Map<string, SerieLocal>();
  for (const doc of docs) {
    const ptoVta = Number(doc.pto_vta);
    const cbteTipo = Number(doc.cbte_tipo || "11");
    const clave = `${ptoVta}:${cbteTipo}`;
    let serie = grupos.get(clave);
    if (!serie) {
      serie = { ptoVta, cbteTipo, ultimoLocal: 0, esperadoPorNro: new Map() };
      grupos.set(clave, serie);
    }
    if (doc.estado === "autorizado" && doc.cbte_nro != null && doc.cbte_nro > serie.ultimoLocal) {
      serie.ultimoLocal = doc.cbte_nro;
    }
    const total = totalCentavos(doc);
    if (doc.estado !== "autorizado" && doc.cbte_nro != null && total !== null) {
      serie.esperadoPorNro.set(doc.cbte_nro, {
        docTipo: Number(doc.doc_tipo || "99"),
        docNro: doc.doc_nro || "0",
        impTotalCentavos: total,
        cbteFch: doc.cbte_fch,
      });
    }
  }
  return [...grupos.values()];
}

// FE-S19: cron diario. Compara la base con FECompUltimoAutorizado y consulta el hueco.
export const POST: APIRoute = async ({ request }) => {
  return correrJob(request, async (tenantId) => {
    const cfg = crear_arca_provider_desde_env(process.env);
    if (!cfg) return Response.json({ comparado: false, motivo: "sin-certificado" });
    const cuit = await resolverCuitFiscal(undefined);
    if (cuit === null) return Response.json({ comparado: false, motivo: "sin-cuit" });
    const docs = await listarFiscalDocs(tenantId);
    const provider = crear_arca_provider(cfg);
    const series = [];
    for (const serie of seriesLocales(docs)) {
      const conciliacion = await conciliarSerieDiaria({
        ultimoLocal: serie.ultimoLocal,
        cbteTipo: serie.cbteTipo,
        ptoVta: serie.ptoVta,
        cuit: String(cuit),
        provider,
        esperadoPorNro: serie.esperadoPorNro,
      });
      series.push({ ptoVta: serie.ptoVta, cbteTipo: serie.cbteTipo, ...conciliacion });
    }
    return Response.json({ comparado: true, series });
  });
};
