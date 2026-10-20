import { describe, expect, it } from "vitest";
import {
  FILAS_POR_PAGINA,
  TEXTO_SIN_PRODUCTOS,
  TITULO_REPORTE,
  armar_reporte_pdf,
  totales_rotacion,
} from "../src/modules/analytics/export-pdf.js";
import { generar_reporte_pdf } from "../src/modules/analytics/export-pdf-pdfkit.js";
import { armar_csv } from "../src/modules/analytics/export.js";
import { GET as getExport } from "../src/pages/api/analytics/export.js";
import { ctx } from "./helpers/ctx.js";
import type { FilaRotacion, SkuRot } from "../src/modules/analytics/tipos.js";

const sku = (s: string) => s as SkuRot;

function fila(over: Partial<FilaRotacion> & Pick<FilaRotacion, "sku" | "nombre">): FilaRotacion {
  return {
    categoria: null,
    ubicacion: null,
    bruto: 0,
    devuelto: 0,
    neto: 0,
    diasConVenta: 7,
    diasEfectivos: 7,
    diasSinVenta: 0,
    stockInicial: 10,
    stockFinal: 5,
    stockPromedio: 8,
    rotacion: 1.5,
    ventaDiaria: 0.57,
    ventaSemanal: 4,
    ventaMensual: 17.14,
    coberturaDias: 8.77,
    vecesRepuesto: 0,
    costoCentavos: 100n,
    valorizadoCentavos: 500n,
    ingresosCentavos: 0n,
    gananciaCentavos: 0n,
    margenBp: 0,
    markupBp: 0,
    pocosDatos: false,
    motivoPocosDatos: null,
    ultimaVenta: "2026-10-07",
    archivado: false,
    esNuevo: false,
    nuncaVendido: false,
    ...over,
  };
}

const filas: ReadonlyArray<FilaRotacion> = [
  fila({ sku: sku("COCA"), nombre: "Coca-Cola 500 ml", neto: 4, ingresosCentavos: 250000n, gananciaCentavos: 80000n, rotacion: 2.5, coberturaDias: 4.2 }),
  fila({ sku: sku("PAPAS"), nombre: "Papas fritas", neto: 3, ingresosCentavos: 125050n, gananciaCentavos: 40050n, rotacion: 1.25, coberturaDias: 12 }),
  fila({ sku: sku("AGUA"), nombre: "Agua mineral", neto: 5, ingresosCentavos: 9900n, gananciaCentavos: 100n, rotacion: null, coberturaDias: null }),
];

const args = {
  filas,
  desde: "2026-10-01",
  hasta: "2026-10-07",
  comercio: "Kiosco La Esquina",
  cuit: "20-12345678-9",
  generadoEn: "2026-10-20T09:00:00Z",
  generador: "dueno@example.com",
  id: "rep-123",
} as const;

