import { describe, expect, it } from "vitest";
import {
  construirResumen,
  diaSemanaDeFecha,
  mesDeFecha,
  ultimos12Meses,
  type DatosResumen,
} from "../src/lib/panel-resumen.js";
import { parseFechaAR, type FechaAR } from "../src/lib/fecha-ar.js";

const AHORA = new Date("2026-10-17T12:00:00Z");

function fecha(s: string): FechaAR {
  const v = parseFechaAR(s);
  if (v === null) throw new Error(`fecha inválida en test: ${s}`);
  return v;
}

const DATOS: DatosResumen = {
  ventas: [
    { saleId: "v1", medio: "Efectivo", totalCentavos: 10_000n, ocurridoEn: new Date("2026-10-17T13:00:00Z") },
    { saleId: "v2", medio: "Debito", totalCentavos: 5_000n, ocurridoEn: new Date("2026-10-16T20:00:00Z") },
    { saleId: "v3", medio: "Efectivo", totalCentavos: 2_000n, ocurridoEn: new Date("2026-09-05T12:00:00Z") },
    { saleId: "v4", medio: "Efectivo", totalCentavos: 9_999n, ocurridoEn: new Date("2025-09-05T12:00:00Z") },
    { saleId: "v5", medio: "Efectivo", totalCentavos: 777n, ocurridoEn: new Date("2026-10-17T02:00:00Z") },
  ],
  devoluciones: [],
  correcciones: [],
  productos: [
    { stockActual: 1, minStock: 5 },
    { stockActual: 10, minStock: 5 },
    { stockActual: 0, minStock: null },
  ],
  turnos: [
    { fecha: fecha("2026-10-17"), turno: "tarde", entregadoPor: "ana", estado: "pendiente", creadoEn: new Date("2026-10-17T15:00:00Z") },
    { fecha: fecha("2026-10-17"), turno: "mañana", entregadoPor: "leo", estado: "conciliado", creadoEn: new Date("2026-10-17T11:00:00Z") },
    { fecha: fecha("2026-10-16"), turno: "noche", entregadoPor: "sol", estado: "conciliado", creadoEn: new Date("2026-10-16T23:00:00Z") },
  ],
};

describe("panel-resumen: agregados del panel en hora de Buenos Aires", () => {
  it("ultimos12Meses termina en el mes AR actual y cubre un año", () => {
    const meses = ultimos12Meses(AHORA);
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe("2025-11");
    expect(meses[11]).toBe("2026-10");
  });

  it("mesDeFecha y diaSemanaDeFecha derivan del calendario AR", () => {
    expect(mesDeFecha(fecha("2026-10-17"))).toBe("2026-10");
    expect(diaSemanaDeFecha(fecha("2026-10-17"))).toBe(6);
    expect(diaSemanaDeFecha(fecha("2026-10-16"))).toBe(5);
  });

  it("cuenta tickets de hoy con el corte AR, no UTC", () => {
    const r = construirResumen(AHORA, DATOS);
    // 2026-10-17T02:00Z es 2026-10-16 23:00 en Buenos Aires: no es hoy.
    expect(r.tickets_hoy).toBe(1);
  });

  it("cuenta stock bajo solo con min_stock definido", () => {
    const r = construirResumen(AHORA, DATOS);
    expect(r.stock_bajo).toBe(1);
  });

  it("suma el mes AR actual y arma 12 buckets efectivo/digital", () => {
    const r = construirResumen(AHORA, DATOS);
    expect(r.ventas_mes_centavos).toBe("15777");
    expect(r.ventas_por_mes).toHaveLength(12);
    const oct = r.ventas_por_mes.find((m) => m.mes === "2026-10");
    expect(oct).toEqual({ mes: "2026-10", efectivo_centavos: "10777", digital_centavos: "5000" });
    const sep = r.ventas_por_mes.find((m) => m.mes === "2026-09");
    expect(sep).toEqual({ mes: "2026-09", efectivo_centavos: "2000", digital_centavos: "0" });
    expect(r.ventas_por_mes[0]).toEqual({ mes: "2025-11", efectivo_centavos: "0", digital_centavos: "0" });
  });

  it("excluye ventas fuera de los últimos 12 meses", () => {
    const r = construirResumen(AHORA, DATOS);
    expect(r.ventas_por_mes.some((m) => m.mes === "2025-09")).toBe(false);
  });

  it("agrupa por medio del mes actual, de mayor a menor", () => {
    const r = construirResumen(AHORA, DATOS);
    expect(r.por_medio).toEqual([
      { medio: "Efectivo", centavos: "10777" },
      { medio: "Debito", centavos: "5000" },
    ]);
  });

  it("arma el heatmap de 28 días por día y hora AR", () => {
    const r = construirResumen(AHORA, DATOS);
    expect(r.heatmap.reduce((a, b) => a + b.tickets, 0)).toBe(3);
    expect(r.heatmap).toContainEqual({ dia_semana: 6, hora: 10, tickets: 1 });
    expect(r.heatmap).toContainEqual({ dia_semana: 5, hora: 17, tickets: 1 });
    expect(r.heatmap).toContainEqual({ dia_semana: 5, hora: 23, tickets: 1 });
  });

  it("lista solo los turnos de hoy con hora AR y marca los sin hora", () => {
    const datos: DatosResumen = {
      ...DATOS,
      turnos: [...DATOS.turnos, { fecha: fecha("2026-10-17"), turno: "extra", entregadoPor: "sin-hora", estado: "pendiente", creadoEn: null }],
    };
    const r = construirResumen(AHORA, datos);
    expect(r.turnos).toHaveLength(3);
    expect(r.turnos.every((t) => t.turno !== "noche")).toBe(true);
    expect(r.turnos[0]).toEqual({ hora: "12:00", turno: "tarde", entregado_por: "ana", estado: "pendiente" });
    expect(r.turnos.find((t) => t.turno === "extra")?.hora).toBe("—");
  });
});

