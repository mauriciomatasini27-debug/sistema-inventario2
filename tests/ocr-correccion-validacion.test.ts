import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import {
  avisos_borrador_ocr,
  cuerpo_borrador_ocr,
  propuesta_correccion_total,
  RESPUESTA_OCR_BOTON_INVALIDO,
  RESPUESTA_OCR_CORREGIDO,
  RESPUESTA_OCR_SOLO_DUENO,
  type PropuestaCorreccionOcr,
} from "../src/modules/whatsapp/ocr-borrador.js";
import type { Borrador, ItemBorrador } from "../src/modules/purchases/facturas.js";

const SECRET = "correccion-ocr-secret";
const NUMERO = "5491100000000";
const EMPLEADO = "5491100000001";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-901";

const TEXTO_OCR = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";
const TEXTO_OCR_CON_ITEMS =
  "FACTURA\nCUIT 20-93333172-6\nTotal $ 164.800,00\nFecha 10/10/2026\n2 x Yerba 5000,00\n3 YERBA 1500,00\n";

const ITEMS: ReadonlyArray<ItemBorrador> = [
  { sku: null, cantidad: 2, subtotalCentavos: 500000n },
  { sku: null, cantidad: 3, subtotalCentavos: 150000n },
];

const AHORA = "2026-10-18T12:00:00.000Z";

const BASE: Borrador = {
  id: "borr-ocr-corr",
  idempotencyKey: "ocr-corr",
  origen: "wa",
  bytesRef: "wa-media:media-901",
  cuit: "20-93333172-6",
  nombreProveedor: "ACME SA",
  fechaIso: "2026-10-10",
  totalCentavos: 16480000n,
  items: ITEMS,
  confianza: { cuit: "media", fecha: "media", total: "media" },
  estado: "pendiente",
  fotoPendiente: true,
  confirmadoPor: null,
  facturaId: null,
  creadoEn: "2026-10-18T12:00:00.000Z",
  venceAt: "2026-10-25T12:00:00.000Z",
};

let enviados: Record<string, unknown>[] = [];
let n = 0;

function nombreWamid(): string {
  n += 1;
  return `wamid-corr-${n}`;
}

