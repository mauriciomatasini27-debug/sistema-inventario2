import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import type { EstadoContactoProveedor } from "../src/modules/whatsapp/proveedor.js";
import type { Supplier } from "../src/modules/purchases/proveedores.js";

const SECRET = "prov-cuit-secret";
const NUM = "5491100000002";
const NUM2 = "5491100000003";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-prov-cuit";
const CUIT_LECTURA = "20-93333172-6";
const CUIT = "20933331726";
const OTRO_CUIT = "30712345678";
const TEXTO_OCR = `FACTURA\nCUIT ${CUIT_LECTURA}\nFecha 10/10/2026\nTotal $ 164.800,00\n`;

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
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${(n += 1)}` }] }), {
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
  return `wamid-prov-cuit-${n}-${Math.floor(Math.random() * 1e6)}`;
}

function contacto(estado: EstadoContactoProveedor, numero = NUM, supplierCuit: string | null = null) {
  control.proveedorContactos.set(`+${numero}`, {
    numeroE164: `+${numero}`,
    tenantId: "t-1",
    supplierCuit,
    estado,
    creadoEn: new Date().toISOString(),
  });
}

function sembrarProveedor(cuit: string, nombre: string) {
  const supplier: Supplier = {
    id: `sup-${cuit}`,
    cuit,
    nombre,
    email: null,
    telefono: null,
    activo: true,
    creadoEn: "2026-10-19T12:00:00.000Z",
    actualizadoEn: "2026-10-19T12:00:00.000Z",
  };
  store.suppliers.set(cuit, supplier);
}

beforeEach(() => {
  resetStore();
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

describe("PROV-S6 el CUIT leído por el OCR define la identidad del proveedor", () => {
  it("un contacto sin CUIT queda atado al CUIT de la factura y no existe proveedor", async () => {
    contacto("verificado", NUM, null);
    const r = await mandar(cargaAdjunto(wamid()));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_borrador");
    expect(r.json["cuit"]).toBe(CUIT);
    expect(r.json["proveedor_existe"]).toBe(false);
    expect(control.proveedorContactos.get(`+${NUM}`)?.supplierCuit).toBe(CUIT);
  });

  it("si el CUIT ya es proveedor del comercio el bot lo reconoce", async () => {
    contacto("verificado", NUM, null);
    sembrarProveedor(CUIT, "Panadería Sur");
    const r = await mandar(cargaAdjunto(wamid()));

    expect(r.json["cuit"]).toBe(CUIT);
    expect(r.json["proveedor_existe"]).toBe(true);
    expect(control.proveedorContactos.get(`+${NUM}`)?.supplierCuit).toBe(CUIT);
  });
});

describe("PROV-S7 el teléfono es vínculo secundario: no duplica al proveedor", () => {
  it("un segundo número con el mismo CUIT queda atado al mismo proveedor sin duplicarlo", async () => {
    sembrarProveedor(CUIT, "Panadería Sur");
    contacto("verificado", NUM, null);
    contacto("verificado", NUM2, null);

    await mandar(cargaAdjunto(wamid(), NUM));
    const r = await mandar(cargaAdjunto(wamid(), NUM2));

    expect(r.json["proveedor_existe"]).toBe(true);
    expect(control.proveedorContactos.get(`+${NUM}`)?.supplierCuit).toBe(CUIT);
    expect(control.proveedorContactos.get(`+${NUM2}`)?.supplierCuit).toBe(CUIT);
    expect(store.suppliers.size).toBe(1);
  });
});

describe("PROV-S6 un CUIT distinto no pisa la identidad previa del contacto", () => {
  it("la factura con otro CUIT deja el contacto con el original", async () => {
    contacto("verificado", NUM, OTRO_CUIT);
    const r = await mandar(cargaAdjunto(wamid()));

    expect(r.json["cuit"]).toBe(OTRO_CUIT);
    expect(control.proveedorContactos.get(`+${NUM}`)?.supplierCuit).toBe(OTRO_CUIT);
  });
});