const OCT = (dia: number): Date => new Date(`2026-10-${String(dia).padStart(2, "0")}T12:00:00Z`);

describe("panel-resumen: devoluciones y correcciones netean los agregados del mes", () => {
  it("resta la devolución del mismo mes en ventas y por medio", () => {
    const r = construirResumen(AHORA, {
      ventas: [{ saleId: "s1", medio: "Efectivo", totalCentavos: 10_000n, ocurridoEn: OCT(10) }],
      devoluciones: [{ montoCentavos: 3_000n, medio: "Efectivo", ocurridoEn: OCT(12) }],
      correcciones: [],
      productos: [],
      turnos: [],
    });
    expect(r.ventas_mes_centavos).toBe("7000");
    expect(r.ventas_por_mes.find((m) => m.mes === "2026-10")).toEqual({
      mes: "2026-10",
      efectivo_centavos: "7000",
      digital_centavos: "0",
    });
    expect(r.por_medio).toEqual([{ medio: "Efectivo", centavos: "7000" }]);
  });

  it("una devolución con otro medio mueve el bucket efectivo/digital", () => {
    const r = construirResumen(AHORA, {
      ventas: [
        { saleId: "s1", medio: "Efectivo", totalCentavos: 10_000n, ocurridoEn: OCT(10) },
        { saleId: "s2", medio: "Debito", totalCentavos: 5_000n, ocurridoEn: OCT(11) },
      ],
      devoluciones: [{ montoCentavos: 3_000n, medio: "Debito", ocurridoEn: OCT(12) }],
      correcciones: [],
      productos: [],
      turnos: [],
    });
    expect(r.ventas_por_mes.find((m) => m.mes === "2026-10")).toEqual({
      mes: "2026-10",
      efectivo_centavos: "10000",
      digital_centavos: "2000",
    });
  });

  it("clampea en 0 y nunca deja un bucket negativo", () => {
    const r = construirResumen(AHORA, {
      ventas: [{ saleId: "s1", medio: "Debito", totalCentavos: 1_000n, ocurridoEn: OCT(10) }],
      devoluciones: [{ montoCentavos: 5_000n, medio: "Efectivo", ocurridoEn: OCT(12) }],
      correcciones: [],
      productos: [],
      turnos: [],
    });
    expect(r.ventas_mes_centavos).toBe("0");
    expect(r.ventas_por_mes.find((m) => m.mes === "2026-10")).toEqual({
      mes: "2026-10",
      efectivo_centavos: "0",
      digital_centavos: "1000",
    });
    expect(r.por_medio).toEqual([
      { medio: "Debito", centavos: "1000" },
      { medio: "Efectivo", centavos: "0" },
    ]);
  });

  it("una corrección Efectivo -> Mercado Pago mueve el bucket sin cambiar el total", () => {
    const r = construirResumen(AHORA, {
      ventas: [{ saleId: "s1", medio: "Efectivo", totalCentavos: 10_000n, ocurridoEn: OCT(10) }],
      devoluciones: [],
      correcciones: [{ saleId: "s1", medioNuevo: "Mercado Pago", ocurridoEn: OCT(11) }],
      productos: [],
      turnos: [],
    });
    expect(r.ventas_mes_centavos).toBe("10000");
    expect(r.ventas_por_mes.find((m) => m.mes === "2026-10")).toEqual({
      mes: "2026-10",
      efectivo_centavos: "0",
      digital_centavos: "10000",
    });
    expect(r.por_medio).toEqual([{ medio: "Mercado Pago", centavos: "10000" }]);
  });

  it("con dos correcciones gana la última por created_at", () => {
    const r = construirResumen(AHORA, {
      ventas: [{ saleId: "s1", medio: "Efectivo", totalCentavos: 10_000n, ocurridoEn: OCT(10) }],
      devoluciones: [],
      correcciones: [
        { saleId: "s1", medioNuevo: "Mercado Pago", ocurridoEn: OCT(12) },
        { saleId: "s1", medioNuevo: "Debito", ocurridoEn: OCT(11) },
      ],
      productos: [],
      turnos: [],
    });
    expect(r.por_medio).toEqual([{ medio: "Mercado Pago", centavos: "10000" }]);
  });

  it("las devoluciones no tocan tickets_hoy ni el heatmap", () => {
    const r = construirResumen(AHORA, {
      ventas: [{ saleId: "s1", medio: "Efectivo", totalCentavos: 10_000n, ocurridoEn: new Date("2026-10-17T13:00:00Z") }],
      devoluciones: [{ montoCentavos: 3_000n, medio: "Efectivo", ocurridoEn: new Date("2026-10-17T14:00:00Z") }],
      correcciones: [],
      productos: [],
      turnos: [],
    });
    expect(r.tickets_hoy).toBe(1);
    expect(r.heatmap.reduce((a, b) => a + b.tickets, 0)).toBe(1);
  });
});
