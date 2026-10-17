import { describe, expect, it } from "vitest";
import { segmentosPorMedio, type MedioVenta } from "../src/lib/panel-dashboard.js";

const con = (medio: string, centavos: string | number): MedioVenta => ({ medio, centavos });

describe("segmentosPorMedio: composición del mes para la barra segmentada", () => {
  it("sin ventas devuelve lista vacía", () => {
    expect(segmentosPorMedio([])).toEqual([]);
    expect(segmentosPorMedio([con("Efectivo", "0")])).toEqual([]);
    expect(segmentosPorMedio([con("Efectivo", -100)])).toEqual([]);
  });

  it("un solo medio concentra el 100%", () => {
    expect(segmentosPorMedio([con("Efectivo", "12345")])).toEqual([{ medio: "Efectivo", pct: 100 }]);
  });

  it("con dos o tres medios reparte sin 'Otros' y suma 100", () => {
    expect(segmentosPorMedio([con("Efectivo", "7000"), con("Debito", "3000")])).toEqual([
      { medio: "Efectivo", pct: 70 },
      { medio: "Debito", pct: 30 },
    ]);
    const tres = segmentosPorMedio([con("Efectivo", "6000"), con("Debito", "3000"), con("Mercado Pago", "1000")]);
    expect(tres).toEqual([
      { medio: "Efectivo", pct: 60 },
      { medio: "Debito", pct: 30 },
      { medio: "Mercado Pago", pct: 10 },
    ]);
    expect(tres.reduce((a, s) => a + s.pct, 0)).toBe(100);
  });

  it("con más de tres medios deja los tres mayores y agrupa el resto en 'Otros'", () => {
    const segs = segmentosPorMedio([
      con("Efectivo", "600"),
      con("Debito", "300"),
      con("Mercado Pago", "100"),
      con("Transferencia", "100"),
    ]);
    expect(segs).toEqual([
      { medio: "Efectivo", pct: 55 },
      { medio: "Debito", pct: 27 },
      { medio: "Mercado Pago", pct: 9 },
      { medio: "Otros", pct: 9 },
    ]);
    expect(segs.reduce((a, s) => a + s.pct, 0)).toBe(100);
  });

  it("redondea con método de mayor resto sin perder enteros", () => {
    const segs = segmentosPorMedio([con("A", "1"), con("B", "1"), con("C", "1")]);
    expect(segs.reduce((a, s) => a + s.pct, 0)).toBe(100);
    expect(segs).toEqual([
      { medio: "A", pct: 34 },
      { medio: "B", pct: 33 },
      { medio: "C", pct: 33 },
    ]);
  });
});
