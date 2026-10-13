import { describe, expect, it } from "vitest";
import { enrutar, type EntradaRouter } from "../src/modules/whatsapp/router.js";

const catalogo = [
  { sku: "j1", nombre: "Alfajor Jorgito", stock: 4, umbral: 10, proveedor: "Golosinas Sur" },
  { sku: "m1", nombre: "Milka leche 100 g", stock: 0, umbral: 4, proveedor: "Distribuidora X" },
  { sku: "c1", nombre: "Coca-Cola 500 ml", stock: 50, umbral: 10, proveedor: "Distribuidora Coca" },
];

function base(sobre: Partial<EntradaRouter> = {}): EntradaRouter {
  return {
    texto: "",
    catalogo,
    comercio: "Kiosco",
    pedidos: [],
    movs: [],
    friday: new Map(),
    sesion: null,
    ahoraMs: 1_000_000,
    ...sobre,
  };
}

describe("router wa B6/B10", () => {
  it("lista del viernes vacía y guardado sin duplicar", () => {
    const ver = enrutar(base({ texto: "lista del viernes" }));
    expect(ver.accion).toBe("viernes_ver");
    const g1 = enrutar(base({ texto: "jorgito para el viernes" }));
    expect(g1.accion).toBe("viernes_guardado");
    if (g1.accion !== "viernes_guardado") return;
    const g2 = enrutar(base({ texto: "jorgito para el viernes", friday: g1.friday }));
    expect(g2.accion).toBe("viernes_ver");
    expect(g2.accion === "viernes_ver" && g2.texto).toContain("ya estaba");
  });

  it("guardar todo sin resto junta las alertas vigentes", () => {
    const r = enrutar(base({ texto: "guardar para el viernes" }));
    expect(r.accion).toBe("viernes_guardado");
    if (r.accion !== "viernes_guardado") return;
    const ver = enrutar(base({ texto: "lista del viernes", friday: r.friday }));
    expect(ver.accion === "viernes_ver" && ver.texto).toContain("Jorgito");
    expect(ver.accion === "viernes_ver" && ver.texto).toContain("Milka");
  });

  it("qué pedí y movimientos van al día a día", () => {
    const p = enrutar(
      base({
        texto: "qué le pedí a Distribuidora X",
        pedidos: [{ id: "1", proveedor: "Distribuidora X", estado: "enviado", creadoEnMs: 999_000, totalCentavos: 10000n }],
      }),
    );
    expect(p.accion).toBe("dia_pedidos");
    const m = enrutar(
      base({
        texto: "últimos movimientos de Milka",
        movs: [{ idemKey: "k1", sku: "m1", nombre: "Milka", delta: -3, tipo: "VENTA", fechaMs: 999_000 }],
      }),
    );
    expect(m.accion).toBe("dia_movimientos");
  });

  it("ver más pagina las alertas con sesión", () => {
    const r = enrutar(base({ texto: "ver más", sesion: { paso: "alertas", contexto: { pagina: 1 } } }));
    expect(r.accion).toBe("alertas");
    if (r.accion === "alertas") expect(r.pagina).toBe(2);
  });

  it("texto normal sigue a la consulta", () => {
    expect(enrutar(base({ texto: "cuántos Milka tengo" })).accion).toBe("nada");
  });
});