describe("armar_reporte_pdf (RT8.2)", () => {
  it("arma cabecera, período, generación AR, indicadores y fórmulas", () => {
    const reporte = armar_reporte_pdf(args);
    expect(reporte.id).toBe("rep-123");
    expect(reporte.titulo).toBe(TITULO_REPORTE);
    expect(reporte.titulo).toBe("Reporte de rotación");
    expect(reporte.comercio).toBe("Kiosco La Esquina");
    expect(reporte.cuit).toBe("20-12345678-9");
    expect(reporte.periodo).toBe("2026-10-01 a 2026-10-07");
    expect(reporte.generadoEn).toBe("20/10/2026 06:00");
    expect(reporte.generador).toBe("dueno@example.com");
    expect(reporte.totales).toEqual({
      productos: 3,
      unidadesNetas: 12,
      ingresosCentavos: 384950n,
      gananciaCentavos: 120150n,
    });
    expect(reporte.indicadores).toEqual([
      { etiqueta: "Productos", valor: "3" },
      { etiqueta: "Unidades netas", valor: "12" },
      { etiqueta: "Ingresos", valor: "$ 3.849,50" },
      { etiqueta: "Ganancia", valor: "$ 1.201,50" },
    ]);
    expect(reporte.seccionFormulas).toBe("Cómo se calculan las métricas");
    expect(reporte.formulas.map((f) => f.titulo)).toContain("Rotación");
    expect(reporte.formulas.map((f) => f.titulo)).toContain("Cobertura");
    expect(reporte.formulas.every((f) => f.texto.length > 10)).toBe(true);
    expect(reporte.paginas).toHaveLength(1);
    expect(reporte.paginas[0]?.pie).toBe("página 1 de 1");
    expect(reporte.paginas[0]?.filas[0]).toEqual({
      sku: "COCA",
      nombre: "Coca-Cola 500 ml",
      neto: "4",
      rotacion: "2,50",
      cobertura: "4,2",
      ingresos: "$ 2.500,00",
      ganancia: "$ 800,00",
    });
  });

  it("omite el CUIT cuando no está cargado", () => {
    const sinCuit = armar_reporte_pdf({ ...args, cuit: undefined });
    expect(sinCuit.cuit).toBeNull();
    const vacio = armar_reporte_pdf({ ...args, cuit: "  " });
    expect(vacio.cuit).toBeNull();
  });

  it("pagina las filas con página N de M", () => {
    const muchas = Array.from({ length: FILAS_POR_PAGINA + 1 }, (_, i) =>
      fila({ sku: sku(`S${i}`), nombre: `Producto ${i}` }),
    );
    const reporte = armar_reporte_pdf({ ...args, filas: muchas });
    expect(reporte.paginas).toHaveLength(2);
    expect(reporte.paginas.map((p) => p.pie)).toEqual(["página 1 de 2", "página 2 de 2"]);
    expect(reporte.paginas[0]?.filas).toHaveLength(FILAS_POR_PAGINA);
    expect(reporte.paginas[1]?.filas).toHaveLength(1);
  });

  it("con cero filas deja una página y el texto de vacío", () => {
    const reporte = armar_reporte_pdf({ ...args, filas: [] });
    expect(reporte.paginas).toHaveLength(1);
    expect(reporte.paginas[0]?.pie).toBe("página 1 de 1");
    expect(reporte.paginas[0]?.filas).toEqual([]);
    expect(reporte.sinProductos).toBe(true);
    expect(TEXTO_SIN_PRODUCTOS).toBe("Sin productos en el período");
  });
});

describe("RT8.6 totales compartidos con CSV", () => {
  it("los totales del PDF coinciden con la suma de las columnas del CSV", () => {
    const csv = armar_csv({ filas, desde: "2026-10-01", hasta: "2026-10-07", generadoEn: "x", generador: "dueno" });
    const lineas = csv.replace(/^\uFEFF/, "").trim().split("\n");
    const datos = lineas.slice(2);
    let neto = 0;
    let ingresos = 0n;
    let ganancia = 0n;
    for (const linea of datos) {
      const celdas = linea.split(",");
      neto += Number(celdas[4]);
      ingresos += BigInt(celdas[15] ?? "0");
      ganancia += BigInt(celdas[16] ?? "0");
    }
    const totales = totales_rotacion(filas);
    expect({ neto, ingresos, ganancia }).toEqual({
      neto: totales.unidadesNetas,
      ingresos: totales.ingresosCentavos,
      ganancia: totales.gananciaCentavos,
    });
    expect(armar_reporte_pdf(args).totales).toEqual(totales);
  });
});

describe("generar_reporte_pdf", () => {
  it("devuelve un PDF real que abre y cierra", async () => {
    const pdf = await generar_reporte_pdf(armar_reporte_pdf(args));
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.toString("latin1")).toMatch(/%%EOF\n?$/);
  });

  it("tiene tantas hojas como páginas del reporte, sin hojas en blanco", async () => {
    const largo = "Producto con un nombre muy largo que no entra en la columna";
    const muchas = Array.from({ length: FILAS_POR_PAGINA + 1 }, (_, i) => fila({ sku: sku(`SKU${i}`), nombre: largo }));
    const hojas = async (f: ReadonlyArray<FilaRotacion>) =>
      ((await generar_reporte_pdf(armar_reporte_pdf({ ...args, filas: f }))).toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;
    expect(await hojas([])).toBe(1);
    expect(await hojas(filas)).toBe(1);
    expect(await hojas(muchas)).toBe(2);
  });
});

describe("GET /api/analytics/export (RT8.2)", () => {
  it("formato=pdf responde un PDF real", async () => {
    const res = (await getExport(ctx("http://x/api/analytics/export?formato=pdf&desde=2026-10-01&hasta=2026-10-07"))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="rotacion-2026-10-01-2026-10-07.pdf"');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1")).toMatch(/%%EOF\n?$/);
  });

  it("formato=csv sigue igual", async () => {
    const res = (await getExport(ctx("http://x/api/analytics/export?formato=csv&desde=2026-10-01&hasta=2026-10-07"))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="rotacion-2026-10-01-2026-10-07.csv"');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(bytes.subarray(3).toString("utf8").startsWith("# reporte rotacion")).toBe(true);
  });
});
