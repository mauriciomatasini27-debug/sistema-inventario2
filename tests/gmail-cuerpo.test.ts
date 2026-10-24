import { inflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  borradorDeCuerpo,
  confianzaParaGuardar,
  leerConfianzaGuardada,
  sanearCuerpo,
} from "../src/modules/utilities/cuerpo-factura.js";

const HTML_FACTURA = [
  "<script>Total $ 9.999,00 01/01/2020</script>",
  "<form action=\"https://micuenta.edenor.com/login\">",
  "<input type=\"password\" value=\"clave-secreta-ggl-s10b\">",
  "clave-visible-login",
  "</form>",
  "<a href=\"https://micuenta.edenor.com/login\">Entrar</a>",
  "<img src=\"https://tracker.ejemplo/pixel.gif\">",
  "Total $ 2.500,00 21/10/2026",
  "https://micuenta.edenor.com/login?monto=8.888,00&vence=01/02/2020",
].join(" ");

function textosPng(png: Buffer): string[] {
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const out: string[] = [];
  let i = 8;
  while (i + 12 <= png.length) {
    const len = png.readUInt32BE(i);
    const tipo = png.subarray(i + 4, i + 8).toString("ascii");
    const data = png.subarray(i + 8, i + 8 + len);
    if (tipo === "tEXt") {
      const nul = data.indexOf(0);
      out.push(data.subarray(nul + 1).toString("latin1"));
    }
    if (tipo === "IEND") break;
    i += 12 + len;
  }
  return out;
}

function pixelesNegros(png: Buffer): number {
  let i = 8;
  const idats: Buffer[] = [];
  let width = 0;
  let height = 0;
  while (i + 12 <= png.length) {
    const len = png.readUInt32BE(i);
    const tipo = png.subarray(i + 4, i + 8).toString("ascii");
    const data = png.subarray(i + 8, i + 8 + len);
    if (tipo === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      expect(data[9]).toBe(0);
    }
    if (tipo === "IDAT") idats.push(Buffer.from(data));
    if (tipo === "IEND") break;
    i += 12 + len;
  }
  expect(width).toBeGreaterThan(8);
  expect(height).toBeGreaterThan(8);
  const raw = inflateSync(Buffer.concat(idats));
  const stride = width + 1;
  expect(raw.length).toBe(stride * height);
  let negros = 0;
  for (let y = 0; y < height; y++) {
    expect(raw[y * stride]).toBe(0);
    for (let x = 0; x < width; x++) {
      if (raw[y * stride + 1 + x] === 0) negros++;
    }
  }
  return negros;
}

describe("GGL-S10b factura en el cuerpo", () => {
  it("extrae monto y vencimiento con confianza baja y una imagen del cuerpo", () => {
    const borrador = borradorDeCuerpo("Total $ 2.500,00 21/10/2026");
    expect(borrador).toMatchObject({
      origen: "email_respaldo",
      montoCentavos: 250_000n,
      vencimientoIso: "2026-10-21",
      confianzaMonto: "baja",
      confianzaVencimiento: "baja",
      pideRevision: true,
    });
    const png = borrador?.comprobante;
    expect(png?.mime).toBe("image/png");
    expect(png?.texto).toContain("2.500,00");
    expect(png?.texto).toContain("21/10/2026");
    expect(textosPng(png?.bytes ?? Buffer.alloc(0)).join("\n")).toContain("2.500,00");
    expect(pixelesNegros(png?.bytes ?? Buffer.alloc(0))).toBeGreaterThan(20);
  });

  it("no sigue links ni abre el login: saca urls, formularios y scripts", () => {
    const llamadas: string[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      llamadas.push(String(input));
      throw new Error("no se debe pedir la red");
    }) as typeof fetch;
    try {
      const saneado = sanearCuerpo(HTML_FACTURA);
      expect(saneado.urlsDescartadas).toBeGreaterThan(0);
      expect(saneado.texto).not.toMatch(/https?:\/\//);
      expect(saneado.texto).not.toContain("micuenta.edenor.com");
      expect(saneado.texto).not.toContain("clave-secreta-ggl-s10b");
      expect(saneado.texto).not.toContain("clave-visible-login");
      expect(saneado.texto).not.toContain("9.999,00");

      const borrador = borradorDeCuerpo(HTML_FACTURA);
      expect(llamadas).toEqual([]);
      expect(borrador?.montoCentavos).toBe(250_000n);
      expect(borrador?.vencimientoIso).toBe("2026-10-21");
      expect(borrador?.confianzaMonto).toBe("baja");
      expect(borrador?.confianzaVencimiento).toBe("baja");
      expect(borrador?.pideRevision).toBe(true);
      const textoImagen = textosPng(borrador?.comprobante.bytes ?? Buffer.alloc(0)).join("\n");
      expect(textoImagen).toContain("2.500,00");
      expect(textoImagen).not.toContain("micuenta.edenor.com");
      expect(textoImagen).not.toContain("clave-secreta-ggl-s10b");
      expect(textoImagen).not.toContain("9.999,00");
      expect(borrador?.comprobante.bytes.toString("latin1")).not.toContain("clave-secreta-ggl-s10b");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("un cuerpo que solo es un link de portal no arma borrador", () => {
    const llamadas: string[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      llamadas.push(String(input));
      throw new Error("no se debe pedir la red");
    }) as typeof fetch;
    try {
      const borrador = borradorDeCuerpo(
        '<a href="https://micuenta.edenor.com/login?monto=2.500,00&vence=21/10/2026">Ver factura</a>',
      );
      expect(borrador).toBeNull();
      expect(llamadas).toEqual([]);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("la confianza guardada conserva la imagen y el pedido de revisión", () => {
    const borrador = borradorDeCuerpo("Total $ 2.500,00 21/10/2026");
    expect(borrador).not.toBeNull();
    if (!borrador) return;
    const guardada = confianzaParaGuardar({
      monto: borrador.confianzaMonto,
      vencimiento: borrador.confianzaVencimiento,
      pideRevision: borrador.pideRevision,
      comprobante: borrador.comprobante,
    });
    const leida = leerConfianzaGuardada(guardada);
    expect(leida.monto).toBe("baja");
    expect(leida.vencimiento).toBe("baja");
    expect(leida.pideRevision).toBe(true);
    expect(leida.comprobanteCuerpo?.bytes.equals(borrador.comprobante.bytes)).toBe(true);
    expect(leerConfianzaGuardada({ monto: "alta", vencimiento: "alta" })).toMatchObject({
      pideRevision: false,
      comprobanteCuerpo: null,
    });
  });

  it("el panel pide revisión y muestra el comprobante del cuerpo", () => {
    const pagina = readFileSync("src/pages/panel/consumos.astro", "utf8");
    const api = readFileSync("src/pages/api/email-drafts/index.ts", "utf8");
    expect(api).toContain("pide_revision");
    expect(api).toContain("comprobante_cuerpo_png");
    expect(pagina).toContain("pide revisión");
    expect(pagina).toContain("Revisá este borrador: la factura está en el cuerpo del correo y la confianza es baja.");
    expect(pagina).toContain('id="borrador-comprobante"');
    expect(pagina).toContain("Comprobante del cuerpo del correo");
  });
});
