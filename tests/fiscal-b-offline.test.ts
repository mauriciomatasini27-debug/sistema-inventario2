import { beforeEach, describe, expect, it } from "vitest";
import { armar_pedido_b } from "../src/modules/fiscal/fiscal.js";
import { desagregar_iva, desagregar_iva_21 } from "../src/modules/fiscal/iva.js";
import { resolver_fecha, resolver_cola_sync } from "../src/modules/fiscal/fecha.js";
import { solicitar_envelope } from "../src/modules/fiscal/wsfe.js";
import { promover_cola_sync, contar_sin_facturar } from "../src/modules/fiscal/sync-fiscal.js";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import { procesar_pendiente } from "../src/modules/fiscal/worker.js";
import { POST } from "../src/pages/api/sales.js";
import { resetStore, store } from "../src/lib/store.js";

function req_venta(key: string, seq: number, over: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: 12100 }],
      medio: "Efectivo",
      device_code: "MOST-01",
      seq_local: seq,
      client_occurred_at: new Date().toISOString(),
      offline: false,
      ...over,
    }),
  });
}

describe("fiscal B + offline (FE-S12/S22)", () => {
  beforeEach(() => resetStore());

  it("desagrega 21%: neto + IVA suman el total", () => {
    const d = desagregar_iva_21(12100n)!;
    expect(d.impNetoCentavos + d.impIvaCentavos).toBe(12100n);
    expect(d.impNetoCentavos).toBe(10000n);
    expect(d.impIvaCentavos).toBe(2100n);
    expect(d.alicId).toBe(5);
    expect(desagregar_iva(0n, 5, 21, 121)).toBeNull();
  });

  it("pedido B exige neto + IVA iguales al total", () => {
    const base = { totalCentavos: 12100n, ptoVta: 3, cbteNro: 1, cbteFch: "20261010", docTipo: 99, docNro: "0", condIvaReceptor: 5 } as const;
    const ok = armar_pedido_b({ ...base, impNetoCentavos: 10000n, impIvaCentavos: 2100n, alicId: 5 });
    expect(ok?.cbteTipo).toBe(6);
    expect(ok?.alicIva[0]?.baseImpCentavos).toBe(10000n);
    expect(armar_pedido_b({ ...base, impNetoCentavos: 10000n, impIvaCentavos: 2000n, alicId: 5 })).toBeNull();
    expect(armar_pedido_b({ ...base, impNetoCentavos: 10000n, impIvaCentavos: 2100n, alicId: 99 })).toBeNull();
  });

  it("envelope B incluye ImpIVA y AlicIva, C no", () => {
    const auth = { token: "t", sign: "s", cuit: "20933331726" };
    const b = solicitar_envelope(auth, "20933331726", 3, 6, {
      concepto: 1, docTipo: 99, docNro: "0", cbteDesde: 1, cbteHasta: 1, cbteFch: "20261010",
      impTotal: "121.00", impNeto: "100.00", impIVA: "21.00", impOpEx: "0.00", impTrib: "0.00",
      monId: "PES", monCotiz: 1, condIvaReceptorId: 5,
      alicIva: [{ id: 5, baseImp: "100.00", importe: "21.00" }],
    });
    expect(b).toContain("<ImpIVA>21.00</ImpIVA>");
    expect(b).toContain("<AlicIva><Id>5</Id>");
    const c = solicitar_envelope(auth, "20933331726", 3, 11, {
      concepto: 1, docTipo: 99, docNro: "0", cbteDesde: 1, cbteHasta: 1, cbteFch: "20261010",
      impTotal: "121.00", impNeto: "121.00", monId: "PES", monCotiz: 1, condIvaReceptorId: 5,
    });
    expect(c).not.toContain("<ImpIVA>");
  });

  it("fecha offline: válida conserva venta, vieja usa hoy con leyenda", () => {
    expect(resolver_fecha("20261008", null, "20261010")).toEqual({ fch: "20261008", usaHoy: false, leyenda: null });
    const vieja = resolver_fecha("20260930", null, "20261010");
    expect(vieja.fch).toBe("20261010");
    expect(vieja.leyenda).toBe("Venta del 30/09/2026");
    const anterior = resolver_fecha("20261009", "20261010", "20261010");
    expect(anterior.usaHoy).toBe(true);
    const orden = resolver_cola_sync(
      [
        { id: "b", clientOcurredAt: "2026-10-10T12:00:00Z", ventaFch: "20261010" },
        { id: "a", clientOcurredAt: "2026-10-10T10:00:00Z", ventaFch: "20261010" },
      ],
      null,
      "20261010",
    );
    expect(orden.map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("worker autoriza B con IVA y QR tipo 6", async () => {
    const provider = crear_homo_fake();
    const d = desagregar_iva_21(12100n)!;
    const r = await procesar_pendiente({
      doc: {
        id: "b1", idempotency_key: "sale:sb:6", sale_id: "sb", cbte_tipo: "6", pto_vta: "3",
        cbte_nro: null, cbte_fch: "20261010", doc_tipo: "99", doc_nro: "0", cond_iva_receptor: "5",
        estado: "pendiente", cae: null, cae_vto: null, qr_payload: null,
        imp_iva_centavos: d.impIvaCentavos.toString(), alic_iva_id: "5",
      },
      lastNumber: 40,
      totalCentavos: 12100n,
      cuit: 20933331726,
      provider,
    });
    expect(r.doc.estado).toBe("autorizado");
    expect(r.doc.cbte_nro).toBe(41);
    const payload = JSON.parse(Buffer.from(r.doc.qr_payload!.split("?p=")[1]!, "base64").toString("utf-8")) as Record<string, unknown>;
    expect(payload["tipoCmp"]).toBe(6);
  });

  it("venta RI etapa 2 online crea pendiente B con IVA", async () => {
    const res = await POST({ request: req_venta("b-online", 21, { fiscal_emisor_condicion: "responsable_inscripto", fiscal_emisor_etapa: 2 }) } as never);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(json["fiscal_estado"]).toBe("pendiente");
    const doc = [...store.fiscalDocs.values()].at(-1)!;
    expect(doc.cbte_tipo).toBe("6");
    expect(doc.imp_iva_centavos).not.toBeNull();
  });

  it("venta offline crea pendiente_de_sync y promover la deja pendiente", async () => {
    const res = await POST({ request: req_venta("b-off", 22, { offline: true }) } as never);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(json["fiscal_estado"]).toBe("pendiente_de_sync");
    expect(contar_sin_facturar([...store.fiscalDocs.values()])).toBe(1);
    const docs = [...store.fiscalDocs.values()];
    const { actualizados, promovidos } = promover_cola_sync(docs, null, docs[0]!.cbte_fch);
    expect(promovidos).toHaveLength(1);
    expect(actualizados[0]!.estado).toBe("pendiente");
  });

  it("venta offline sobre umbral guarda en_espera_de_datos", async () => {
    const lineas = [
      { product_id: "demo-sku-1", qty: 1, precio_centavos: 500000000 },
      { product_id: "demo-sku-1", qty: 1, precio_centavos: 500000000 },
    ];
    const res = await POST({ request: req_venta("b-espera", 23, { lineas, offline: true }) } as never);
    const json = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(json["fiscal_estado"]).toBe("en_espera_de_datos");
    const doc = [...store.fiscalDocs.values()].at(-1)!;
    expect(doc.estado).toBe("en_espera_de_datos");
  });
});
