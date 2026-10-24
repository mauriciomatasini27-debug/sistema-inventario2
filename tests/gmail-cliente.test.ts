import { describe, expect, it } from "vitest";
import {
  ErrorGmail,
  crearClienteGmail,
  detectarMimeComprobante,
} from "../src/modules/integraciones/gmail-cliente.js";

const b64url = (s: string): string => Buffer.from(s, "utf8").toString("base64url");

function respuesta(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

describe("cliente Gmail", () => {
  it("detecta el tipo real por magic bytes y rechaza lo que no es comprobante", () => {
    expect(detectarMimeComprobante(Buffer.from("%PDF-1.7 x"))).toBe("application/pdf");
    expect(detectarMimeComprobante(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(
      detectarMimeComprobante(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image/png");
    expect(detectarMimeComprobante(Buffer.from("RIFF0000WEBP"))).toBe("image/webp");
    expect(detectarMimeComprobante(Buffer.from("0000ftypheic"))).toBe("image/heic");
    expect(detectarMimeComprobante(Buffer.from("esto no es un comprobante"))).toBeNull();
  });

  it("lee headers, cuerpo y adjuntos de un mensaje full", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.includes("/messages/msg-1?format=full")) throw new Error(`url inesperada: ${url}`);
      return respuesta({
        id: "msg-1",
        payload: {
          mimeType: "multipart/mixed",
          headers: [
            { name: "From", value: "Edenor <facturas@edenor.com>" },
            { name: "Subject", value: "Factura de luz" },
          ],
          parts: [
            {
              partId: "0",
              mimeType: "multipart/alternative",
              parts: [
                {
                  partId: "0.0",
                  mimeType: "text/plain",
                  body: { data: b64url("Total $ 1.234,00 vence 20/10/2026") },
                },
              ],
            },
            {
              partId: "1",
              mimeType: "application/pdf",
              filename: "factura.pdf",
              body: { attachmentId: "att-1", size: 1234 },
            },
          ],
        },
      });
    }) as typeof fetch;

    const gmail = crearClienteGmail({ accessToken: "token", fetchImpl });
    const mensaje = await gmail.getMessage({ id: "msg-1", format: "full" });
    expect(mensaje.from).toBe("Edenor <facturas@edenor.com>");
    expect(mensaje.subject).toBe("Factura de luz");
    expect(mensaje.bodyText).toContain("1.234,00");
    expect(mensaje.adjuntos).toEqual([
      {
        partId: "1",
        attachmentId: "att-1",
        filename: "factura.pdf",
        mimeType: "application/pdf",
        size: 1234,
      },
    ]);
  });

  it("no sigue links ni login del HTML al leer el cuerpo", async () => {
    const urls: string[] = [];
    const html = [
      "<a href=\"https://micuenta.edenor.com/login\">Entrar</a>",
      "<img src=\"https://tracker.ejemplo/pixel.gif\">",
      "<form action=\"https://micuenta.edenor.com/login\"><input type=\"password\" value=\"clave-secreta-ggl-s10b\"></form>",
      "Total $ 2.500,00 vence 21/10/2026",
      "https://micuenta.edenor.com/factura",
    ].join(" ");
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (!url.includes("/messages/msg-html?format=full")) throw new Error(`url inesperada: ${url}`);
      return respuesta({
        id: "msg-html",
        payload: {
          mimeType: "text/html",
          headers: [
            { name: "From", value: "Edenor <facturas@edenor.com>" },
            { name: "Subject", value: "Aviso" },
          ],
          body: { data: b64url(html) },
        },
      });
    }) as typeof fetch;

    const gmail = crearClienteGmail({ accessToken: "token", fetchImpl });
    const mensaje = await gmail.getMessage({ id: "msg-html", format: "full" });
    expect(urls).toEqual([expect.stringContaining("/messages/msg-html?format=full")]);
    expect(mensaje.bodyText).toContain("2.500,00");
    expect(mensaje.bodyText).not.toContain("micuenta.edenor.com");
    expect(mensaje.bodyText).not.toContain("tracker.ejemplo");
    expect(mensaje.bodyText).not.toContain("clave-secreta-ggl-s10b");
    expect(mensaje.adjuntos).toEqual([]);
  });

  it("decodifica el adjunto y el watch", async () => {
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/attachments/att-1")) {
        return respuesta({ data: Buffer.from("%PDF-1.7 contenido").toString("base64url") });
      }
      if (url.includes("/watch")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          topicName: "projects/p/topics/gmail",
          labelIds: ["INBOX"],
        });
        return respuesta({ historyId: "100", expiration: "1792000000000" });
      }
      throw new Error(`url inesperada: ${url}`);
    }) as typeof fetch;

    const gmail = crearClienteGmail({ accessToken: "token", fetchImpl });
    const adjunto = await gmail.getAttachment({ messageId: "msg-1", attachmentId: "att-1" });
    expect(adjunto.bytes.toString("utf8")).toBe("%PDF-1.7 contenido");

    const watch = await gmail.watch({ topicName: "projects/p/topics/gmail", labelIds: ["INBOX"] });
    expect(watch).toEqual({ historyId: "100", expiration: "1792000000000" });
  });

  it("traduce un 404 de history a historial vencido", async () => {
    const fetchImpl = (async () =>
      respuesta({ error: { code: 404 } }, 404)) as typeof fetch;
    const gmail = crearClienteGmail({ accessToken: "token", fetchImpl });
    await expect(gmail.listHistory({ startHistoryId: "1" })).rejects.toMatchObject({
      codigo: "historial_vencido",
    });
  });

  it("marca 429 y 5xx como transitorios", async () => {
    const fetchImpl = (async () => respuesta({ error: {} }, 503)) as typeof fetch;
    const gmail = crearClienteGmail({ accessToken: "token", fetchImpl });
    await expect(gmail.getProfile()).rejects.toBeInstanceOf(ErrorGmail);
    await expect(gmail.getProfile()).rejects.toMatchObject({ codigo: "http_503" });
  });
});
