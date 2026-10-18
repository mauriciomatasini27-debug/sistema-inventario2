import { describe, expect, it } from "vitest";
import { extraer_campos } from "../src/modules/ocr/motor.js";

interface CasoOcr {
  readonly id: string;
  readonly texto: string;
  // Ground truth: lo que lee un humano, no la salida actual del motor.
  readonly esperado: { cuit: string | null; fecha: string | null; total: string | null };
}

const CORPUS: readonly CasoOcr[] = [
  {
    id: "factura-c-etiquetada",
    texto: "FACTURA C\nCUIT: 20-93333172-6\nFecha: 10/10/2026\nTotal: $ 164.800,00",
    esperado: { cuit: "20933331726", fecha: "10/10/2026", total: "164.800,00" },
  },
  {
    id: "ocr-una-linea",
    texto: "CUIT 20-93333172-6 10/10/2026 Total $ 1.000,00",
    esperado: { cuit: "20933331726", fecha: "10/10/2026", total: "1.000,00" },
  },
  {
    id: "importe-total",
    texto: "Factura del 05/01/2026\nProveedor XX\nCUIT 30-71234567-1\nIMPORTE TOTAL $ 23.500,00",
    esperado: { cuit: "30712345671", fecha: "05/01/2026", total: "23.500,00" },
  },
  {
    id: "email-sin-cuit",
    texto: "hola te paso la factura, total $ 1.000,00",
    esperado: { cuit: null, fecha: null, total: "1.000,00" },
  },
  {
    id: "fecha-sin-monto",
    texto: "Fecha 10/10/2026 sin monto",
    esperado: { cuit: null, fecha: "10/10/2026", total: null },
  },
  {
    id: "cuit-solo",
    texto: "CUIT 20-93333172-6",
    esperado: { cuit: "20933331726", fecha: null, total: null },
  },
  {
    id: "fecha-con-guiones",
    texto: "Fecha 10-10-2026",
    esperado: { cuit: null, fecha: null, total: null },
  },
  {
    id: "fecha-iso",
    texto: "Fecha 2026-10-10",
    esperado: { cuit: null, fecha: null, total: null },
  },
  {
    id: "varios-montos",
    texto: "Subtotal $ 100,00\nIVA $ 21,00\nTotal $ 121,00",
    esperado: { cuit: null, fecha: null, total: "121,00" },
  },
  {
    id: "cuit-con-espacios",
    texto: "C U I T  2 0 - 9 3 3 3 3 1 7 2 - 6",
    esperado: { cuit: "20933331726", fecha: null, total: null },
  },
];

describe("benchmark OCR determinista (ADR-0005 / OCR1-S3)", () => {
  it("mide exactitud por campo y global contra ground truth", () => {
    const campos = ["cuit", "fecha", "total"] as const;
    const porCampo: Record<(typeof campos)[number], { ok: number }> = {
      cuit: { ok: 0 },
      fecha: { ok: 0 },
      total: { ok: 0 },
    };
    let aciertosTotal = 0;

    console.log("| caso | cuit | fecha | total |");
    for (const caso of CORPUS) {
      const { campos: out } = extraer_campos({ ocrTexto: caso.texto });
      const obtenido = {
        cuit: out.cuitTexto,
        fecha: out.fechaTexto,
        total: out.totalTexto,
      };
      const marcas: string[] = [];
      for (const campo of campos) {
        const ok = obtenido[campo] === caso.esperado[campo];
        if (ok) {
          porCampo[campo].ok += 1;
          aciertosTotal += 1;
        }
        marcas.push(ok ? "OK" : `X(${obtenido[campo] ?? "null"})`);
      }
      console.log(`| ${caso.id} | ${marcas[0]} | ${marcas[1]} | ${marcas[2]} |`);
    }

    const total = CORPUS.length;
    for (const campo of campos) {
      console.log(`exactitud ${campo}: ${porCampo[campo].ok}/${total} = ${(porCampo[campo].ok / total).toFixed(4)}`);
    }
    const global = aciertosTotal / (total * campos.length);
    console.log(`exactitud global: ${aciertosTotal}/${total * campos.length} = ${global.toFixed(4)}`);

    expect(global).toBeGreaterThanOrEqual(0.8);
  });
});
