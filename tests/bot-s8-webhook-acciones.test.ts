import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { guardarModulosBot } from "../src/lib/repos/bot-modulos.js";
import { MENSAJE_MODULO_APAGADO } from "../src/modules/bot/modulos-rubro.js";

const SECRET = "bot-s8-webhook-secret";
const NUMERO = "5491100000000";
const EMPLEADO = "5491100000001";
const PNID = "123456";
const TOKEN = "tok-opaco";
const CUIT = "20-93333172-6";
const DIA = 86_400_000;

let enviados: Array<Record<string, unknown>> = [];
let n = 0;

function wamid(): string {
  n += 1;
  return `wamid-s8-${n}`;
}

function conCredenciales(): void {
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_PHONE_NUMBER_ID = PNID;
  process.env.WHATSAPP_TOKEN = TOKEN;
  vi.stubGlobal("fetch", async (_entrada: unknown, init: { body?: string } = {}) => {
    const cuerpo = JSON.parse(init.body ?? "{}") as Record<string, unknown>;
    if (cuerpo["status"] === "read") return new Response("{}", { status: 200 });
    if (typeof cuerpo["to"] === "string") {
      enviados.push(cuerpo);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${enviados.length}` }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 200 });
  });
}

function ts(): string {
  return String(Math.floor(Date.now() / 1000));
}

function cargaBoton(botonId: string, wamidEntrante: string, from = NUMERO): unknown {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: wamidEntrante,
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

async function mandar(carga: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = JSON.stringify(carga);
  const firma = `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
  const res = (await postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma }, body: raw }),
  )) as Response;
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

function comercioVinculado(): void {
  control.tenants.set("t-1", {
    id: "t-1",
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-1",
    esDemo: false,
  });
  control.memberships.set("m-1", { id: "m-1", tenantId: "t-1", googleSub: "g-1", rol: "dueno", permisos: [], estado: "activo", puedeUsarBot: true });
  control.botLinks.set(`+${NUMERO}`, { tenantId: "t-1", googleSub: "g-1", estado: "verificado" });
}

function empleadoVinculado(): void {
  control.memberships.set("m-2", { id: "m-2", tenantId: "t-1", googleSub: "g-2", rol: "empleado", permisos: [], estado: "activo", puedeUsarBot: true });
  control.botLinks.set(`+${EMPLEADO}`, { tenantId: "t-1", googleSub: "g-2", estado: "verificado" });
}

function proveedorGolosinas(): void {
  store.suppliers.set("sup-20933331726", {
    id: "sup-20933331726",
    cuit: CUIT,
    nombre: "Golosinas Sur",
    email: null,
    telefono: null,
    activo: true,
    creadoEn: "2026-01-01T00:00:00.000Z",
    actualizadoEn: "2026-01-01T00:00:00.000Z",
  });
}

function ultimoTexto(): string {
  const ultimo = enviados[enviados.length - 1]!;
  return (ultimo["text"] as { body: string }).body;
}

