import { describe, expect, it } from "vitest";
import type { FetchEnvio } from "../src/modules/whatsapp/cliente-cloud.js";
import {
  crearTransporteCloud,
  normalizarEntrada,
  TransporteFake,
  type MensajeWA,
} from "../src/modules/whatsapp/transport.js";

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
