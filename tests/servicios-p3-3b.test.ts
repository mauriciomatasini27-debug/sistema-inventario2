import { describe, expect, it } from "vitest";
import {
  es_posible_duplicado,
  resumen_consumos,
  sugerir_vinculo_egreso,
  type FacturaServicio,
} from "../src/modules/utilities/facturas_servicios.js";
import { crear_motor_fake, extraer_campos, resolver_extraccion } from "../src/modules/ocr/motor.js";

function facturaBase(over: Partial<FacturaServicio> = {}): FacturaServicio {
  return {
    id: "f-" + Math.random().toString(36).slice(2),
    accountId: "c-luz",
    messageId: "m-" + Math.random().toString(36).slice(2),
    periodo: "2026-10",
    vencimiento: "2026-10-20",
    montoCentavos: 4_800_000n,
    estado: "pendiente",
    necesitaRevision: false,
    origen: "pdf_digital",
    confianzaMonto: "alta",
    confianzaVencimiento: "alta",
    ...over,
  };
}

describe("P3-3b CS9.4 posible duplicado (misma cuenta + monto + vto ±5d)", () => {
  it("misma cuenta, mismo monto, vencimiento a 3 días => posible duplicado", () => {
    const candidata = facturaBase({ vencimiento: "2026-10-23" });
    const existentes = [facturaBase({ vencimiento: "2026-10-20" })];
    expect(es_posible_duplicado(candidata, existentes)).toBe(true);
  });

  it("misma cuenta y monto pero período distinto (±5d no) => no duplica", () => {
    const candidata = facturaBase({ vencimiento: "2026-11-20" });
    const existentes = [facturaBase({ vencimiento: "2026-10-20" })];
    expect(es_posible_duplicado(candidata, existentes)).toBe(false);
  });

  it("distinta cuenta o distinto monto => no duplica", () => {
    const candidata = facturaBase({ accountId: "c-gas" });
    expect(es_posible_duplicado(candidata, [facturaBase()])).toBe(false);
    const otroMonto = facturaBase({ montoCentavos: 9_999_999n });
    expect(es_posible_duplicado(otroMonto, [facturaBase()])).toBe(false);
    expect(es_posible_duplicado(facturaBase(), [])).toBe(false);
  });
});

describe("P3-3b CS5.6 sugerir vínculo con egreso cargado a mano", () => {
  const egresos = [
    { id: "e1", categoriaId: "luz", montoCentavos: 4_800_000n, fechaIso: "2026-10-18" },
    { id: "e2", categoriaId: "gas", montoCentavos: 4_800_000n, fechaIso: "2026-10-18" },
    { id: "e3", categoriaId: "luz", montoCentavos: 4_800_000n, fechaIso: "2026-09-01" },
  ];

  it("misma categoría, monto igual, últimos 10 días => sugiere", () => {
    const f = facturaBase({ montoCentavos: 4_800_000n });
    expect(sugerir_vinculo_egreso(f, "luz", egresos, "2026-10-20")?.id).toBe("e1");
  });

  it("monto parecido dentro del 1% => sugiere; fuera => no", () => {
    const cerca = facturaBase({ montoCentavos: 4_848_000n });
    expect(sugerir_vinculo_egreso(cerca, "luz", egresos, "2026-10-20")?.id).toBe("e1");
    const lejos = facturaBase({ montoCentavos: 5_500_000n });
    expect(sugerir_vinculo_egreso(lejos, "luz", egresos, "2026-10-20")).toBeNull();
  });

  it("otra categoría o fuera de ventana => no sugiere", () => {
    const f = facturaBase({ montoCentavos: 4_800_000n });
    expect(sugerir_vinculo_egreso(f, "gas", egresos, "2026-10-20")?.id).toBe("e2");
    expect(sugerir_vinculo_egreso(f, "luz", egresos, "2026-11-01")).toBeNull();
    expect(sugerir_vinculo_egreso(f, "agua", egresos, "2026-10-20")).toBeNull();
  });
});

describe("P3-3b CS7 núcleo: totales por cuenta y variación mes contra mes", () => {
  it("total del período por cuenta con variación contra el anterior", () => {
    const facturas = [
      facturaBase({ id: "o1", accountId: "c-luz", periodo: "2026-09", montoCentavos: 4_000_000n }),
      facturaBase({ id: "o2", accountId: "c-luz", periodo: "2026-10", montoCentavos: 4_800_000n }),
      facturaBase({ id: "o3", accountId: "c-gas", periodo: "2026-10", montoCentavos: 2_000_000n }),
    ];
    const r = resumen_consumos(facturas, "2026-10");
    expect(r.totalPeriodoCentavos).toBe(6_800_000n);
    const luz = r.porCuenta.find((x) => x.accountId === "c-luz");
    expect(luz).toMatchObject({ totalCentavos: 4_800_000n, variacionPct: 20 });
    const gas = r.porCuenta.find((x) => x.accountId === "c-gas");
    expect(gas).toMatchObject({ totalCentavos: 2_000_000n, variacionPct: null });
  });

  it("suma al centavo con varias facturas de la misma cuenta", () => {
    const facturas = [
      facturaBase({ id: "a", periodo: "2026-10", montoCentavos: 4_800_000n }),
      facturaBase({ id: "b", periodo: "2026-10", montoCentavos: 1_234_56n }),
    ];
    const r = resumen_consumos(facturas, "2026-10");
    expect(r.totalPeriodoCentavos).toBe(4_800_000n + 123_456n);
  });
});

describe("P3-3b CS4 OCR solo con el motor existente (src/modules/ocr)", () => {
  it("texto de factura de servicio: pdf primero, confianza alta", async () => {
    const pdf = "Edenor Factura Total $48.000,00 08/10/2026 CUIT 30-12345678-1";
    const r = await resolver_extraccion({
      pdfTexto: pdf,
      imagen: { bytes: new Uint8Array([1]), mimeType: "image/jpeg" },
      motor: crear_motor_fake({ texto: "otro texto", confianza: 0.9 }),
    });
    expect(r.campos.totalTexto).toBe("48.000,00");
    expect(r.campos.fechaTexto).toBe("08/10/2026");
    expect(r.confianza.total).toBe("alta");
    expect(r.usoFallbackLocal).toBe(false);
  });

  it("sin pdf usa el fake del motor con confianza media", () => {
    const e = extraer_campos({ ocrTexto: "Total $48.000,00 20/10/2026" });
    expect(e.campos.totalTexto).toBe("48.000,00");
    expect(e.confianza.total).toBe("media");
    expect(e.fuentes.total).toBe("ocr");
  });
});
