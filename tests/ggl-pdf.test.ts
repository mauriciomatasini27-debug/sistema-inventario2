import { describe, expect, it, vi } from "vitest";
import { extraerDeAdjunto } from "../src/modules/integraciones/gmail-sync.js";
import { extraer_texto_embebido_pdf } from "../src/modules/utilities/extraer-pdf-digital.js";

function pdfConTexto(texto: string): Buffer {
  const stream = `BT /F1 12 Tf 100 700 Td (${texto}) Tj ET`;
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream
endobj
xref
trailer<</Size 5/Root 1 0 R>>
startxref
0
%%EOF`;
  return Buffer.from(body, "latin1");
}

describe("GGL-PDF extracción digital", () => {
  it("el extractador local lee literales del PDF sin red", () => {
    const pdf = pdfConTexto("Total $ 12.345,00 vence 20/10/2026");
    expect(extraer_texto_embebido_pdf(pdf)).toContain("12.345,00");
  });

  it("con extractador inyectado marca origen pdf_digital y recibe los bytes del adjunto", async () => {
    const bytes = pdfConTexto("Total $ 9.999,00 vence 01/11/2026");
    const extraer = vi.fn(() => "Total $ 9.999,00 vence 01/11/2026");
    const r = await extraerDeAdjunto({
      mime: "application/pdf",
      bytes,
      cuerpo: "cuerpo ignorado si hay pdf",
      motor: null,
      extraerPdfTexto: extraer,
    });
    expect(extraer).toHaveBeenCalledTimes(1);
    expect(extraer).toHaveBeenCalledWith(bytes);
    expect(r.origen).toBe("pdf_digital");
    expect(r.montoCentavos).toBe(999_900n);
    expect(r.vencimientoIso).toBe("2026-11-01");
  });

  it("sin inyección usa texto embebido y origen pdf_digital", async () => {
    const bytes = pdfConTexto("Factura Total $ 1.500,00 vence 15/10/2026");
    const r = await extraerDeAdjunto({
      mime: "application/pdf",
      bytes,
      cuerpo: null,
      motor: null,
    });
    expect(r.origen).toBe("pdf_digital");
    expect(r.montoCentavos).toBe(150_000n);
  });
});
