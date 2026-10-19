import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { sha256Hex } from "../src/modules/auth/sesiones.js";
import {
  RESPUESTA_PROV_CODIGO_INVALIDO,
  RESPUESTA_PROV_RECIBIDO,
} from "../src/modules/whatsapp/proveedor.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";

const SECRET = "prov-inv-secret";
const NUM = "5491100000001";
const PNID = "123456";
const TOKEN = "tok-opaco";

let enviados: Record<string, unknown>[] = [];
let n = 0;

function conCredenciales() {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
}

// Red falsa: los recibos de leído no cuentan; el resto de los envíos se captura.
function stubRed() {
  vi.stubGlobal("fetch", async (_entrada: unknown, init: { body?: string } = {}) => {
    const cuerpo = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
    if (cuerpo["status"] === "read") return new Response("{}", { status: 200 });
    enviados.push(cuerpo);
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${enviados.length}` }] }), {
      headers: { "content-type": "application/json" },
    });
  });
}

function cargaTexto(wamid: string, texto: string, from = NUM): unknown {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [{ id: wamid, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: texto } }],
            },
          },
        ],
      },
    ],
  };
}

async function mandar(texto: string, from = NUM) {
  n += 1;
  const raw = JSON.stringify(cargaTexto(`wamid-prov-${n}`, texto, from));
  const firma = `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
  const res = (await postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }),
  )) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function comercio(tenantId = "t-1") {
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
  control.memberships.set(`m-${tenantId}`, {
    id: `m-${tenantId}`,
    tenantId,
    googleSub: "g-1",
    rol: "dueno",
    permisos: [],
    estado: "activo",
    puedeUsarBot: true,
  });
}

function sembrarInvitacion(codigo: string, over: Partial<{ tenantId: string; expiraEn: number; usado: boolean }> = {}) {
  const codigoHash = sha256Hex(codigo);
  control.proveedorInvitaciones.set(codigoHash, {
    tenantId: "t-1",
    supplierCuit: null,
    codigoHash,
    expiraEn: Date.now() + 60_000,
    usado: false,
    ...over,
  });
  return codigoHash;
}

function textoEnviado(i = 0): string {
  return (enviados[i]!["text"] as { body: string }).body;
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
});

describe("PROV-S2 el código válido ata el teléfono y lo deja pendiente", () => {
  it("crea el contacto pendiente del comercio y responde pidiendo la factura", async () => {
    comercio("t-1");
    const hash = sembrarInvitacion("123456");
    const r = await mandar("PROV 123456");

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("prov_invitado");
    expect(control.proveedorContactos.get(`+${NUM}`)).toMatchObject({
      numeroE164: `+${NUM}`,
      tenantId: "t-1",
      supplierCuit: null,
      estado: "pendiente",
    });
    expect(control.proveedorInvitaciones.get(hash)?.usado).toBe(true);
    expect(textoEnviado()).toBe(RESPUESTA_PROV_RECIBIDO);
  });

  it("un segundo uso del mismo código no ata nada y responde el genérico", async () => {
    comercio("t-1");
    sembrarInvitacion("123456");
    await mandar("PROV 123456");
    const antes = control.proveedorContactos.get(`+${NUM}`);

    const r = await mandar("PROV 123456");
    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("prov_codigo_invalido");
    expect(r.json["motivo"]).toBe("usado");
    expect(control.proveedorContactos.get(`+${NUM}`)).toEqual(antes);
    expect(control.proveedorContactos.size).toBe(1);
    expect(textoEnviado(1)).toBe(RESPUESTA_PROV_CODIGO_INVALIDO);
  });
});

describe("PROV-S3 un código inválido o vencido no ata nada", () => {
  it("sin invitación responde el genérico y no crea contacto", async () => {
    comercio("t-1");
    const r = await mandar("PROV 999999");
    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("prov_codigo_invalido");
    expect(r.json["motivo"]).toBe("codigo_invalido");
    expect(control.proveedorContactos.size).toBe(0);
    expect(textoEnviado()).toBe(RESPUESTA_PROV_CODIGO_INVALIDO);
  });

  it("una invitación vencida no ata y no se marca usada", async () => {
    comercio("t-1");
    const hash = sembrarInvitacion("123456", { expiraEn: Date.now() - 1 });
    const r = await mandar("PROV 123456");
    expect(r.json["accion"]).toBe("prov_codigo_invalido");
    expect(r.json["motivo"]).toBe("vencido");
    expect(control.proveedorContactos.size).toBe(0);
    expect(control.proveedorInvitaciones.get(hash)?.usado).toBe(false);
  });
});

describe("PROV un número ata a un solo comercio", () => {
  it("si ya es proveedor verificado de otro comercio no se reasigna", async () => {
    comercio("t-1");
    comercio("t-2");
    control.proveedorContactos.set(`+${NUM}`, {
      numeroE164: `+${NUM}`,
      tenantId: "t-2",
      supplierCuit: null,
      estado: "verificado",
      creadoEn: new Date().toISOString(),
    });
    const hash = sembrarInvitacion("123456");
    const r = await mandar("PROV 123456");

    expect(r.json["accion"]).toBe("prov_codigo_invalido");
    expect(r.json["motivo"]).toBe("numero_ocupado");
    expect(control.proveedorContactos.get(`+${NUM}`)?.tenantId).toBe("t-2");
    expect(control.proveedorContactos.get(`+${NUM}`)?.estado).toBe("verificado");
    expect(control.proveedorInvitaciones.get(hash)?.usado).toBe(false);
  });
});
