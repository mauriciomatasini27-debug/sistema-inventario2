import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { GET as getJob } from "../src/pages/api/ocr/jobs/[id].js";
import {
  RESPUESTA_PROV_FACTURA,
  RESPUESTA_PROV_PENDIENTE,
  type EstadoContactoProveedor,
} from "../src/modules/whatsapp/proveedor.js";
import { RESPUESTA_NO_VINCULADO } from "../src/modules/whatsapp/resolucion.js";

const SECRET = "prov-factura-secret";
const NUM = "5491100000002";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-prov-1";
const TEXTO_OCR = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";

let enviados: Record<string, unknown>[] = [];
let n = 0;

function conCredenciales() {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

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

function cargaAdjunto(wamid: string, tipo: "image" | "document", mime: string, from = NUM, id = MEDIA_ID): unknown {
  return {
    entry: [
      {
        changes: [
          { value: { messages: [{ id: wamid, from, timestamp: ts(), type: tipo, [tipo]: { id, mime_type: mime } }] } },
        ],
      },
    ],
  };
}

function cargaTexto(wamid: string, texto: string, from = NUM): unknown {
  return {
    entry: [
      { changes: [{ value: { messages: [{ id: wamid, from, timestamp: ts(), type: "text", text: { body: texto } }] } }] },
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
  return `wamid-prov-fact-${n}-${Math.floor(Math.random() * 1e6)}`;
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

async function leerJob(jobId: string) {
  const res = (await getJob(ctx(`http://x/api/ocr/jobs/${jobId}`, { params: { id: jobId } }))) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
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

describe("PROV-S5 el contacto verificado manda la factura y entra al comercio", () => {
  it("una foto crea el borrador del comercio del contacto con origen wa_proveedor", async () => {
    contacto("verificado", "t-1");
    const r = await mandar(cargaAdjunto(wamid(), "image", "image/jpeg"));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_borrador");
    expect(store.ocrJobs.size).toBe(1);
    const job = [...store.ocrJobs.values()][0];
    expect(job?.origen).toBe("wa_proveedor");

    const borradorId = r.json["borrador_id"] as string;
    expect(store.borradores.get(borradorId)?.origen).toBe("wa_proveedor");
    expect(store.borradores.get(borradorId)?.bytesRef).toBe(`wa-media:${MEDIA_ID}`);

    const g = await leerJob(r.json["job_id"] as string);
    expect(g.status).toBe(200);
    expect(g.json["estado"]).toBe("confirmable");
    expect(g.json["borrador"]).toMatchObject({
      id: borradorId,
      fecha_iso: "2026-10-10",
      total_centavos: "16480000",
    });
  });

  it("un PDF también entra como borrador del contacto", async () => {
    contacto("verificado", "t-1");
    const r = await mandar(cargaAdjunto(wamid(), "document", "application/pdf"));
    expect(r.json["accion"]).toBe("ocr_borrador");
    expect(store.ocrJobs.size).toBe(1);
    expect([...store.ocrJobs.values()][0]?.origen).toBe("wa_proveedor");
  });

  it("sin adjunto el bot pide la factura y no crea job", async () => {
    contacto("verificado", "t-1");
    const r = await mandar(cargaTexto(wamid(), "hola"));
    expect(r.json["accion"]).toBe("prov_factura_pedida");
    expect(store.ocrJobs.size).toBe(0);
    expect((enviados[0]!["text"] as { body: string }).body).toBe(RESPUESTA_PROV_FACTURA);
  });
});

describe("PROV un contacto pendiente o revocado no carga factura", () => {
  it("pendiente recibe el aviso y no se crea borrador", async () => {
    contacto("pendiente", "t-1");
    const r = await mandar(cargaAdjunto(wamid(), "image", "image/jpeg"));
    expect(r.json["accion"]).toBe("prov_pendiente");
    expect(store.ocrJobs.size).toBe(0);
    expect(store.borradores.size).toBe(0);
    expect((enviados[0]!["text"] as { body: string }).body).toBe(RESPUESTA_PROV_PENDIENTE);
  });

  it("revocado cae a la puerta de identidad y recibe el genérico", async () => {
    contacto("revocado", "t-1");
    const r = await mandar(cargaAdjunto(wamid(), "image", "image/jpeg"));
    expect(r.json["accion"]).toBe("consulta");
    expect(r.json["respuesta"]).toBe(RESPUESTA_NO_VINCULADO);
    expect(store.ocrJobs.size).toBe(0);
    expect((enviados[0]!["text"] as { body: string }).body).toBe(RESPUESTA_NO_VINCULADO);
  });
});
