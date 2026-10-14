// Historial inmutable + CSV (FE-S25/FE13, ADR-0018). Puro.
// Autorizados inmutables; filtros fecha/tipo/estado/receptor/importe/número.
// Conservación ≥10 años [a verificar contador].
import type { StoredFiscalDoc } from "../../lib/store.js";

export interface FiltroHistorial {
  readonly numero?: string | undefined;
  readonly desde?: string | undefined;
  readonly hasta?: string | undefined;
  readonly tipo?: string | undefined;
  readonly estado?: string | undefined;
  readonly receptor?: string | undefined;
  readonly importeMin?: bigint | undefined;
  readonly importeMax?: bigint | undefined;
}

export function filtrar_historial(docs: ReadonlyArray<StoredFiscalDoc>, f: FiltroHistorial): StoredFiscalDoc[] {
  return docs.filter((d) => {
    if (f.numero && `${d.pto_vta}-${d.cbte_nro ?? ""}` !== f.numero && d.idempotency_key !== f.numero) return false;
    if (f.tipo && d.cbte_tipo !== f.tipo) return false;
    if (f.estado && d.estado !== f.estado) return false;
    if (f.receptor && d.doc_nro !== f.receptor) return false;
    if (f.desde && d.cbte_fch < f.desde) return false;
    if (f.hasta && d.cbte_fch > f.hasta) return false;
    if (f.importeMin !== undefined || f.importeMax !== undefined) {
      const imp = BigInt(d.imp_total_centavos ?? "0");
      if (f.importeMin !== undefined && imp < f.importeMin) return false;
      if (f.importeMax !== undefined && imp > f.importeMax) return false;
    }
    return true;
  });
}

function escCsv(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function historial_a_csv(docs: ReadonlyArray<StoredFiscalDoc>): string {
  const head = "tipo,pto_vta,nro,fecha,doc_tipo,doc_nro,total_centavos,cae,estado";
  const filas = docs.map((d) =>
    [d.cbte_tipo, d.pto_vta, String(d.cbte_nro ?? ""), d.cbte_fch, d.doc_tipo, d.doc_nro, d.imp_total_centavos ?? "", d.cae ?? "", d.estado]
      .map(escCsv)
      .join(","),
  );
  return `﻿${[head, ...filas].join("\n")}\n`;
}
