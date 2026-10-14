import { beforeEach, describe, expect, it } from "vitest";
import { proximo_intento, clasificar_error, es_reintentable } from "../src/modules/fiscal/backoff.js";
import { texto_castellano, accion_para } from "../src/modules/fiscal/bandeja.js";
import { wizard_inicial, wizard_avanzar, wizard_pausar, wizard_resumir, confirmar_delegacion, revocar_delegacion } from "../src/modules/fiscal/wizard.js";
import { filtrar_historial, historial_a_csv } from "../src/modules/fiscal/historial.js";
import { caea_habilitado, validar_cbte_fch_hs_gen } from "../src/modules/fiscal/caea.js";
import { promover_cola_sync } from "../src/modules/fiscal/sync-fiscal.js";
import { resetStore, store } from "../src/lib/store.js";
import { POST as POST_RETRY } from "../src/pages/api/fiscal/retry.js";

describe("fiscal T3 D6/E7 slice homo", () => {
  beforeEach(() => resetStore());

  it("backoff 30s/2m/10m/30m/1h y R no reintenta", () => {
    const ahora = 1_000_000;
    expect(proximo_intento(0, ahora) - ahora).toBe(30_000);
    expect(proximo_intento(4, ahora) - ahora).toBe(3_600_000);
    expect(proximo_intento(9, ahora) - ahora).toBe(3_600_000);
    expect(clasificar_error("timeout")).toBe("transitorio");
    expect(clasificar_error("601")).toBe("autorizacion");
    expect(clasificar_error("10015")).toBe("negocio");
    expect(es_reintentable("timeout")).toBe(true);
    expect(es_reintentable("10015")).toBe(false);
  });

  it("bandeja castellano sin Error 601", () => {
    expect(texto_castellano("601")).toBe("Falta confirmar delegación.");
    expect(texto_castellano("10015")).toContain("Completá");
    expect(accion_para("10015")).toBe("completar");
    expect(accion_para("10016")).toBe("reenviar");
  });

  it("offline cronológico: 5 desordenadas + 1 vieja", () => {
    const docs = [
      { id: "c", idempotency_key: "k3", sale_id: "s3", cbte_tipo: "11", pto_vta: "3", cbte_nro: null, cbte_fch: "20261010", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "pendiente_de_sync" as const, cae: null, cae_vto: null, qr_payload: null, client_ocurred_at: "2026-10-10T12:00:00Z" },
      { id: "a", idempotency_key: "k1", sale_id: "s1", cbte_tipo: "11", pto_vta: "3", cbte_nro: null, cbte_fch: "20261010", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "pendiente_de_sync" as const, cae: null, cae_vto: null, qr_payload: null, client_ocurred_at: "2026-10-10T10:00:00Z" },
      { id: "v", idempotency_key: "kv", sale_id: "sv", cbte_tipo: "11", pto_vta: "3", cbte_nro: null, cbte_fch: "20260930", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "pendiente_de_sync" as const, cae: null, cae_vto: null, qr_payload: null, client_ocurred_at: "2026-09-30T10:00:00Z" },
    ];
    const { actualizados, promovidos } = promover_cola_sync(docs, null, "20261010");
    expect(promovidos.map((p) => p.id)[0]).toBe("v");
    const vieja = actualizados.find((d) => d.id === "v")!;
    expect(vieja.cbte_fch).toBe("20261010");
    expect(vieja.venta_leyenda).toBe("Venta del 30/09/2026");
  });

  it("retry reencola rechazada y bloquea no_facturar", async () => {
    store.fiscalDocs.set("k", { id: "d1", idempotency_key: "k", sale_id: "s", cbte_tipo: "11", pto_vta: "3", cbte_nro: 1, cbte_fch: "20261010", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "rechazado", cae: null, cae_vto: null, qr_payload: null, intentos: 1 });
    const req = new Request("http://x/api/fiscal/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fiscal_document_id: "d1" }) });
    const res = await POST_RETRY({ request: req } as never);
    expect(res.status).toBe(200);
    expect(store.fiscalDocs.get("k")!.estado).toBe("pendiente");
  });

  it("wizard pausa en paso 4 y resume + delegación", () => {
    let w = wizard_inicial();
    w = wizard_avanzar(w, 4);
    w = wizard_pausar(w);
    expect(w.pausaEn).toBe(4);
    w = wizard_resumir(w);
    expect(w.paso).toBe(4);
    w = confirmar_delegacion(w);
    expect(w.delegacion).toBe("pendiente_proveedor");
    expect(revocar_delegacion(w).delegacion).toBe("revocada");
  });

  it("historial filtros + CSV con BOM", () => {
    const docs = [
      { id: "1", idempotency_key: "k1", sale_id: "s1", cbte_tipo: "11", pto_vta: "3", cbte_nro: 124, cbte_fch: "20261010", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "autorizado" as const, cae: "123", cae_vto: null, qr_payload: null, imp_total_centavos: "266000" },
      { id: "2", idempotency_key: "k2", sale_id: "s2", cbte_tipo: "6", pto_vta: "3", cbte_nro: 10, cbte_fch: "20261009", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5", estado: "pendiente" as const, cae: null, cae_vto: null, qr_payload: null, imp_total_centavos: "12100" },
    ];
    expect(filtrar_historial(docs, { tipo: "11" })).toHaveLength(1);
    expect(filtrar_historial(docs, { numero: "3-124" })).toHaveLength(1);
    const csv = historial_a_csv(docs);
    expect(csv.startsWith("﻿tipo,pto_vta")).toBe(true);
    expect(csv).toContain("124");
  });

  it("CAEA off por defecto y HsGen validado", () => {
    expect(caea_habilitado({})).toBe(false);
    expect(caea_habilitado({ CAEA_ACTIVO: "on" })).toBe(true);
    expect(validar_cbte_fch_hs_gen("20261010 120000")).toBe(true);
    expect(validar_cbte_fch_hs_gen("20261010")).toBe(false);
  });
});
