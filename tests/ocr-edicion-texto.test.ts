import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { leerSesion } from "../src/lib/repos/whatsapp.js";
import {
  cuerpo_pedir_edicion_ocr,
  parsear_edicion_ocr,
  parche_de_edicion,
  payload_propuesta_edicion_ocr,
  RESPUESTA_OCR_CANCELADO,
  RESPUESTA_OCR_EDICION_INVALIDA,
  RESPUESTA_OCR_EDITAR_WEB,
  RESPUESTA_OCR_NO_ENTENDI,
  RESPUESTA_OCR_SOLO_DUENO,
} from "../src/modules/whatsapp/ocr-borrador.js";
import type { Borrador } from "../src/modules/purchases/facturas.js";

const SECRET = "edicion-ocr-secret";
const NUMERO = "5491100000000";
const EMPLEADO = "5491100000001";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-555";
const TENANT = "t-1";

// Sin total etiquetado el OCR deja el total sin leer, así que la edición por
// texto es la que lo completa y el cambio se observa.
const TEXTO_OCR_SIN_TOTAL = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\n";

let enviados: Record<string, unknown>[] = [];
let n = 0;

function nombreWamid(): string {
  n += 1;
  return `wamid-ed-${n}`;
}

function conCredenciales() {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
  process.env.OCR_PADDLE_ENDPOINT = ENDPOINT;
}