beforeEach(() => {
  resetStore();
  enviados = [];
  conCredenciales();
  comercioVinculado();
  proveedorGolosinas();
  store.stock.set("demo-sku-1", 0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
});

describe("BOT-S8 toque de botón de una acción propuesta", () => {
  it("reponer crea un borrador al proveedor y responde el resumen, sin escribirle al proveedor", async () => {
    const r = await mandar(cargaBoton("acc:reponer:demo-sku-1", wamid()));

    expect(r.status).toBe(200);
    expect(r.json["accion"]).toBe("accion_reponer_borrador");
    expect(store.purchaseOrders.size).toBe(1);
    const orden = [...store.purchaseOrders.values()][0]!;
    expect(orden.estado).toBe("abierta");
    expect(orden.supplierCuit).toBe("20933331726");
    expect(orden.lineas).toEqual([{ sku: "demo-sku-1", qty: 15, costoCentavos: 15_000n }]);

    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.["to"]).toBe(`+${NUMERO}`);
    expect(ultimoTexto()).toContain("Armé un borrador de pedido a Golosinas Sur");
    expect(ultimoTexto()).toContain("No se envió nada");
    expect(r.json["reusado"]).toBe(false);
  });

  it("el mismo wamid repetido no crea un segundo borrador", async () => {
    const id = wamid();
    await mandar(cargaBoton("acc:reponer:demo-sku-1", id));
    const segunda = await mandar(cargaBoton("acc:reponer:demo-sku-1", id));

    expect(segunda.json["duplicado"]).toBe(true);
    expect(store.purchaseOrders.size).toBe(1);
  });

  it("un segundo toque del mismo producto reutiliza el borrador abierto", async () => {
    await mandar(cargaBoton("acc:reponer:demo-sku-1", wamid()));
    const segunda = await mandar(cargaBoton("acc:reponer:demo-sku-1", wamid()));

    expect(segunda.json["accion"]).toBe("accion_reponer_borrador");
    expect(segunda.json["reusado"]).toBe(true);
    expect(ultimoTexto()).toContain("Ya tenías el borrador");
    expect(store.purchaseOrders.size).toBe(1);
  });

  it("sin proveedor por nombre y con más de un proveedor activo no adivina: deriva al panel y no crea nada", async () => {
    store.suppliers.set("sup-20933331726", { ...store.suppliers.get("sup-20933331726")!, nombre: "Golosinas Centro" });
    store.suppliers.set("sup-20111111112", {
      id: "sup-20111111112",
      cuit: "20-11111111-2",
      nombre: "Bebidas Norte",
      email: null,
      telefono: null,
      activo: true,
      creadoEn: "2026-01-01T00:00:00.000Z",
      actualizadoEn: "2026-01-01T00:00:00.000Z",
    });
    const r = await mandar(cargaBoton("acc:reponer:demo-sku-1", wamid()));

    expect(r.json["accion"]).toBe("accion_sin_proveedor");
    expect(ultimoTexto()).toContain("panel de proveedores");
    expect(store.purchaseOrders.size).toBe(0);
  });

  it("módulo rotacion apagado responde no disponible y no crea nada", async () => {
    await guardarModulosBot("t-1", ["cobranza"]);
    const r = await mandar(cargaBoton("acc:reponer:demo-sku-1", wamid()));

    expect(r.json["accion"]).toBe("accion_modulo_apagado");
    expect(ultimoTexto()).toBe(MENSAJE_MODULO_APAGADO);
    expect(store.purchaseOrders.size).toBe(0);
  });

  it("solo el Dueño puede armar el borrador", async () => {
    empleadoVinculado();
    const r = await mandar(cargaBoton("acc:reponer:demo-sku-1", wamid(), EMPLEADO));

    expect(r.json["accion"]).toBe("accion_sin_permiso");
    expect(store.purchaseOrders.size).toBe(0);
  });

  it("ref inexistente responde corto y sin efectos", async () => {
    const r = await mandar(cargaBoton("acc:reponer:no-existe", wamid()));

    expect(r.json["accion"]).toBe("accion_invalida");
    expect(store.purchaseOrders.size).toBe(0);
  });

  it("cobrar manda el recordatorio al Dueño y nunca le escribe al cliente", async () => {
    store.creditMovs.push({ customer_id: "cli-1", debe: "1200000", haber: "0", key: "k1", fecha_ms: Date.now() - 20 * DIA });
    const r = await mandar(cargaBoton("acc:cobrar:cli-1", wamid()));

    expect(r.json["accion"]).toBe("accion_cobrar_recordatorio");
    expect(enviados).toHaveLength(1);
    expect(enviados[0]?.["to"]).toBe(`+${NUMERO}`);
    expect(ultimoTexto()).toContain("Hola cli-1");
    expect(ultimoTexto()).toContain("saldo pendiente");
  });

  it("cobrar con módulo cobranza apagado no responde el recordatorio", async () => {
    store.creditMovs.push({ customer_id: "cli-1", debe: "1200000", haber: "0", key: "k1", fecha_ms: Date.now() - 20 * DIA });
    await guardarModulosBot("t-1", ["rotacion"]);
    const r = await mandar(cargaBoton("acc:cobrar:cli-1", wamid()));

    expect(r.json["accion"]).toBe("accion_modulo_apagado");
    expect(ultimoTexto()).toBe(MENSAJE_MODULO_APAGADO);
  });
});
