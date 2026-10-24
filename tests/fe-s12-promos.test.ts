import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { crear_homo_fake } from "../src/modules/fiscal/homo-fake.js";
import {
  calcular_fes12,
  debe_encolar_factura_fes12,
  parsear_meta_fes12,
  serializar_meta_fes12,
} from "../src/modules/fiscal/iva.js";
import { procesar_pendiente } from "../src/modules/fiscal/worker.js";
import { POST } from "../src/pages/api/sales.js";
import { debe_encolar_factura_fes12 as exportPolitica } from "../src/pages/api/sales.js";
import { resetStore, store } from "../src/lib/store.js";

describe("FE-S12 promos, combos y fiado", () => {
  it("2x1 más combo: bases más IVA igualan el total cobrado", () => {
    const total = 342_000n;
    const r = calcular_fes12({
      totalCobradoCentavos: total,
      productos: [
        { etiqueta: "Alfajor", cantidad: 2, precioListaCentavos: 100_000n, alicIvaId: 5 },
      ],
      promo: { etiqueta: "Promo 2x1 Alfajor", ahorroCentavos: 100_000n },
      combo: {
        nombre: "Combo merienda",
        totalCobradoCentavos: 242_000n,
        componentes: [
          { etiqueta: "Yogur", precioListaCentavos: 121_000n, alicIvaId: 5 },
          { etiqueta: "Galleta", precioListaCentavos: 121_000n, alicIvaId: 4 },
        ],
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.desglose.impNetoCentavos + r.desglose.impIvaCentavos).toBe(total);
    expect(r.desglose.representacion.some((l) => l.tipo === "promo" && l.importeCentavos < 0n)).toBe(true);
    expect(r.desglose.representacion.some((l) => l.tipo === "combo")).toBe(true);
    expect(r.desglose.alicIva.length).toBe(2);
  });

  it("el cobro posterior de fiado no encola factura", () => {
    expect(debe_encolar_factura_fes12("cobro_fiado")).toBe(false);
    expect(debe_encolar_factura_fes12("venta_a_cuenta")).toBe(true);
    expect(debe_encolar_factura_fes12("venta_cobrada")).toBe(true);
    expect(exportPolitica("cobro_fiado")).toBe(false);
  });

  it("worker autoriza B con varias alícuotas desde venta_leyenda FE-S12", async () => {
    const total = 242_000n;
    const calc = calcular_fes12({
      totalCobradoCentavos: total,
      productos: [],
      combo: {
        nombre: "Combo",
        totalCobradoCentavos: total,
        componentes: [
          { etiqueta: "A", precioListaCentavos: 121_000n, alicIvaId: 5 },
          { etiqueta: "B", precioListaCentavos: 121_000n, alicIvaId: 4 },
        ],
      },
    });
    expect(calc.ok).toBe(true);
    if (!calc.ok) return;
    const leyenda = serializar_meta_fes12(calc.desglose);
    expect(parsear_meta_fes12(leyenda)?.impIvaCentavos).toBe(calc.desglose.impIvaCentavos);

    const provider = crear_homo_fake();
    const r = await procesar_pendiente({
      doc: {
        id: "f12-1",
        idempotency_key: "sale:f12:6",
        sale_id: "f12",
        cbte_tipo: "6",
        pto_vta: "3",
        cbte_nro: null,
        cbte_fch: "20261024",
        doc_tipo: "99",
        doc_nro: "0",
        cond_iva_receptor: "5",
        estado: "pendiente",
        cae: null,
        cae_vto: null,
        qr_payload: null,
        imp_iva_centavos: calc.desglose.impIvaCentavos.toString(),
        alic_iva_id: "multi",
        venta_leyenda: leyenda,
      },
      lastNumber: 0,
      totalCentavos: total,
      cuit: 20933331726,
      provider,
    });
    expect(r.doc.estado).toBe("autorizado");
  });
});

describe("FE-S12 POST /api/sales con fiscal_fes12", () => {
  beforeEach(() => resetStore());

  it("persiste meta FE-S12 en el doc fiscal pendiente B", async () => {
    const total = 100_000n;
    const res = await POST(
      ctx("http://localhost/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "fe-s12-post" },
        body: {
          lineas: [{ product_id: "demo-sku-1", qty: 1, precio_centavos: Number(total) }],
          medio: "Efectivo",
          device_code: "MOST-01",
          seq_local: 1,
          client_occurred_at: new Date().toISOString(),
          offline: false,
          fiscal_emisor_condicion: "responsable_inscripto",
          fiscal_emisor_etapa: 2,
          fiscal_fes12: {
            productos: [{ etiqueta: "Leche", cantidad: 2, precio_lista_centavos: 100_000, alic_iva_id: 5 }],
            promo: { etiqueta: "2x1", ahorro_centavos: 100_000 },
          },
        },
      }),
    );
    expect(res.status).toBe(201);
    const doc = [...store.fiscalDocs.values()].at(-1)!;
    expect(doc.cbte_tipo).toBe("6");
    expect(doc.venta_leyenda).toContain("fe_s12");
    expect(doc.imp_iva_centavos).not.toBeNull();
  });
});
