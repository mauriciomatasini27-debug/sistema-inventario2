import { describe, expect, it } from "vitest";
import type { PaymentOrder } from "../src/modules/payments/ordenes.js";
import type { FacturaServicio } from "../src/modules/utilities/facturas_servicios.js";
import { resumen_semanal_pagos, semana_lunes_domingo } from "../src/modules/pagos-tx/resumen-semanal.js";
import { diaUTC } from "../src/lib/fecha-ar.js";

// Lunes 2026-10-12 12:00 UTC. La semana es Lun 12 -> Dom 18.
const LUNES_12 = Date.UTC(2026, 9, 12, 12);

function orden(id: string, venceElMs: number, estado: PaymentOrder["estado"] = "preparada"): PaymentOrder {
  return {
    id,
    numero: `OP-${id}`,
    payeeId: "pay-1",
    tipo: "proveedor",
    concepto: `Orden ${id}`,
    montoCentavos: 1_000_00n,
    venceElMs,
    medioSugerido: "Transferencia",
    instruccion: "transferencia",
    categoria: "pago_proveedores",
    estado,
    version: 1,
    idempotencyKey: `key-${id}`,
    eventos: [],
  };
}

function factura(id: string, vencimiento: string, estado: FacturaServicio["estado"] = "pendiente"): FacturaServicio {
  return {
    id,
    accountId: "c-luz",
    messageId: `m-${id}`,
    periodo: "2026-10",
    vencimiento,
    montoCentavos: 4_800_000n,
    estado,
    necesitaRevision: false,
    origen: "pdf_digital",
    confianzaMonto: "alta",
    confianzaVencimiento: "alta",
  };
}

describe("resumen semanal de pagos L-D", () => {
  it("la ventana es lunes a domingo", () => {
    const { lunesMs, domingoMs } = semana_lunes_domingo(LUNES_12);
    expect(diaUTC(lunesMs)).toBe("2026-10-12");
    expect(diaUTC(domingoMs)).toBe("2026-10-18");
    const dom = semana_lunes_domingo(Date.UTC(2026, 9, 18, 23));
    expect(diaUTC(dom.lunesMs)).toBe("2026-10-12");
  });

  it("incluye lo que vence en la semana, excluye pagadas/canceladas/fuera", () => {
    const r = resumen_semanal_pagos(
      [
        orden("a", Date.UTC(2026, 9, 14)),
        orden("b", Date.UTC(2026, 9, 18)),
        orden("c", Date.UTC(2026, 9, 19)),
        orden("d", Date.UTC(2026, 9, 14), "pagada"),
        orden("e", Date.UTC(2026, 9, 14), "cancelada"),
      ],
      [],
      LUNES_12,
    );
    expect(r.ordenesEstaSemana.map((o) => o.id)).toEqual(["a", "b"]);
    expect(r.ordenesVencidas).toHaveLength(0);
    expect(r.lunesIso).toBe("2026-10-12");
    expect(r.domingoIso).toBe("2026-10-18");
  });

  it("vencidas van aparte aunque sean de otra semana", () => {
    const r = resumen_semanal_pagos([orden("v", Date.UTC(2026, 8, 30), "vencida")], [], LUNES_12);
    expect(r.ordenesVencidas.map((o) => o.id)).toEqual(["v"]);
    expect(r.ordenesEstaSemana).toHaveLength(0);
  });

  it("facturas: pendientes en semana sí, pagadas nunca, vencidas aparte", () => {
    const r = resumen_semanal_pagos(
      [],
      [
        factura("f1", "2026-10-15"),
        factura("f2", "2026-10-20"),
        factura("f3", "2026-10-15", "pagada"),
        factura("f4", "2026-10-01"),
      ],
      LUNES_12,
    );
    expect(r.facturasEstaSemana.map((f) => f.id)).toEqual(["f1"]);
    expect(r.facturasVencidas.map((f) => f.id)).toEqual(["f4"]);
  });

  it("total y por-día cuadran en centavos bigint", () => {
    const r = resumen_semanal_pagos(
      [orden("a", Date.UTC(2026, 9, 14)), orden("b", Date.UTC(2026, 9, 14))],
      [factura("f1", "2026-10-14")],
      LUNES_12,
    );
    expect(r.totalCentavos).toBe(1_000_00n + 1_000_00n + 4_800_000n);
    expect(r.porDia).toEqual([
      { fechaIso: "2026-10-14", cantidad: 3, totalCentavos: 1_000_00n + 1_000_00n + 4_800_000n },
    ]);
  });
});