function conCredenciales() {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

function stubRed(texto = TEXTO_OCR_CON_ITEMS) {
  vi.stubGlobal("fetch", async (entrada: unknown, init: { body?: string } = {}) => {
    const url = String(entrada);
    if (url.startsWith(ENDPOINT)) {
      return new Response(JSON.stringify({ texto, confianza: 0.9 }), {
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

function cargaAdjunto(wamid: string, from = NUMERO): unknown {
  return {
    entry: [{ changes: [{ value: { messages: [{ id: wamid, from, timestamp: ts(), type: "image", image: { id: MEDIA_ID, mime_type: "image/jpeg" } }] } }] }],
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

function empleadoVinculado(tenantId = "t-1") {
  control.memberships.set("m-2", { id: "m-2", tenantId, googleSub: "g-2", rol: "empleado", permisos: [], estado: "activo", puedeUsarBot: true });
  control.botLinks.set(`+${EMPLEADO}`, { tenantId, googleSub: "g-2", estado: "verificado" });
}

async function crearBorrador(texto = TEXTO_OCR_CON_ITEMS, from = NUMERO): Promise<string> {
  stubRed(texto);
  const r = await mandar(cargaAdjunto(nombreWamid(), from));
  expect(r.json["accion"]).toBe("ocr_borrador");
  return r.json["borrador_id"] as string;
}

function ultimoEnviado(): Record<string, unknown> {
  return enviados[enviados.length - 1]!;
}

function textoEnviado(e: Record<string, unknown>): string {
  return (e["text"] as { body: string }).body;
}

function cuerpoInteractivo(e: Record<string, unknown>): string {
  return (e["interactive"] as { body: { text: string } }).body.text;
}

function botones(e: Record<string, unknown>): Array<{ reply: { id: string; title: string } }> {
  return (e["interactive"] as { action: { buttons: Array<{ reply: { id: string; title: string } }> } }).action.buttons;
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

describe("AU10.4/ADR-0093 la corrección del total la aprueba el Dueño", () => {
  it("el borrador con ítems que no cuadran propone corregir el total", async () => {
    comercioVinculado();

    const r = await mandar(cargaAdjunto(nombreWamid()));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_borrador");
    const borradorId = r.json["borrador_id"] as string;
    const b = store.borradores.get(borradorId);
    expect(b?.items).toEqual(ITEMS);
    expect(b?.totalCentavos).toBe(16480000n);

    const propuesta = ultimoEnviado();
    expect(cuerpoInteractivo(propuesta)).toBe(
      "La suma de los ítems ($6.500) no coincide con el total ($164.800). ¿Corrijo el total a $6.500?",
    );
    expect(botones(propuesta).map((x) => x.reply.title)).toEqual(["Sí, corregir", "No, dejarlo"]);
    expect(botones(propuesta).map((x) => x.reply.id)).toEqual([
      `ocr:corregir:${borradorId}`,
      `ocr:omitir:${borradorId}`,
    ]);
  });

  it("corregir como Dueño deja el total en la suma y manda el offer normal", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:corregir:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_corregido");
    expect(store.borradores.get(borradorId)?.totalCentavos).toBe(650000n);
    const evento = store.ocrEventos.find((e) => e.tipo === "ocr_corregido")?.payload as Record<string, unknown>;
    expect(evento).toMatchObject({ borrador_id: borradorId, motivo: "validacion" });
    expect(enviados.some((e) => e["type"] === "text" && textoEnviado(e) === RESPUESTA_OCR_CORREGIDO)).toBe(true);

    const offer = ultimoEnviado();
    expect(cuerpoInteractivo(offer)).toContain("• Total $6.500 — confianza alta");
    expect(botones(offer).map((x) => x.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);
  });

  it("corregir como Empleado avisa y deja el borrador intacto", async () => {
    comercioVinculado();
    empleadoVinculado();
    const borradorId = await crearBorrador(TEXTO_OCR_CON_ITEMS, EMPLEADO);

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:corregir:${borradorId}`, EMPLEADO));

    expect(r.status).toBe(200);
    expect(r.json["respuesta"]).toBe(RESPUESTA_OCR_SOLO_DUENO);
    expect(textoEnviado(ultimoEnviado())).toBe(RESPUESTA_OCR_SOLO_DUENO);
    expect(store.borradores.get(borradorId)?.totalCentavos).toBe(16480000n);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_corregido")).toBe(false);
  });

  it("omitir manda el offer normal sin cambiar el total", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:omitir:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_correccion_omitida");
    expect(store.borradores.get(borradorId)?.totalCentavos).toBe(16480000n);
    const offer = ultimoEnviado();
    expect(cuerpoInteractivo(offer)).toContain("• Total $164.800");
    expect(botones(offer).map((x) => x.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);
  });

  it("corregir sobre un borrador sin propuesta responde el botón inválido", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador(TEXTO_OCR);
    expect(botones(ultimoEnviado()).map((x) => x.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:corregir:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_corregido_error");
    expect(textoEnviado(ultimoEnviado())).toBe(RESPUESTA_OCR_BOTON_INVALIDO);
    expect(store.borradores.get(borradorId)?.totalCentavos).toBe(16480000n);
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_corregido")).toBe(false);
  });

  it("el OCR sin ítems no dispara propuesta", async () => {
    comercioVinculado();

    await crearBorrador(TEXTO_OCR);

    expect(botones(ultimoEnviado()).map((x) => x.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);
    expect(cuerpoInteractivo(ultimoEnviado())).not.toContain("no coincide");
  });
});

describe("propuesta_correccion_total y avisos (puro)", () => {
  it("propone la suma cuando la diferencia supera la tolerancia del 1%", () => {
    const p: PropuestaCorreccionOcr | null = propuesta_correccion_total(BASE);
    expect(p).toEqual({ totalPropuestoCentavos: 650000n });
  });

  it("no propone si la suma cuadra, no hay ítems o el total no es positivo", () => {
    expect(propuesta_correccion_total({ ...BASE, totalCentavos: 650000n })).toBeNull();
    expect(propuesta_correccion_total({ ...BASE, items: [] })).toBeNull();
    expect(propuesta_correccion_total({ ...BASE, totalCentavos: 0n })).toBeNull();
    expect(propuesta_correccion_total({ ...BASE, totalCentavos: null })).toBeNull();
  });

  it("avisa fecha futura, fecha vieja, total no positivo y CUIT inválido", () => {
    expect(avisos_borrador_ocr({ ...BASE, fechaIso: "2026-10-20" }, AHORA)).toEqual([
      "La fecha del comprobante está en el futuro.",
    ]);
    expect(avisos_borrador_ocr({ ...BASE, fechaIso: "2024-10-01" }, AHORA)).toEqual([
      "La fecha del comprobante es de hace más de un año.",
    ]);
    expect(avisos_borrador_ocr({ ...BASE, totalCentavos: 0n }, AHORA)).toEqual([
      "El total del comprobante no es positivo.",
    ]);
    expect(avisos_borrador_ocr({ ...BASE, cuit: "20-1" }, AHORA)).toEqual([
      "El CUIT del comprobante no es válido.",
    ]);
    expect(avisos_borrador_ocr(BASE, AHORA)).toEqual([]);
  });

  it("el cuerpo anexa los avisos al final", () => {
    const cuerpo = cuerpo_borrador_ocr({ ...BASE, fechaIso: "2024-10-01", totalCentavos: 0n }, false, AHORA);
    expect(cuerpo).toBe(
      [
        "Leí tu comprobante:",
        "• ACME SA (CUIT 20-93333172-6) — confianza media",
        "• Fecha 2024-10-01 — confianza media",
        "• Total $0 — confianza media",
        "La fecha del comprobante es de hace más de un año.",
        "El total del comprobante no es positivo.",
      ].join("\n"),
    );
  });
});
