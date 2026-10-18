import { describe, expect, it } from "vitest";
import type { FetchEnvio } from "../src/modules/whatsapp/cliente-cloud.js";
import {
  crearTransporteCloud,
  normalizarAdjuntoEntrada,
  normalizarEntrada,
  TransporteFake,
  type MensajeWA,
} from "../src/modules/whatsapp/transport.js";
import { construir_botones } from "../src/modules/whatsapp/envio.js";

function cargaCloud(texto: string, from = "5491100000000", id = "wamid.1"): unknown {
  return { entry: [{ changes: [{ value: { messages: [{ id, from, text: { body: texto }, timestamp: "1700000000" }] } }] }] };
}

describe("BOT2-S5 WhatsAppTransport fake", () => {
  it("enviar registra sin red y recibir normaliza la carga", async () => {
    const t = new TransporteFake();
    const r = await t.enviar("+5491100000000", "hola");
    expect(r.ok).toBe(true);
    expect(t.enviados).toEqual([{ to: "+5491100000000", texto: "hola" }]);
    const m = t.recibir(cargaCloud("stock coca"));
    expect(m).toMatchObject({ remitenteE164: "+5491100000000", texto: "stock coca" });
    expect(t.estado()).toEqual({ nombre: "fake", disponible: true });
  });

  it("recibir descarta cargas sin mensaje de texto", () => {
    const t = new TransporteFake();
    expect(t.recibir({ entry: [] })).toBeNull();
    expect(t.recibir({ entry: [{ changes: [{ value: {} }] }] })).toBeNull();
  });

  it("enviarPayload deja el interactivo listo para el fake sin red", async () => {
    const t = new TransporteFake();
    const payload = construir_botones("Leí tu comprobante", [{ id: "ocr:confirmar:b1", titulo: "Confirmar" }]);
    const r = await t.enviarPayload("+5491100000000", payload);
    expect(r.ok).toBe(true);
    expect(t.enviadosPayload).toEqual([{ to: "+5491100000000", payload }]);
  });

  it("normalizarAdjuntoEntrada lee el media id y el mime_type de image y document", () => {
    const imagen = {
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.2", from: "5491100000000", type: "image", image: { id: "media-1", mime_type: "image/jpeg" } }] } }] }],
    };
    expect(normalizarAdjuntoEntrada(imagen)).toMatchObject({
      wamid: "wamid.2",
      remitenteE164: "+5491100000000",
      adjunto: { idMedia: "media-1", mimeType: "image/jpeg", nombreArchivo: null },
    });
    const documento = {
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.3", from: "5491100000000", type: "document", document: { id: "media-2", mime_type: "application/pdf", filename: "factura.pdf" } }] } }] }],
    };
    expect(normalizarAdjuntoEntrada(documento)?.adjunto).toEqual({
      idMedia: "media-2",
      mimeType: "application/pdf",
      nombreArchivo: "factura.pdf",
    });
    const voz = {
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.4", from: "5491100000000", type: "audio", audio: { id: "media-3" } }] } }] }],
    };
    expect(normalizarAdjuntoEntrada(voz)).toBeNull();
    expect(normalizarEntrada(imagen)).toBeNull();
  });
});

describe("BOT2-S5 adaptador cloud implementa la interfaz sin red real", () => {
  it("enviar por cloud usa fetch inyectado y devuelve wamid", async () => {
    const vistos: string[] = [];
    const fetchFn: FetchEnvio = async (url, init) => {
      vistos.push(url);
      expect(init.body).toContain("hola");
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.9" }] }) };
    };
    const t = crearTransporteCloud({ phoneNumberId: "pnid", token: "tok", fetchFn });
    const r = await t.enviar("+5491100000000", "hola");
    expect(r).toEqual({ ok: true, wamid: "wamid.9" });
    expect(vistos[0]).toContain("pnid");
    expect(t.estado()).toEqual({ nombre: "cloud", disponible: true });
  });

  it("enviarPayload por cloud manda el interactivo tal cual", async () => {
    const cuerpos: string[] = [];
    const fetchFn: FetchEnvio = async (_url, init) => {
      cuerpos.push(init.body);
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.10" }] }) };
    };
    const payload = construir_botones("Leí tu comprobante", [{ id: "ocr:confirmar:b1", titulo: "Confirmar" }]);
    const r = await crearTransporteCloud({ phoneNumberId: "pnid", token: "tok", fetchFn }).enviarPayload("+5491100000000", payload);
    expect(r).toEqual({ ok: true, wamid: "wamid.10" });
    expect(JSON.parse(cuerpos[0]!)).toMatchObject({ messaging_product: "whatsapp", to: "+5491100000000", type: "interactive" });
  });

  it("sin credenciales el cloud se declara no disponible y no envía", async () => {
    const t = crearTransporteCloud({ phoneNumberId: "", token: "" });
    expect(t.estado().disponible).toBe(false);
    const r = await t.enviar("+5491100000000", "hola");
    expect(r.ok).toBe(false);
  });

  it("ambos transportes normalizan la misma carga al mismo mensaje", () => {
    const carga = cargaCloud("cuantos milka tengo");
    const esperado: MensajeWA = {
      wamid: "wamid.1",
      remitenteE164: "+5491100000000",
      texto: "cuantos milka tengo",
      timestampMs: 1700000000 * 1000,
    };
    expect(new TransporteFake().recibir(carga)).toEqual(esperado);
    expect(normalizarEntrada(carga)).toEqual(esperado);
    expect(crearTransporteCloud({ phoneNumberId: "p", token: "t" }).recibir(carga)).toEqual(esperado);
  });
});
