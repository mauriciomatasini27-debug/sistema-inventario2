import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { tenantPorDefecto } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { POST as postDecidir } from "../src/pages/api/suppliers/contactos/decidir.js";
import {
  CUPO_PROV_MENSAJES,
  CUPO_PROV_VENTANA_MIN,
  RESPUESTA_PROV_CUPO,
  RESPUESTA_PROV_FACTURA,
  evaluar_cupo_proveedor,
  type EstadoContactoProveedor,
} from "../src/modules/whatsapp/proveedor.js";
import { RESPUESTA_NO_VINCULADO } from "../src/modules/whatsapp/resolucion.js";

const SECRET = "prov-e4-secret";
const NUM = "5491100000002";
const DUENO_NUM = "5491100000099";
const PNID = "123456";
const TOKEN = "tok-opaco";
const ENDPOINT = "http://paddle.interno-privado:8080";
const MEDIA_ID = "media-prov-e4";
const TEXTO_OCR = "FACTURA\nCUIT 20-93333172-6\nFecha 10/10/2026\nTotal $ 164.800,00\n";
const TENANT = tenantPorDefecto();
const DUENO = "prov-e4-dueno";
const AHORA = new Date("2026-10-19T12:00:00.000Z");

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

function cargaAdjunto(wamid: string, from = NUM, id = MEDIA_ID): unknown {
  return {
    entry: [
      {
        changes: [
          { value: { messages: [{ id: wamid, from, timestamp: ts(), type: "image", image: { id, mime_type: "image/jpeg" } }] } },
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
  return `wamid-prov-e4-${n}-${Math.floor(Math.random() * 1e6)}`;
}

function contacto(estado: EstadoContactoProveedor, tenantId = TENANT, numero = NUM) {
  control.proveedorContactos.set(`+${numero}`, {
    numeroE164: `+${numero}`,
    tenantId,
    supplierCuit: null,
    estado,
    creadoEn: new Date().toISOString(),
  });
}

function cuerpoTexto(i: number): string {
  const text = enviados[i]?.["text"];
  return typeof text === "object" && text !== null ? String((text as { body?: unknown }).body) : "";
}

function destino(i: number): string {
  return String(enviados[i]?.["to"] ?? "");
}

function sembrarDueno() {
  control.tenants.set(TENANT, {
    id: TENANT,
    nombreComercio: "Kiosco PROV E4",
    slug: `kiosco-prov-e4-${TENANT}`,
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: DUENO,
    esDemo: false,
  });
  control.memberships.set(`m-${TENANT}-${DUENO}`, {
    id: `m-${TENANT}-${DUENO}`,
    tenantId: TENANT,
    googleSub: DUENO,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.botLinks.set(`+${DUENO_NUM}`, { tenantId: TENANT, googleSub: DUENO, estado: "verificado" });
}

function sesionDueno(): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: DUENO, tenantId: TENANT, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: DUENO,
    tenantId: TENANT,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

async function decidir(estado: "verificado" | "revocado", numero = `+${NUM}`) {
  return (await postDecidir(
    ctx("http://x/api/suppliers/contactos/decidir", {
      method: "POST",
      body: { numero, estado },
      headers: { cookie: `__Host-sesion=${sesionDueno()}` },
    }),
  )) as Response;
}

async function reLlenarCupo() {
  for (let i = 0; i < CUPO_PROV_MENSAJES; i += 1) {
    const r = await mandar(cargaTexto(wamid(), "hola"));
    expect(r.json["accion"]).toBe("prov_factura_pedida");
  }
}

async function llenarCupo(accion: string) {
  for (let i = 0; i < CUPO_PROV_MENSAJES; i += 1) {
    const r = await mandar(cargaTexto(wamid(), "hola"));
    expect(r.json["accion"]).toBe(accion);
  }
  expect(enviados.length).toBe(CUPO_PROV_MENSAJES);
}

beforeEach(() => {
  resetStore();
  enviados = [];
  conCredenciales();
  stubRed();
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.OCR_PADDLE_ENDPOINT;
});

describe("PROV-S11 cupo por número", () => {
  it("atiende el cupo, corta el siguiente con adjunto y no amplifica el spam", async () => {
    contacto("verificado");
    await llenarCupo("prov_factura_pedida");

    const bloqueado = await mandar(cargaAdjunto(wamid()));
    expect(bloqueado.json).toMatchObject({ ok: true, accion: "prov_cupo_excedido", enviado: true });
    expect(store.ocrJobs.size).toBe(0);
    expect(store.borradores.size).toBe(0);
    expect(enviados.length).toBe(CUPO_PROV_MENSAJES + 1);
    expect(cuerpoTexto(enviados.length - 1)).toBe(RESPUESTA_PROV_CUPO);

    const antes = enviados.length;
    const repetido = await mandar(cargaAdjunto(wamid()));
    expect(repetido.json).toMatchObject({ ok: true, accion: "prov_cupo_excedido", enviado: false });
    expect(enviados.length).toBe(antes);
    expect(store.ocrJobs.size).toBe(0);
  });

  it("se repone al correr la ventana", async () => {
    contacto("verificado");
    await llenarCupo("prov_factura_pedida");
    const bloqueado = await mandar(cargaTexto(wamid(), "hola"));
    expect(bloqueado.json["accion"]).toBe("prov_cupo_excedido");

    vi.setSystemTime(new Date(AHORA.getTime() + CUPO_PROV_VENTANA_MIN * 60_000));
    const repuesto = await mandar(cargaTexto(wamid(), "hola"));
    expect(repuesto.json["accion"]).toBe("prov_factura_pedida");
    expect(cuerpoTexto(enviados.length - 1)).toBe(RESPUESTA_PROV_FACTURA);
  });

  it("un corte nuevo después de reponerse vuelve a avisar una vez", async () => {
    contacto("verificado");
    await llenarCupo("prov_factura_pedida");
    expect((await mandar(cargaTexto(wamid(), "hola"))).json["enviado"]).toBe(true);

    vi.setSystemTime(new Date(AHORA.getTime() + CUPO_PROV_VENTANA_MIN * 60_000));
    await reLlenarCupo();
    const otraVez = await mandar(cargaTexto(wamid(), "hola"));
    expect(otraVez.json).toMatchObject({ accion: "prov_cupo_excedido", enviado: true });
    expect(cuerpoTexto(enviados.length - 1)).toBe(RESPUESTA_PROV_CUPO);
  });

  it("el Dueño re-aprueba y el próximo mensaje se atiende sin esperar", async () => {
    sembrarDueno();
    contacto("verificado");
    await llenarCupo("prov_factura_pedida");
    const bloqueado = await mandar(cargaTexto(wamid(), "hola"));
    expect(bloqueado.json["accion"]).toBe("prov_cupo_excedido");

    const r = await decidir("verificado");
    expect(r.status).toBe(200);
    expect(control.proveedorCupo.size).toBe(0);

    const habilitado = await mandar(cargaTexto(wamid(), "hola"));
    expect(habilitado.json["accion"]).toBe("prov_factura_pedida");
  });

  it("un pendiente también tiene cupo", async () => {
    contacto("pendiente");
    await llenarCupo("prov_pendiente");

    const bloqueado = await mandar(cargaTexto(wamid(), "hola"));
    expect(bloqueado.json).toMatchObject({ ok: true, accion: "prov_cupo_excedido", enviado: true });
    expect(cuerpoTexto(enviados.length - 1)).toBe(RESPUESTA_PROV_CUPO);
  });

  it("un mensaje PROV de un contacto existente también consume cupo", async () => {
    contacto("verificado");
    await llenarCupo("prov_factura_pedida");

    const bloqueado = await mandar(cargaTexto(wamid(), "PROV 123456"));
    expect(bloqueado.json["accion"]).toBe("prov_cupo_excedido");
  });

  it("un revocado no consume cupo", async () => {
    contacto("revocado");
    for (let i = 0; i < CUPO_PROV_MENSAJES + 5; i += 1) {
      const r = await mandar(cargaTexto(wamid(), "hola"));
      expect(r.json["accion"]).toBe("consulta");
    }
    expect(control.proveedorCupo.size).toBe(0);
  });
});

describe("PROV-S12 un contacto revocado queda como no vinculado", () => {
  it("con adjunto responde el genérico, sin job, borrador ni aviso al Dueño", async () => {
    sembrarDueno();
    contacto("revocado");

    const r = await mandar(cargaAdjunto(wamid()));
    expect(r.json["accion"]).toBe("consulta");
    expect(r.json["respuesta"]).toBe(RESPUESTA_NO_VINCULADO);
    expect(store.ocrJobs.size).toBe(0);
    expect(store.borradores.size).toBe(0);
    expect(enviados.length).toBe(1);
    expect(destino(0)).toBe(`+${NUM}`);
    expect(cuerpoTexto(0)).toBe(RESPUESTA_NO_VINCULADO);
    expect(control.proveedorContactos.get(`+${NUM}`)?.estado).toBe("revocado");
  });

  it("revocado vía decidir y después un mensaje recibe el genérico", async () => {
    sembrarDueno();
    contacto("verificado");
    const r = await decidir("revocado");
    expect(r.status).toBe(200);
    expect(control.proveedorContactos.get(`+${NUM}`)?.estado).toBe("revocado");

    const mensaje = await mandar(cargaAdjunto(wamid()));
    expect(mensaje.json["accion"]).toBe("consulta");
    expect(mensaje.json["respuesta"]).toBe(RESPUESTA_NO_VINCULADO);
    expect(store.ocrJobs.size).toBe(0);
    expect(store.borradores.size).toBe(0);
    expect(enviados.length).toBe(1);
    expect(destino(0)).toBe(`+${NUM}`);
  });
});

describe("PROV-E4 evaluar_cupo_proveedor", () => {
  it("con lugar agrega la marca y no marca reposición", () => {
    expect(evaluar_cupo_proveedor({ marcasMs: [], ahoraMs: 1_000 })).toEqual({
      permitido: true,
      marcasMs: [1_000],
      reponeEnMs: null,
    });
  });

  it("sin lugar devuelve las marcas vigentes y cuándo se libera un lugar", () => {
    const marcas = Array.from({ length: CUPO_PROV_MENSAJES }, (_, i) => 1_000 + i * 100);
    const r = evaluar_cupo_proveedor({ marcasMs: marcas, ahoraMs: 5_000 });
    expect(r.permitido).toBe(false);
    expect(r.marcasMs).toEqual(marcas);
    expect(r.reponeEnMs).toBe(1_000 + CUPO_PROV_VENTANA_MIN * 60_000);
  });

  it("el borde exacto de la ventana ya no cuenta", () => {
    const ventana = CUPO_PROV_VENTANA_MIN * 60_000;
    const r = evaluar_cupo_proveedor({
      marcasMs: [0, 1],
      ahoraMs: ventana,
      cupo: 2,
      ventanaMs: ventana,
    });
    expect(r).toEqual({ permitido: true, marcasMs: [1, ventana], reponeEnMs: null });
  });

  it("un mensaje rechazado no agrega marca", () => {
    const marcas = [10, 20];
    const r = evaluar_cupo_proveedor({ marcasMs: marcas, ahoraMs: 30, cupo: 2, ventanaMs: 1_000 });
    expect(r.permitido).toBe(false);
    expect(r.marcasMs).toEqual(marcas);
  });
});
