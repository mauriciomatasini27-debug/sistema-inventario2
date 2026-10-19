import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { RESPUESTA_PROV_FACTURA_RECIBIDA, type EstadoContactoProveedor } from "../src/modules/whatsapp/proveedor.js";

const SECRET = "prov-aviso-secret";
const NUM = "5491100000002";
const DUENO = "5491100000001";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-prov-aviso";
const TEXTO_OCR = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";

let enviados: Record<string, unknown>[] = [];
let n = 0;

function conCredenciales() {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

// Red falsa: el motor responde el texto del comprobante, la media sus bytes y
// el envío captura cada salida (el recibo de leído no cuenta).
function stubRed() {
  vi.stubGlobal("fetch", async (entrada: unknown, init: { body?: string } = {}) => {
    const url = String(entrada);
    if (url.startsWith(ENDPOINT)) {
      return new Response(JSON.stringify({ texto: TEXTO_OCR, confianza: 0.9 }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes(`/${MEDIA_ID}`)) {
      return new Response(JSON.stringify({ url: "https://media.local/blob/777", mime_type: "image/jpeg" }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://media.local/blob/777") {
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { status: 200 });
    }
    const cuerpo = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
    if (cuerpo["status"] === "read") return new Response("{}", { status: 200 });
    enviados.push(cuerpo);
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${enviados.length}` }] }), {
      headers: { "content-type": "application/json" },
    });
  });
}

function ts(): string {
  return String(Math.floor(Date.now() / 1000));
}

function cargaAdjunto(wamid: string, from = NUM): unknown {
  return {
    entry: [
      {
        changes: [
          { value: { messages: [{ id: wamid, from, timestamp: ts(), type: "image", image: { id: MEDIA_ID, mime_type: "image/jpeg" } }] } },
        ],
      },
    ],
  };
}

function cargaBoton(wamid: string, botonId: string, from = DUENO): unknown {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: wamid,
                  from,
                  timestamp: ts(),
                  type: "interactive",
                  interactive: { type: "button_reply", button_reply: { id: botonId, title: "x" } },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function mandar(carga: unknown) {
  n += 1;
  const raw = JSON.stringify(carga);
  const firma = `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
  const res = (await postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }),
  )) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function wamid(): string {
  return `wamid-prov-aviso-${n}-${Math.floor(Math.random() * 1e6)}`;
}

function contacto(estado: EstadoContactoProveedor, tenantId = "t-1", numero = NUM) {
  control.proveedorContactos.set(`+${numero}`, {
    numeroE164: `+${numero}`,
    tenantId,
    supplierCuit: null,
    estado,
    creadoEn: new Date().toISOString(),
  });
}

function comercioConDuenoVerificado(tenantId = "t-1", googleSub = "g-dueno", numeroDueno = DUENO) {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: googleSub,
    esDemo: false,
  });
  control.memberships.set("m-dueno", {
    id: "m-dueno",
    tenantId,
    googleSub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
    puedeUsarBot: true,
  });
  control.botLinks.set(`+${numeroDueno}`, { tenantId, googleSub, estado: "verificado" });
}

beforeEach(() => {
  resetStore();
  enviados = [];
  n = 0;
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

describe("PROV-S8 el aviso del borrador de proveedor va al Dueño", () => {
  it("la oferta con botones llega al Dueño verificado y el proveedor recibe el acuse", async () => {
    comercioConDuenoVerificado();
    contacto("verificado");

    const r = await mandar(cargaAdjunto(wamid()));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_borrador");
    expect(r.json["aviso_dueno"]).toBe(true);
    expect(store.ocrJobs.size).toBe(1);

    const oferta = enviados.find((e) => e["type"] === "interactive");
    expect(oferta?.["to"]).toBe(`+${DUENO}`);
    const action = (oferta?.["interactive"] as { action: { buttons: Array<{ reply: { title: string } }> } }).action;
    expect(action.buttons.map((b) => b.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);

    const acuse = enviados.find((e) => e["type"] === "text");
    expect(acuse?.["to"]).toBe(`+${NUM}`);
    expect((acuse?.["text"] as { body: string }).body).toBe(RESPUESTA_PROV_FACTURA_RECIBIDA);

    expect(enviados.some((e) => e["to"] === `+${NUM}` && e["type"] === "interactive")).toBe(false);
  });

  it("PROV-S9 el Dueño abre la edición del borrador del proveedor con el botón `ocr:editar`", async () => {
    comercioConDuenoVerificado();
    contacto("verificado");

    const alta = await mandar(cargaAdjunto(wamid()));
    const borradorId = alta.json["borrador_id"] as string;
    expect(store.borradores.get(borradorId)?.origen).toBe("wa_proveedor");

    const r = await mandar(cargaBoton(wamid(), `ocr:editar:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_editar_pedido");
    const prompt = enviados.filter((e) => e["type"] === "text" && e["to"] === `+${DUENO}`).at(-1);
    expect((prompt?.["text"] as { body: string }).body).toContain("¿Qué corrijo?");
    expect(store.borradores.get(borradorId)?.estado).toBe("pendiente");
  });

  it("sin Dueño verificado solo hay acuse al proveedor y el borrador igual queda", async () => {
    contacto("verificado");

    const r = await mandar(cargaAdjunto(wamid()));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_borrador");
    expect(r.json["aviso_dueno"]).toBe(false);
    expect(store.ocrJobs.size).toBe(1);
    expect(store.borradores.size).toBe(1);

    expect(enviados.some((e) => e["type"] === "interactive")).toBe(false);
    const acuse = enviados.find((e) => e["type"] === "text");
    expect(acuse?.["to"]).toBe(`+${NUM}`);
    expect((acuse?.["text"] as { body: string }).body).toBe(RESPUESTA_PROV_FACTURA_RECIBIDA);
  });
});