function stubRed(texto = TEXTO_OCR_SIN_TOTAL) {
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

function cargaTexto(wamid: string, texto: string, from = NUMERO): unknown {
  return {
    entry: [{ changes: [{ value: { messages: [{ id: wamid, from, timestamp: ts(), type: "text", text: { body: texto } }] } }] }],
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

function comercioVinculado(tenantId = TENANT) {
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

function empleadoVinculado(tenantId = TENANT) {
  control.memberships.set("m-2", { id: "m-2", tenantId, googleSub: "g-2", rol: "empleado", permisos: [], estado: "activo", puedeUsarBot: true });
  control.botLinks.set(`+${EMPLEADO}`, { tenantId, googleSub: "g-2", estado: "verificado" });
}

async function crearBorrador(texto = TEXTO_OCR_SIN_TOTAL, from = NUMERO): Promise<string> {
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

describe("FP3.3/ADR-0093 edición por texto del borrador OCR desde el bot", () => {
  it("Editar como Dueño abre la sesión y pide el campo con la lista", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_editar_pedido");
    expect(textoEnviado(ultimoEnviado())).toBe(cuerpo_pedir_edicion_ocr(store.borradores.get(borradorId)!));
    const sesion = await leerSesion(`+${NUMERO}`, Date.now(), TENANT);
    expect(sesion?.paso).toBe("ocr_editar");
    expect(sesion?.contexto["borradorId"]).toBe(borradorId);
  });

  it("el texto `monto 164800` propone el cambio con OK/Cancelar y no toca el borrador", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`));

    const r = await mandar(cargaTexto(nombreWamid(), "monto 164800"));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_edicion_propuesta");
    expect(r.json["campo"]).toBe("monto");
    const propuesta = ultimoEnviado();
    expect(cuerpoInteractivo(propuesta)).toBe("¿Cambio el total a $164.800?");
    expect(botones(propuesta).map((x) => x.reply.title)).toEqual(["OK", "Cancelar"]);
    expect(botones(propuesta).map((x) => x.reply.id)).toEqual([
      `ocr:aprobar:${borradorId}`,
      `ocr:cancelar:${borradorId}`,
    ]);
    expect(store.borradores.get(borradorId)?.totalCentavos).toBeNull();
    const sesion = await leerSesion(`+${NUMERO}`, Date.now(), TENANT);
    expect(sesion?.paso).toBe("ocr_editar_ok");
    expect(sesion?.contexto).toMatchObject({ borradorId, campo: "monto", valor: "164800" });
  });

  it("OK como Dueño aplica el total, registra el evento, cierra la sesión y manda el offer", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`));
    await mandar(cargaTexto(nombreWamid(), "monto 164800"));

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:aprobar:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_editado");
    expect(store.borradores.get(borradorId)?.totalCentavos).toBe(16480000n);
    const evento = store.ocrEventos.find((e) => e.tipo === "ocr_editado")?.payload as Record<string, unknown>;
    expect(evento).toEqual({ borrador_id: borradorId, campo: "monto" });
    expect((await leerSesion(`+${NUMERO}`, Date.now(), TENANT))?.paso).toBe("nada");
    const offer = ultimoEnviado();
    expect(cuerpoInteractivo(offer)).toContain("• Total $164.800 — confianza alta");
    expect(botones(offer).map((x) => x.reply.title)).toEqual(["Confirmar", "Editar", "Descartar"]);
  });

  it("Cancelar como Dueño no cambia el borrador y limpia la sesión", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`));
    await mandar(cargaTexto(nombreWamid(), "monto 164800"));

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:cancelar:${borradorId}`));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_edicion_cancelada");
    expect(textoEnviado(ultimoEnviado())).toBe(RESPUESTA_OCR_CANCELADO);
    expect(store.borradores.get(borradorId)?.totalCentavos).toBeNull();
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_editado")).toBe(false);
    expect((await leerSesion(`+${NUMERO}`, Date.now(), TENANT))?.paso).toBe("nada");
  });

  it("Editar como Empleado deriva a la web", async () => {
    comercioVinculado();
    empleadoVinculado();
    const borradorId = await crearBorrador(TEXTO_OCR_SIN_TOTAL, EMPLEADO);

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`, EMPLEADO));

    expect(r.json["accion"]).toBe("derivada_web");
    expect(textoEnviado(ultimoEnviado())).toBe(RESPUESTA_OCR_EDITAR_WEB);
  });

  it("aprobar como Empleado avisa que es solo del Dueño y no toca el borrador", async () => {
    comercioVinculado();
    empleadoVinculado();
    const borradorId = await crearBorrador(TEXTO_OCR_SIN_TOTAL, EMPLEADO);

    const r = await mandar(cargaBoton(nombreWamid(), `ocr:aprobar:${borradorId}`, EMPLEADO));

    expect(r.status).toBe(200);
    expect(r.json["respuesta"]).toBe(RESPUESTA_OCR_SOLO_DUENO);
    expect(textoEnviado(ultimoEnviado())).toBe(RESPUESTA_OCR_SOLO_DUENO);
    expect(store.borradores.get(borradorId)?.totalCentavos).toBeNull();
    expect(store.ocrEventos.some((e) => e.tipo === "ocr_editado")).toBe(false);
  });

  it("un texto sin sesión abierta no se intercepta: sigue el flujo normal", async () => {
    comercioVinculado();

    const r = await mandar(cargaTexto(nombreWamid(), "monto 164800"));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("consulta");
    expect(control.botConsultas.size).toBe(1);
    expect(enviados.some((e) => textoEnviado(e) === RESPUESTA_OCR_NO_ENTENDI)).toBe(false);
  });

  it("monto inválido responde el error y deja la sesión en `ocr_editar`", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`));

    const r = await mandar(cargaTexto(nombreWamid(), "monto abc"));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_edicion_error");
    expect(textoEnviado(ultimoEnviado())).toBe(RESPUESTA_OCR_EDICION_INVALIDA);
    expect((await leerSesion(`+${NUMERO}`, Date.now(), TENANT))?.paso).toBe("ocr_editar");
    expect(store.borradores.get(borradorId)?.totalCentavos).toBeNull();

    const valido = await mandar(cargaTexto(nombreWamid(), "monto 164800"));
    expect(valido.json["accion"]).toBe("ocr_edicion_propuesta");
  });

  it("un texto que no parsea pide el ejemplo y mantiene la sesión", async () => {
    comercioVinculado();
    const borradorId = await crearBorrador();
    await mandar(cargaBoton(nombreWamid(), `ocr:editar:${borradorId}`));

    const r = await mandar(cargaTexto(nombreWamid(), "hola"));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("ocr_edicion_no_entendida");
    expect(textoEnviado(ultimoEnviado())).toBe(RESPUESTA_OCR_NO_ENTENDI);
    expect((await leerSesion(`+${NUMERO}`, Date.now(), TENANT))?.paso).toBe("ocr_editar");
  });
});

