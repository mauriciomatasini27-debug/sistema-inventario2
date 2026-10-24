import { describe, expect, it } from "vitest";
import { decidir_respuesta, extraer_termino } from "../src/modules/whatsapp/consulta.js";
import { puntuarMemoria } from "../src/modules/whatsapp/puntaje-memoria.js";
import type { ResolucionNombre } from "../src/lib/repos/busqueda-nombre.js";
import {
  redactarConsulta,
  redactarFicha,
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

function resolucionMemoria(cat: ReadonlyArray<ItemVivo>, texto: string): ResolucionNombre {
  const filas = puntuarMemoria(cat, extraer_termino(texto));
  const d = decidir_respuesta(filas.map((f) => ({ sku: f.sku, nombre: f.nombre, score: f.score })));
  const porSku = new Map(filas.map((f) => [f.sku, f]));
  if (d.kind === "sin_resultados") {
    return {
      kind: "sin_resultados",
      ...(d.sugerencia ? { sugerencia: { sku: d.sugerencia.sku, nombre: d.sugerencia.nombre } } : {}),
    };
  }
  if (d.kind === "precisar") return { kind: "precisar", total: d.total };
  if (d.kind === "desambiguar") {
    return {
      kind: "desambiguar",
      opciones: d.opciones.map((o) => ({ sku: o.sku, nombre: o.nombre, stock: porSku.get(o.sku)?.stock ?? 0 })),
    };
  }
  const f = porSku.get(d.sku);
  if (!f) return { kind: "sin_resultados" };
  return {
    kind: "directo",
    ficha: {
      sku: f.sku,
      nombre: f.nombre,
      stock: f.stock,
      umbral: f.umbral,
      precioCentavos: f.precioCentavos,
      ...(f.costoCentavos != null ? { costoCentavos: f.costoCentavos } : {}),
      ...(f.proveedor != null ? { proveedor: f.proveedor } : {}),
    },
  };
}

function redactarDesdeCatalogo(opts: {
  ctx: ContextoBot;
  texto: string;
  catalogo: ReadonlyArray<ItemVivo>;
  comercio: string;
}) {
  const termino = extraer_termino(opts.texto);
  return redactarConsulta({ ctx: opts.ctx, resolucion: resolucionMemoria(opts.catalogo, opts.texto), termino, comercio: opts.comercio });
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
    const r = redactarDesdeCatalogo({ ctx: CTX, texto: "cuantos alfajor tengo", catalogo: catalogo(3), comercio: "Kiosco" });
    expect(r.kind).toBe("desambiguar");
    if (r.kind !== "desambiguar") return;
    expect(r.texto).toContain("1)");
    expect(r.texto).toContain("2)");
    expect(r.texto).toContain("3)");
  });

  it("más de 5 candidatos piden precisar en vez de listar", () => {
    const d = decidir_respuesta(catalogo(8).map((c) => ({ sku: c.sku, nombre: c.nombre, score: 0.9 })));
    expect(d.kind).toBe("precisar");
    const r = redactarDesdeCatalogo({ ctx: CTX, texto: "cuantos alfajor tengo", catalogo: catalogo(8), comercio: "Kiosco" });
    expect(r.kind).toBe("respuesta");
    if (r.kind !== "respuesta") return;
    expect(r.texto).toMatch(/precis/i);
  });

  it("cero candidatos responden No lo encontré con la sugerencia más cercana", () => {
    const d = decidir_respuesta([{ sku: "m1", nombre: "Milka leche", score: 0.2 }]);
    expect(d.kind).toBe("sin_resultados");
    if (d.kind !== "sin_resultados") return;
    expect(d.sugerencia?.sku).toBe("m1");
    const cat = [{ sku: "m1", nombre: "Milka leche 100 g", stock: 6, umbral: 4, precioCentavos: 230000n }];
    const r = redactarDesdeCatalogo({ ctx: CTX, texto: "cuantos milkax tengo", catalogo: cat, comercio: "Kiosco" });
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

  it("redactarFicha responde el saldo del segundo candidato", () => {
    const ficha = cat.find((c) => c.sku === "m2")!;
    const r = redactarFicha({ ctx: CTX, ficha, comercio: "Kiosco" });
    expect(r).toContain("Milka oreo 100 g");
    expect(r).toContain("sin stock");
  });

  it("ficha desconocida no filtra datos del catálogo", () => {
    const r = redactarConsulta({
      ctx: CTX,
      resolucion: { kind: "sin_resultados" },
      termino: "zzz",
      comercio: "Kiosco",
    });
    expect(r.kind).toBe("respuesta");
    if (r.kind !== "respuesta") return;
    expect(r.texto).toMatch(/no encontr/i);
    expect(r.texto).not.toContain("Milka");
  });
});

describe("BOT2-S1 consulta exacta por código de barras", () => {
  it("el sku exacto resuelve directo con nombre, saldo, unidad y precio", () => {
    const cat: ItemVivo[] = [{ sku: "7790580100112", nombre: "Coca-Cola 500 ml", stock: 12, umbral: 6, precioCentavos: 180000n }];
    const r = redactarDesdeCatalogo({ ctx: CTX, texto: "stock 7790580100112", catalogo: cat, comercio: "Kiosco" });
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

describe("puntuarMemoria escalera", () => {
  it("jorjito resuelve por alias y milca no puntúa nombre Milka leche", () => {
    const catalogo: ItemVivo[] = [
      { sku: "j1", nombre: "Alfajor Jorgito", stock: 14, umbral: 10, precioCentavos: 90000n, alias: ["jorjito"] },
      { sku: "m1", nombre: "Milka leche", stock: 6, umbral: 4, precioCentavos: 230000n },
    ];
    expect(puntuarMemoria(catalogo, "jorjito")[0]?.sku).toBe("j1");
    const milca = puntuarMemoria(catalogo, "milca");
    expect(milca.every((r) => r.score === 0.15)).toBe(true);
    expect(milca[0]?.sku).toBe("m1");
  });
});
