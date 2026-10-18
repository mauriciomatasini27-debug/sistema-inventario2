import { describe, expect, it } from "vitest";
import { descargar_media } from "../src/modules/whatsapp/cliente-cloud.js";
import { TransporteFake } from "../src/modules/whatsapp/transport.js";

const BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const TOKEN = "tok-secreto";

function metadata(over: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ url: "https://media.local/blob/1", mime_type: "image/jpeg", ...over }), {
    headers: { "content-type": "application/json" },
  });
}

function conDosSaltos(): typeof fetch {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("https://graph.facebook.com/")) return metadata();
    return new Response(BYTES, { status: 200 });
  };
}

describe("descargar_media baja el media de la Cloud API como bytes", () => {
  it("camino feliz: devuelve los bytes y el mime_type de Meta", async () => {
    const imagen = await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn: conDosSaltos() });
    expect(imagen).not.toBeNull();
    expect(new Uint8Array(imagen!.bytes)).toEqual(BYTES);
    expect(imagen!.mimeType).toBe("image/jpeg");
    expect(Object.keys(imagen!)).toEqual(["bytes", "mimeType"]);
    expect(JSON.stringify(imagen)).not.toContain(TOKEN);
    expect(JSON.stringify(imagen)).not.toContain("graph.facebook.com");
  });

  it("sin mime_type usa application/octet-stream", async () => {
    const fetchFn: typeof fetch = async (input: RequestInfo | URL): Promise<Response> =>
      String(input).startsWith("https://graph.facebook.com/") ? metadata({ mime_type: "" }) : new Response(BYTES, { status: 200 });
    const imagen = await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn });
    expect(imagen!.mimeType).toBe("application/octet-stream");
  });

  it("metadata sin url devuelve null", async () => {
    const fetchFn: typeof fetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ mime_type: "image/jpeg" }), { headers: { "content-type": "application/json" } });
    expect(await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn })).toBeNull();
  });

  it("el segundo salto no https devuelve null (no manda el token a un host ajeno)", async () => {
    const fetchFn: typeof fetch = async (input: RequestInfo | URL): Promise<Response> =>
      String(input).startsWith("https://graph.facebook.com/") ? metadata({ url: "http://atacante.interno/x" }) : new Response(BYTES, { status: 200 });
    expect(await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn })).toBeNull();
  });

  it("cuerpo vacío devuelve null", async () => {
    const fetchFn: typeof fetch = async (input: RequestInfo | URL): Promise<Response> =>
      String(input).startsWith("https://graph.facebook.com/") ? metadata() : new Response(new Uint8Array([]), { status: 200 });
    expect(await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn })).toBeNull();
  });

  it("content-length sobre el tope devuelve null sin leer el cuerpo", async () => {
    const fetchFn: typeof fetch = async (input: RequestInfo | URL): Promise<Response> =>
      String(input).startsWith("https://graph.facebook.com/")
        ? metadata()
        : new Response(null, { status: 200, headers: { "content-length": String(17 * 1024 * 1024) } });
    expect(await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn })).toBeNull();
  });

  it("si el primer salto no responde ok devuelve null", async () => {
    const fetchFn: typeof fetch = async (): Promise<Response> => new Response("{}", { status: 404 });
    expect(await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn })).toBeNull();
  });

  it("si el segundo salto no responde ok devuelve null", async () => {
    const fetchFn: typeof fetch = async (input: RequestInfo | URL): Promise<Response> =>
      String(input).startsWith("https://graph.facebook.com/") ? metadata() : new Response("{}", { status: 500 });
    expect(await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn })).toBeNull();
  });

  it("si el fetch lanza devuelve null sin propagar el error", async () => {
    const fetchFn: typeof fetch = async (): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    };
    expect(await descargar_media({ idMedia: "media-1", token: TOKEN, fetchFn })).toBeNull();
  });

  it("el transporte fake devuelve bytes canned", async () => {
    const imagen = await new TransporteFake().descargarMedia("x");
    expect(new Uint8Array(imagen!.bytes)).toEqual(BYTES);
    expect(imagen!.mimeType).toBe("image/jpeg");
  });
});