const BASE: Borrador = {
  id: "borr-ed-1",
  idempotencyKey: "ocr-ed-1",
  origen: "wa",
  bytesRef: "wa-media:media-555",
  cuit: "20-93333172-6",
  nombreProveedor: "ACME SA",
  fechaIso: "2026-10-10",
  totalCentavos: 16480000n,
  items: [],
  confianza: { cuit: "media", fecha: "media", total: "media" },
  estado: "pendiente",
  fotoPendiente: true,
  confirmadoPor: null,
  facturaId: null,
  creadoEn: "2026-10-18T12:00:00.000Z",
  venceAt: "2026-10-25T12:00:00.000Z",
};

describe("FP3.3 parseo de la edición por texto (puro)", () => {
  it("parsear_edicion_ocr reconoce las cuatro claves y sus alias", () => {
    expect(parsear_edicion_ocr("monto 164800")).toEqual({ campo: "monto", valor: "164800" });
    expect(parsear_edicion_ocr("total 1.500,00")).toEqual({ campo: "monto", valor: "1.500,00" });
    expect(parsear_edicion_ocr("Monto 164800")).toEqual({ campo: "monto", valor: "164800" });
    expect(parsear_edicion_ocr("fecha 10/10/2026")).toEqual({ campo: "fecha", valor: "10/10/2026" });
    expect(parsear_edicion_ocr("proveedor ACME SA")).toEqual({ campo: "proveedor", valor: "ACME SA" });
    expect(parsear_edicion_ocr("cuit 20-12345678-6")).toEqual({ campo: "cuit", valor: "20-12345678-6" });
    expect(parsear_edicion_ocr("  monto   164800  ")).toEqual({ campo: "monto", valor: "164800" });
  });

  it("parsear_edicion_ocr rechaza lo que no es `campo valor`", () => {
    expect(parsear_edicion_ocr("")).toBeNull();
    expect(parsear_edicion_ocr("monto")).toBeNull();
    expect(parsear_edicion_ocr("hola 123")).toBeNull();
    expect(parsear_edicion_ocr("monto   ")).toBeNull();
  });

  it("parche_de_edicion mapea cada campo a su ParcheBorrador", () => {
    expect(parche_de_edicion({ campo: "monto", valor: "164800" })).toEqual({ totalTexto: "164800" });
    expect(parche_de_edicion({ campo: "fecha", valor: "10/10/2026" })).toEqual({ fechaTexto: "10/10/2026" });
    expect(parche_de_edicion({ campo: "proveedor", valor: "ACME SA" })).toEqual({ nombreProveedor: "ACME SA" });
    expect(parche_de_edicion({ campo: "cuit", valor: "20-12345678-6" })).toEqual({ cuitTexto: "20-12345678-6" });
  });

  it("la propuesta muestra el valor ya formateado del borrador editado", () => {
    const monto = payload_propuesta_edicion_ocr({ campo: "monto", valor: "164800" }, BASE);
    expect(monto.interactive.body.text).toBe("¿Cambio el total a $164.800?");
    expect(monto.interactive.action.buttons.map((b) => b.reply.title)).toEqual(["OK", "Cancelar"]);

    const fecha = payload_propuesta_edicion_ocr({ campo: "fecha", valor: "11/10/2026" }, { ...BASE, fechaIso: "2026-10-11" });
    expect(fecha.interactive.body.text).toBe("¿Cambio la fecha a 2026-10-11?");

    const cuit = payload_propuesta_edicion_ocr({ campo: "cuit", valor: "20123456786" }, { ...BASE, cuit: "20123456786" });
    expect(cuit.interactive.body.text).toBe("¿Cambio el CUIT a 20-12345678-6?");
  });
});
