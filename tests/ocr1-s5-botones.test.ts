import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import {
  parsear_boton_ocr,
  RESPUESTA_OCR_BOTON_INVALIDO,
  RESPUESTA_OCR_DESCARTADO,
  RESPUESTA_OCR_EDITAR_WEB,
} from "../src/modules/whatsapp/ocr-borrador.js";
import { normalizarBotonEntrada } from "../src/modules/whatsapp/transport.js";
import { RESPUESTA_SENSIBLE_BOT } from "../src/modules/auth/bot.js";
import { RESPUESTA_NO_VINCULADO } from "../src/modules/whatsapp/resolucion.js";

const SECRET = "s5-botones-secret";
const NUMERO = "5491100000000";
const SIN_VINCULAR = "5491199999999";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-777";
const TEXTO_OCR = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";

let enviados: Record<string, unknown>[] = [];
let n = 0;

function nombreWamid(): string {
  n += 1;
  return `wamid-s5b-${n}`;
}

function conCredenciales() {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

// Red falsa tolerante: el motor Paddle responde el texto del comprobante, la
// descarga del media (si llega a implementarse) responde metadata y bytes, y la
// Cloud API captura lo que el bot envía (los recibos de leído no cuentan).
function stubRed(confianza = 0.9) {
  vi.stubGlobal("fetch", async (entrada: unknown, init: { body?: string } = {}) => {
    const url = String(entrada);
    if (url.startsWith(ENDPOINT)) {
      return new Response(JSON.stringify({ texto: TEXTO_OCR, confianza }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("graph.facebook.com")) {
      const cuerpo = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
      if (cuerpo["status"] === "read") return new Response("{}", { status: 200 });
      if (typeof cuerpo["to"] === "string") {
        enviados.push(cuerpo);
        return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${enviados.length}` }] }), {
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ url: `https://blob.local/${MEDIA_ID}`, mime_type: "image/jpeg" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  });
}

function ts(): string {
  return String(Math.floor(Date.now() / 1000));
}

function cargaAdjunto(wamid: string, tipo: "image" | "document", mime: string, from = NUMERO, id = MEDIA_ID): unknown {
  return {
    entry: [{ changes: [{ value: { messages: [{ id: wamid, from, timestamp: ts(), type: tipo, [tipo]: { id, mime_type: mime } }] } }] }],
  };
}

function cargaBoton(wamid: string, botonId: string, from = NUMERO): unknown {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { id: wamid, from, timestamp: ts(), type: "interactive", interactive: { type: "button_reply", button_reply: { id: botonId, title: "x" } } },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function mandar(carga: unknown) {
  const raw = JSON.stringify(carga);
  const firma = `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
  const res = (await postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }),
  )) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function comercioVinculado(tenantId = "t-1") {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-1",
    esDemo: false,
  });
  control.memberships.set("m-1", { id: "m-1", tenantId, googleSub: "g-1", rol: "dueno", permisos: [], estado: "activo", puedeUsarBot: true });
  control.botLinks.set(`+${NUMERO}`, { tenantId, googleSub: "g-1", estado: "verificado" });
}

async function crearBorrador(): Promise<string> {
  const r = await mandar(cargaAdjunto(nombreWamid(), "image", "image/jpeg"));
  expect(r.json["accion"]).toBe("ocr_borrador");
  return r.json["borrador_id"] as string;
}

function ultimoTexto(): string {
  const ultimo = enviados[enviados.length - 1]!;
  return (ultimo["text"] as { body: string }).body;
}

beforeEach(() => {
  resetStore();
  enviados = [];
  conCredenciales();
  stubRed();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.OCR_PADDLE_ENDPOINT;
});

describe("OCR1-S5 el toque de los botones del borrador", () => {
  it("descartar desde el número dueño cierra el borrador y registra el evento", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    expect(store.borradores.get(borradorId)?.estado).toBe("pendiente");

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:descartar:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_descartado");
    expect(store.borradores.get(borradorId)?.estado).toBe("descartada");
    const evento = store.ocrEventos.find((e) => e.tipo === "ocr_descartado")?.payload as Record<string, unknown>;
    expect(evento["motivo"]).toBe("boton");
    expect(typeof evento["job_id"]).toBe("string");
    expect((evento["job_id"] as string).length).toBeGreaterThan(0);
    expect(ultimoTexto()).toBe(RESPUESTA_OCR_DESCARTADO);
  });

  it("descartar dos veces: la segunda responde inválido y no duplica el evento", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    await mandar(cargaBoton(nombreWamid(), `ocr:descartar:${borradorId}`));

    const segunda = await mandar(cargaBoton(nombreWamid(), `ocr:descartar:${borradorId}`));

    expect(segunda.json["accion"]).toBe("ocr_descartado_error");
    expect(ultimoTexto()).toBe(RESPUESTA_OCR_BOTON_INVALIDO);
    expect(store.ocrEventos.filter((e) => e.tipo === "ocr_descartado").length).toBe(1);
  });

  it("confirmar deriva a la web sin registrar factura ni tocar el borrador", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:confirmar:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("derivada_web");
    expect(ultimoTexto()).toBe(RESPUESTA_SENSIBLE_BOT);
    expect(store.facturasProv.size).toBe(0);
    expect(store.borradores.get(borradorId)?.estado).toBe("pendiente");
  });

  it("editar deriva a la web y deja el borrador pendiente", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("derivada_web");
    expect(ultimoTexto()).toBe(RESPUESTA_OCR_EDITAR_WEB);
    expect(store.borradores.get(borradorId)?.estado).toBe("pendiente");
  });

  it("un id de botón que no es de OCR se ignora sin enviar nada", async () => {
    comercioVinculado();
    const antes = enviados.length;

    const r = await mandar(cargaBoton(nombreWamid(), "otra:cosa:1"));

    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, accion: "boton_ignorado" });
    expect(enviados.length).toBe(antes);
  });

  it("descartar un borrador inexistente responde el mensaje de botón inválido", async () => {
    comercioVinculado();

    const r = await mandar(cargaBoton(nombreWamid(), "ocr:descartar:no-existe"));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_descartado_error");
    expect(ultimoTexto()).toBe(RESPUESTA_OCR_BOTON_INVALIDO);
  });

  it("un toque desde un número no vinculado recibe el genérico sin tocar borradores", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:descartar:${borradorId}`, SIN_VINCULAR));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("consulta");
    expect(r.json["respuesta"]).toBe(RESPUESTA_NO_VINCULADO);
    expect(store.borradores.get(borradorId)?.estado).toBe("pendiente");
    expect(ultimoTexto()).toBe(RESPUESTA_NO_VINCULADO);
  });

  it("AT1 el mismo wamid de botón dos veces: una sola respuesta", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    const wamid = nombreWamid();

    const primero = await mandar(cargaBoton(wamid, `ocr:confirmar:${borradorId}`));
    const segundo = await mandar(cargaBoton(wamid, `ocr:confirmar:${borradorId}`));

    expect(primero.json["accion"]).toBe("derivada_web");
    expect(segundo.json).toEqual({ ok: true, duplicado: true });
    expect(enviados.filter((e) => e["type"] === "text").length).toBe(1);
  });
});

describe("OCR1-S5 parseo de botones (puro)", () => {
  it("parsear_boton_ocr acepta las tres acciones y rechaza el resto", () => {
    expect(parsear_boton_ocr("ocr:confirmar:b-1")).toEqual({ accion: "confirmar", borradorId: "b-1" });
    expect(parsear_boton_ocr("ocr:editar:b-1")).toEqual({ accion: "editar", borradorId: "b-1" });
    expect(parsear_boton_ocr("ocr:descartar:b-1")).toEqual({ accion: "descartar", borradorId: "b-1" });
    expect(parsear_boton_ocr("ocr:otra:b-1")).toBeNull();
    expect(parsear_boton_ocr("otra:confirmar:b-1")).toBeNull();
    expect(parsear_boton_ocr("ocr:confirmar:")).toBeNull();
    expect(parsear_boton_ocr("ocr:confirmar:b-1:extra")).toBeNull();
    expect(parsear_boton_ocr("")).toBeNull();
  });

  it("normalizarBotonEntrada lee el button_reply y descarta otros tipos", () => {
    const b = normalizarBotonEntrada(cargaBoton("w-1", "ocr:confirmar:b-1"));
    expect(b).toMatchObject({ wamid: "w-1", botonId: "ocr:confirmar:b-1" });
    expect(b?.remitenteE164).toBe(`+${NUMERO}`);
    const listReply = { entry: [{ changes: [{ value: { messages: [{ id: "w", from: NUMERO, type: "interactive", interactive: { type: "list_reply" } }] } }] }] };
    expect(normalizarBotonEntrada(listReply)).toBeNull();
    expect(normalizarBotonEntrada({ entry: [{ changes: [{ value: { messages: [{ id: "w", from: NUMERO, type: "text", text: { body: "hola" } }] } }] }] })).toBeNull();
  });
});
