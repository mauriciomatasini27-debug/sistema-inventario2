import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { ocrJobs } from "../src/db/schema.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { GET as getJob } from "../src/pages/api/ocr/jobs/[id].js";
import {
  cuerpo_borrador_ocr,
  es_comprobante_desde_mime,
  payload_borrador_ocr,
} from "../src/modules/whatsapp/ocr-borrador.js";
import type { Borrador } from "../src/modules/purchases/facturas.js";
import { RESPUESTA_NO_VINCULADO } from "../src/modules/whatsapp/resolucion.js";

const SECRET = "s5-secret";
const NUMERO = "5491100000000";
const SIN_VINCULAR = "5491199999999";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-777";
const TEXTO_OCR = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";

let enviados: Record<string, unknown>[] = [];
let peticionesMotor: Array<{ b64: string; mime: string }> = [];
let n = 0;

function nombreWamid(): string {
  n += 1;
  return `wamid-s5-${n}`;
}

function conCredenciales() {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

// Red falsa: el motor Paddle responde con el texto del comprobante, la Cloud
// API de media devuelve metadata y bytes, y el envío captura lo que el bot manda
// (los recibos de leído no cuentan).
function stubRed(confianza = 0.9, mediaStatus = 200) {
  vi.stubGlobal("fetch", async (entrada: unknown, init: { body?: string } = {}) => {
    const url = String(entrada);
    if (url.startsWith(ENDPOINT)) {
      const cuerpo = JSON.parse(init.body ?? "{}") as { imagen_base64?: string; mime_type?: string };
      peticionesMotor.push({ b64: cuerpo.imagen_base64 ?? "", mime: cuerpo.mime_type ?? "" });
      return new Response(JSON.stringify({ texto: TEXTO_OCR, confianza }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes(`/${MEDIA_ID}`)) {
      if (mediaStatus !== 200) return new Response("{}", { status: mediaStatus });
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

function cargaTexto(wamid: string, texto: string, from = NUMERO): unknown {
  return { entry: [{ changes: [{ value: { messages: [{ id: wamid, from, timestamp: ts(), type: "text", text: { body: texto } }] } }] }] };
}

function cargaAdjunto(wamid: string, tipo: "image" | "document", mime: string, from = NUMERO, id = MEDIA_ID): unknown {
  return {
    entry: [{ changes: [{ value: { messages: [{ id: wamid, from, timestamp: ts(), type: tipo, [tipo]: { id, mime_type: mime } }] } }] }],
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

async function leerJob(jobId: string) {
  const res = (await getJob(ctx(`http://x/api/ocr/jobs/${jobId}`, { params: { id: jobId } }))) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  resetStore();
  enviados = [];
  peticionesMotor = [];
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

describe("OCR1-S5 una foto de WhatsApp abre un borrador con botones", () => {
  it("imagen de un número vinculado: un job, borrador confirmable y los tres botones", async () => {
    comercioVinculado();
    const wamid = nombreWamid();
    const r = await mandar(cargaAdjunto(wamid, "image", "image/jpeg"));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_borrador");
    expect(store.ocrJobs.size).toBe(1);
    expect(peticionesMotor).toEqual([
      { b64: Buffer.from(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).toString("base64"), mime: "image/jpeg" },
    ]);
    expect(Object.keys(peticionesMotor[0]!)).toEqual(["b64", "mime"]);

    const jobId = r.json["job_id"] as string;
    const borradorId = r.json["borrador_id"] as string;
    const g = await leerJob(jobId);
    expect(g.status).toBe(200);
    expect(g.json["estado"]).toBe("confirmable");
    expect(g.json["borrador"]).toMatchObject({
      id: borradorId,
      fecha_iso: "2026-10-10",
      total_centavos: "16480000",
      confianza: { cuit: "media", fecha: "media", total: "media" },
    });

    expect(enviados.length).toBe(1);
    const cuerpo = enviados[0]!;
    expect(cuerpo["type"]).toBe("interactive");
    const interactive = cuerpo["interactive"] as Record<string, unknown>;
    expect(interactive["type"]).toBe("button");
    const action = interactive["action"] as { buttons: Array<{ reply: { id: string; title: string } }> };
    expect(action.buttons.map((b) => b.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);
    expect(action.buttons.map((b) => b.reply.id)).toEqual([
      `ocr:confirmar:${borradorId}`,
      `ocr:editar:${borradorId}`,
      `ocr:descartar:${borradorId}`,
    ]);
    const body = (interactive["body"] as { text: string }).text;
    expect(body).toBe(
      [
        "Leí tu comprobante:",
        "• Sin proveedor (CUIT 20-93333172-6) — confianza media",
        "• Fecha 2026-10-10 — confianza media",
        "• Total $164.800 — confianza media",
        "Revisá los datos antes de confirmar.",
      ].join("\n"),
    );
  });

  it("documento PDF: también abre borrador y los mismos botones", async () => {
    comercioVinculado();
    const r = await mandar(cargaAdjunto(nombreWamid(), "document", "application/pdf"));
    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_borrador");
    expect(store.ocrJobs.size).toBe(1);
    const interactive = enviados[0]!["interactive"] as Record<string, unknown>;
    const action = interactive["action"] as { buttons: Array<{ reply: { id: string; title: string } }> };
    expect(action.buttons.map((b) => b.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);
  });

  it("AT1 el mismo wamid dos veces: un solo job y una sola respuesta", async () => {
    comercioVinculado();
    const wamid = nombreWamid();
    const primero = await mandar(cargaAdjunto(wamid, "image", "image/jpeg"));
    const segundo = await mandar(cargaAdjunto(wamid, "image", "image/jpeg"));

    expect(primero.status).toBe(200);
    expect(segundo.status).toBe(200);
    expect(segundo.json).toEqual({ ok: true, duplicado: true });
    expect(store.ocrJobs.size).toBe(1);
    expect(enviados.length).toBe(1);
  });

  it("si el media no baja (404): avisa, no crea job ni llama al motor", async () => {
    comercioVinculado();
    stubRed(0.9, 404);
    const r = await mandar(cargaAdjunto(nombreWamid(), "image", "image/jpeg"));
    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_media_fallida");
    expect(store.ocrJobs.size).toBe(0);
    expect(peticionesMotor).toEqual([]);
    expect(enviados.length).toBe(1);
    expect((enviados[0]!["text"] as { body: string }).body).toBe(
      "No pude bajar el comprobante. Reintentá mandándolo de nuevo.",
    );
  });
});

describe("OCR1-S5 lo que NO es comprobante o no está vinculado", () => {
  it("audio/ogg como documento: sin job y el bot avisa que no parece un comprobante", async () => {
    comercioVinculado();
    const r = await mandar(cargaAdjunto(nombreWamid(), "document", "audio/ogg"));
    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_no_comprobante");
    expect(store.ocrJobs.size).toBe(0);
    expect(peticionesMotor).toEqual([]);
    expect(enviados.length).toBe(1);
    expect(enviados[0]).toMatchObject({ type: "text", text: { preview_url: false } });
    expect((enviados[0]!["text"] as { body: string }).body).toBe(
      "Ese archivo no parece un comprobante. Mandame una foto o un PDF de la factura.",
    );
  });

  it("número no vinculado: la respuesta de siempre, sin job y sin llamar al motor", async () => {
    comercioVinculado();
    const r = await mandar(cargaAdjunto(nombreWamid(), "image", "image/jpeg", SIN_VINCULAR));
    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("consulta");
    expect(r.json["respuesta"]).toBe(RESPUESTA_NO_VINCULADO);
    expect(store.ocrJobs.size).toBe(0);
    expect(peticionesMotor).toEqual([]);
    expect((enviados[0]!["text"] as { body: string }).body).toBe(RESPUESTA_NO_VINCULADO);
  });

  it("un tipo de Meta que no es texto ni image/document se sigue ignorando", async () => {
    comercioVinculado();
    const carga = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: nombreWamid(), from: NUMERO, timestamp: ts(), type: "sticker", sticker: { id: "sticker-1", mime_type: "image/webp" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const r = await mandar(carga);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, ignorado: true });
    expect(store.ocrJobs.size).toBe(0);
    expect(enviados.length).toBe(0);
  });

  it("un texto común sigue contestando por el camino de siempre", async () => {
    comercioVinculado();
    const r = await mandar(cargaTexto(nombreWamid(), "cuantos milka tengo"));
    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("consulta");
    expect(store.ocrJobs.size).toBe(0);
    expect(control.botConsultas.size).toBe(1);
    expect(enviados.length).toBe(1);
    expect(enviados[0]!["type"]).toBe("text");
    expect((enviados[0]!["text"] as { body: string }).body.length).toBeGreaterThan(0);
  });
});

describe("OCR1-S5 AT2 ninguna salida expone la clave ni el endpoint del proveedor", () => {
  it("respuesta del bot, cuerpo enviado y evento no traen key, secret, token ni endpoint", async () => {
    comercioVinculado();
    const r = await mandar(cargaAdjunto(nombreWamid(), "image", "image/jpeg"));
    const evento = store.ocrEventos.find((e) => e.tipo === "ocr_borrador_listo");
    const salidas = [JSON.stringify(r.json), JSON.stringify(enviados[0]), JSON.stringify(evento?.payload)];
    for (const salida of salidas) {
      expect(salida).not.toContain("key");
      expect(salida).not.toContain("secret");
      expect(salida).not.toContain(TOKEN);
      expect(salida).not.toContain(ENDPOINT);
      expect(salida).not.toContain("paddle");
    }
  });
});

const BORRADOR: Borrador = {
  id: "borr-ocr-1",
  idempotencyKey: "ocr-1",
  origen: "wa",
  bytesRef: "wa-media:media-777",
  cuit: "20-93333172-6",
  nombreProveedor: "ACME SA",
  fechaIso: "2026-10-10",
  totalCentavos: 16480000n,
  items: [],
  confianza: { cuit: "alta", fecha: "media", total: "baja" },
  estado: "pendiente",
  fotoPendiente: true,
  confirmadoPor: null,
  facturaId: null,
  creadoEn: "2026-10-18T12:00:00.000Z",
  venceAt: "2026-10-25T12:00:00.000Z",
};

describe("OCR1-S5 payload de botones (puro)", () => {
  it("el cuerpo muestra proveedor, fecha y total con la confianza de cada campo", () => {
    expect(cuerpo_borrador_ocr(BORRADOR, true)).toBe(
      [
        "Leí tu comprobante:",
        "• ACME SA (CUIT 20-93333172-6) — confianza alta",
        "• Fecha 2026-10-10 — confianza media",
        "• Total $164.800 — confianza baja",
        "Revisá los datos antes de confirmar.",
      ].join("\n"),
    );
  });

  it("sin campos pendientes de revisar el cuerpo no avisa", () => {
    const cuerpo = cuerpo_borrador_ocr(BORRADOR, false);
    expect(cuerpo).not.toContain("Revisá");
    expect(cuerpo.split("\n").length).toBe(4);
  });

  it("un borrador sin cuit ni total lo dice en vez de inventar", () => {
    const vacio: Borrador = { ...BORRADOR, cuit: null, nombreProveedor: null, totalCentavos: null, fechaIso: null };
    expect(cuerpo_borrador_ocr(vacio, true)).toBe(
      [
        "Leí tu comprobante:",
        "• Sin proveedor (CUIT sin leer) — confianza alta",
        "• Fecha sin leer — confianza media",
        "• Total sin leer — confianza baja",
        "Revisá los datos antes de confirmar.",
      ].join("\n"),
    );
  });

  it("los botones son exactamente Confirmar, Editar y Descartar con acción y borrador", () => {
    const payload = payload_borrador_ocr(BORRADOR, true);
    expect(payload.type).toBe("interactive");
    expect(payload.interactive.type).toBe("button");
    expect(payload.interactive.action.buttons.map((b) => b.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);
    expect(payload.interactive.action.buttons.map((b) => b.reply.id)).toEqual([
      "ocr:confirmar:borr-ocr-1",
      "ocr:editar:borr-ocr-1",
      "ocr:descartar:borr-ocr-1",
    ]);
    for (const b of payload.interactive.action.buttons) expect(b.reply.title.length).toBeLessThanOrEqual(20);
  });

  it("el mime decide si el adjunto es comprobante", () => {
    expect(es_comprobante_desde_mime("image/jpeg")).toBe(true);
    expect(es_comprobante_desde_mime("image/png")).toBe(true);
    expect(es_comprobante_desde_mime("application/pdf")).toBe(true);
    expect(es_comprobante_desde_mime("audio/ogg")).toBe(false);
    expect(es_comprobante_desde_mime("text/plain")).toBe(false);
    expect(es_comprobante_desde_mime(null)).toBe(false);
    expect(es_comprobante_desde_mime(undefined)).toBe(false);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

describe.skipIf(!hayPG)("OCR1-S5 el job y el borrador quedan en el tenant del número", () => {
  const jobIds: string[] = [];

  beforeEach(() => {
    process.env.TENANT_MODE = "multi";
    process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
    process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
  });

  afterEach(async () => {
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      for (const id of jobIds) await db.delete(ocrJobs).where(eq(ocrJobs.id, id));
    });
    jobIds.length = 0;
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("la fila del job vive en tenant-a y no en tenant-b", async () => {
    comercioVinculado("tenant-a");
    const r = await mandar(cargaAdjunto(nombreWamid(), "image", "image/jpeg"));
    expect(r.json["accion"]).toBe("ocr_borrador");
    const jobId = r.json["job_id"] as string;
    jobIds.push(jobId);

    const enA = await conTenant("tenant-a", async () => (await getTenantDb().select().from(ocrJobs)).map((f) => f.id));
    const enB = await conTenant("tenant-b", async () => (await getTenantDb().select().from(ocrJobs)).map((f) => f.id));
    expect(enA).toContain(jobId);
    expect(enB).not.toContain(jobId);
  });
});