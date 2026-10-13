import { describe, expect, it } from "vitest";
import { armar_matutino, calcular_matutino } from "../src/modules/email/stock-matutino.js";
import { armar_semanal, calcular_semanal } from "../src/modules/email/resumen-semanal.js";
import { armar_email_ventas, calcular_ventas, seccion_ventas } from "../src/modules/email/ventas-diarias.js";

describe("email B NE2 matutino", () => {
  const catalogo = [
    { sku: "a", nombre: "Coca 500", stock: 0, umbral: 12, proveedor: "Distri X" },
    { sku: "b", nombre: "Sprite 500", stock: 4, umbral: 6, proveedor: "Distri X" },
    { sku: "c", nombre: "Pilas AA", stock: 1, umbral: 6, proveedor: null },
  ];
  it("mismos productos para WA+email, urgentes primero", () => {
    const r = calcular_matutino(catalogo, new Set());
    expect(r.enviar).toBe(true);
    expect(r.alertas).toHaveLength(3);
    expect(r.alertas[0]?.sku).toBe("a");
    const p = armar_matutino({ nombreComercio: "Kiosco", fecha: "2026-10-10", alertas: r.alertas });
    expect(p.asunto).toContain("3 productos con stock bajo");
    expect(p.html).toContain("max-width:600px");
    expect(p.html).toContain("Armar pedido");
    expect(p.texto).toContain("Coca 500");
    // Mismo cálculo en ambos canales
    expect(p.waTexto).toContain("Coca 500");
  });

  it("sin novedades no sale nada", () => {
    const r = calcular_matutino(catalogo, new Set(["a", "b", "c"]));
    // b no es urgente (4 >= 3) y ya estaba en alerta -> se filtra; a y c son urgentes -> quedan
    expect(r.alertas.map((x) => x.sku).sort()).toEqual(["a", "c"]);
    const r2 = calcular_matutino(
      [{ sku: "b", nombre: "Sprite", stock: 4, umbral: 6, proveedor: "X" }],
      new Set(["b"]),
    );
    expect(r2.enviar).toBe(false);
  });

  it("repuesto antes del envío no aparece", () => {
    const r = calcular_matutino(
      [{ sku: "b", nombre: "Sprite", stock: 10, umbral: 6, proveedor: "X" }],
      new Set(["b"]),
    );
    expect(r.enviar).toBe(false);
  });
});

describe("email B NE3 semanal", () => {
  it("coincide top y unidades, semana sin ventas igual sale", () => {
    const c = calcular_semanal({
      ventas: [
        { sku: "a", nombre: "Coca", unidades: 10, importeCentavos: 10000n },
        { sku: "b", nombre: "Sprite", unidades: 5, importeCentavos: 5000n },
      ],
      faltantes: [{ sku: "a", nombre: "Coca", stock: 0, umbral: 12, proveedor: "Distri X" }],
    });
    expect(c.unidades).toBe(15);
    expect(c.top10[0]?.sku).toBe("a");
    const p = armar_semanal({ nombreComercio: "Kiosco", semana: "06-10/10", calculo: c });
    expect(p.html).toContain("Revisar pedido sugerido");
    expect(p.waTexto).toContain("15 u.");
    const vacio = calcular_semanal({ ventas: [], faltantes: [] });
    const pv = armar_semanal({ nombreComercio: "Kiosco", semana: "06-10/10", calculo: vacio });
    expect(pv.texto).toContain("No hay ventas registradas esta semana");
  });
});

describe("email B NE5 ventas diarias", () => {
  it("seccion integrable al cierre y email aparte sin WA", () => {
    const c = calcular_ventas(
      [
        { sku: "a", nombre: "Coca", cantidad: 2, importeCentavos: 2000n, usuario: "ana", origen: "lector" },
        { sku: "b", nombre: "Sprite", cantidad: 1, importeCentavos: 1000n, usuario: "ana", origen: "bot" },
      ],
      { tickets: 2 },
    );
    expect(c.totalCentavos).toBe(3000n);
    expect(c.ticketPromedioCentavos).toBe(1500n);
    const s = seccion_ventas(c);
    expect(s.html).toContain("Ventas del día");
    const e = armar_email_ventas({ nombreComercio: "Kiosco", fecha: "2026-10-10", calculo: c });
    expect(e.asunto).toContain("ventas 2026-10-10");
    expect(e.html).toContain("max-width:600px");
  });
});
