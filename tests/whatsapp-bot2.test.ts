import { describe, expect, it } from "vitest";
import { decidir_respuesta } from "../src/modules/whatsapp/consulta.js";
import {
  atender_consulta,
  atender_seleccion,
  resolver_seleccion,
  type ContextoBot,
  type ItemVivo,
} from "../src/modules/whatsapp/servicio.js";
import { RESPUESTA_NO_VINCULADO } from "../src/modules/whatsapp/resolucion.js";

const CTX: ContextoBot = { userId: "g-1", tenantId: "t-a", rol: "dueno", expiraEnMs: 60000, soloLectura: false };

function catalogo(n: number): ItemVivo[] {
  return Array.from({ length: n }, (_, i) => ({
    sku: `a${i + 1}`,
    nombre: `Alfajor variedad ${i + 1}`,
    stock: 5,
    umbral: 2,
    precioCentavos: 10000n,
  }));
}

describe("BOT2-S2 lista numerada 1-5 y selección", () => {
  it("2 a 5 candidatos devuelven lista numerada para elegir", () => {
    const d = decidir_respuesta([
      { sku: "a", nombre: "Milka leche", score: 0.9 },
      { sku: "b", nombre: "Milka oreo", score: 0.88 },
      { sku: "c", nombre: "Milka aireada", score: 0.85 },
    ]);
    expect(d.kind).toBe("desambiguar");
    if (d.kind !== "desambiguar") return;
    expect(d.opciones).toHaveLength(3);
    const r = atender_consulta({ ctx: CTX, texto: "cuantos alfajor tengo", catalogo: catalogo(3), comercio: "Kiosco" });
    expect(r.kind).toBe("desambiguar");
    if (r.kind !== "desambiguar") return;
    expect(r.texto).toContain("1)");
    expect(r.texto).toContain("2)");
    expect(r.texto).toContain("3)");
  });

  it("más de 5 candidatos piden precisar en vez de listar", () => {
    const d = decidir_respuesta(catalogo(8).map((c) => ({ sku: c.sku, nombre: c.nombre, score: 0.9 })));
    expect(d.kind).toBe("precisar");
    const r = atender_consulta({ ctx: CTX, texto: "cuantos alfajor tengo", catalogo: catalogo(8), comercio: "Kiosco" });
    expect(r.kind).toBe("respuesta");
    if (r.kind !== "respuesta") return;
    expect(r.texto).toMatch(/precis/i);
  });

  it("cero candidatos responden No lo encontré con la sugerencia más cercana", () => {
    const d = decidir_respuesta([{ sku: "m1", nombre: "Milka leche", score: 0.2 }]);
    expect(d.kind).toBe("sin_resultados");
    if (d.kind !== "sin_resultados") return;
    expect(d.sugerencia?.sku).toBe("m1");
    const r = atender_consulta({
      ctx: CTX,
      texto: "cuantos milkax tengo",
      catalogo: [{ sku: "m1", nombre: "Milka leche 100 g", stock: 6, umbral: 4, precioCentavos: 230000n }],
      comercio: "Kiosco",
    });
    expect(r.kind).toBe("respuesta");
    if (r.kind !== "respuesta") return;
    expect(r.texto).toMatch(/no encontr/i);
    expect(r.texto).toMatch(/quisiste decir/i);
    expect(r.texto).toContain("Milka leche 100 g");
  });
});

describe("BOT2-S2 elegir candidato con 1-5", () => {
  const cat: ItemVivo[] = [
    { sku: "m1", nombre: "Milka leche 100 g", stock: 6, umbral: 4, precioCentavos: 230000n },
    { sku: "m2", nombre: "Milka oreo 100 g", stock: 0, umbral: 4, precioCentavos: 230000n },
    { sku: "m3", nombre: "Milka aireada 100 g", stock: 3, umbral: 4, precioCentavos: 230000n },
  ];

  it("resolver_seleccion mapea 2 al segundo sku y rechaza fuera de rango", () => {
    expect(resolver_seleccion("2", ["m1", "m2", "m3"])).toBe("m2");
    expect(resolver_seleccion("0", ["m1", "m2"])).toBeNull();
    expect(resolver_seleccion("9", ["m1", "m2"])).toBeNull();
    expect(resolver_seleccion("hola", ["m1", "m2"])).toBeNull();
  });

  it("atender_seleccion responde el saldo del segundo candidato", () => {
    const r = atender_seleccion({ ctx: CTX, sku: "m2", catalogo: cat, comercio: "Kiosco" });
    expect(r.texto).toContain("Milka oreo 100 g");
    expect(r.texto).toContain("sin stock");
  });

  it("atender_seleccion con sku desconocido no filtra datos", () => {
    const r = atender_seleccion({ ctx: CTX, sku: "zzz", catalogo: cat, comercio: "Kiosco" });
    expect(r.texto).toMatch(/no encontr/i);
    expect(r.texto).not.toContain("Milka");
  });
});

describe("BOT2-S1 consulta exacta por código de barras", () => {
  it("el sku exacto resuelve directo con nombre, saldo, unidad y precio", () => {
    const cat: ItemVivo[] = [{ sku: "7790580100112", nombre: "Coca-Cola 500 ml", stock: 12, umbral: 6, precioCentavos: 180000n }];
    const r = atender_consulta({ ctx: CTX, texto: "stock 7790580100112", catalogo: cat, comercio: "Kiosco" });
    expect(r.kind).toBe("respuesta");
    if (r.kind !== "respuesta") return;
    expect(r.texto).toContain("Coca-Cola 500 ml");
    expect(r.texto).toContain("12 u.");
    expect(r.texto).toContain("$1800");
    expect(r.texto).toContain("[Kiosco]");
  });
});

describe("BOT2-S3 no vinculado pide el código de 6 dígitos", () => {
  it("el mensaje menciona VINCULAR y 6 dígitos sin filtrar datos", () => {
    expect(RESPUESTA_NO_VINCULADO).toContain("VINCULAR");
    expect(RESPUESTA_NO_VINCULADO).toMatch(/6 d.gitos/);
  });
});
