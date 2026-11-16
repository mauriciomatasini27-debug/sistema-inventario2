import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import {
  ZONA_DEFECTO,
  PLANTILLA_RESUMEN_MENSUAL,
  armar_snapshot_mensual,
  ejecutar_resumen_mensual,
  limpiar_corridas_mensual,
  type ComercioResumen,
  type MovimientoResumen,
} from "../src/jobs/resumen-mensual.js";
import { POST as POSTResumen } from "../src/pages/api/jobs/resumen-mensual.js";
import type { ClientePyme } from "../src/jobs/bot-pyme.js";
import type { AccionPropuesta } from "../src/modules/bot/acciones-propuestas.js";

const SECRET = "test-secret-bot-s8";
const AHORA_ISO = "2026-11-01T12:30:00Z";

vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(AHORA_ISO));
const ahoraMs = Date.parse(AHORA_ISO);

function mov(tipo: "ingreso" | "egreso", montoCentavos: bigint, origen: string, ocurridoEn: string | null): MovimientoResumen {
  return { tipo, montoCentavos, origen, ocurridoEn };
}

function cliente(id: string, nombre: string, saldo: bigint, over: Partial<ClientePyme> = {}): ClientePyme {
  return { id, nombre, telefono: null, saldoCentavos: saldo, topeCentavos: 0n, diasMax: 0, ...over };
}

function comercio(over: Partial<ComercioResumen> = {}): ComercioResumen {
  return {
    tenantId: "t1",
    nombreComercio: "Distribuidora Sur",
    modulos: ["rotacion", "cobranza"],
    movimientos: [],
    productos: [],
    clientes: [],
    pagos: [],
    prefsWa: { optIn: true, avisoHora: "08:00", pausadoHastaMs: null },
    prefsEmail: { resumenCierre: true, pausadoHastaMs: null },
    destinoEmail: "dueno@sur.test",
    ...over,
  };
}

interface CapturadoWa {
  readonly texto: string;
  readonly acciones: ReadonlyArray<AccionPropuesta>;
}

interface CapturadoEmail {
  readonly texto: string;
}

let outbox: Set<string>;

async function correr(c: ComercioResumen): Promise<{
  texto: string | null;
  wa: CapturadoWa[];
  emails: CapturadoEmail[];
  acciones: ReadonlyArray<AccionPropuesta>;
}> {
  const wa: CapturadoWa[] = [];
  const emails: CapturadoEmail[] = [];
  const { resultados } = await ejecutar_resumen_mensual({
    comercios: [c],
    ahoraMs,
    zona: ZONA_DEFECTO,
    enviarWa: async (_tenantId, payload) => {
      wa.push({ texto: payload.texto, acciones: payload.acciones ?? [] });
      return { ok: true };
    },
    encolarEmail: async (_tenantId, payload) => {
      if (outbox.has(payload.clave)) return { ok: false, codigo: "DUPLICADO" };
      outbox.add(payload.clave);
      emails.push({ texto: payload.texto });
      return { ok: true };
    },
  });
  return { texto: resultados[0]?.texto ?? null, wa, emails, acciones: wa[0]?.acciones ?? [] };
}

beforeEach(() => {
  limpiar_corridas_mensual();
  outbox = new Set();
});

describe("BOT-S8 resumen mensual con acciones", () => {
  it("suma la sección Acciones sugeridas al mismo texto de WhatsApp y email", async () => {
    const r = await correr(
      comercio({
        productos: [{ sku: "a", nombre: "Alfajor", stock: 0, umbral: 10 }],
        clientes: [cliente("cl-1", "Ana", 1_200_000n, { diasMax: 20 })],
      }),
    );

    expect(r.texto).toContain("Acciones sugeridas:\n- Reponer Alfajor: quedan 0 (umbral 10).\n- Cobrar a Ana: $ 12.000,00.");
    expect(r.wa).toHaveLength(1);
    expect(r.emails).toHaveLength(1);
    expect(r.wa[0]?.texto).toBe(r.emails[0]?.texto);
    expect(r.acciones.map((a) => a.id)).toEqual(["acc:reponer:a", "acc:cobrar:cl-1"]);
  });

  it("sin acciones no agrega la sección y el canal queda sin botones", async () => {
    const r = await correr(
      comercio({
        productos: [{ sku: "a", nombre: "Alfajor", stock: 50, umbral: 10 }],
        clientes: [cliente("al-dia", "Caro", 0n)],
        movimientos: [mov("ingreso", 1_000_000n, "venta", "2026-10-10T12:00:00.000Z")],
      }),
    );

    expect(r.texto).not.toContain("Acciones sugeridas:");
    expect(r.acciones).toEqual([]);
    expect(r.wa[0]?.texto).toBe(r.emails[0]?.texto);
  });

  it("la idempotencia por tenant+mes+canal no cambia con acciones", async () => {
    const c = comercio({ productos: [{ sku: "a", nombre: "Alfajor", stock: 0, umbral: 10 }] });
    const primera = await correr(c);
    const segunda = await correr(c);

    expect(primera.wa).toHaveLength(1);
    expect(segunda.wa).toHaveLength(0);
    expect(outbox.size).toBe(1);
    expect(segunda.texto).toBe(primera.texto);
  });

  it("el snapshot expone las acciones para el adaptador de WhatsApp", () => {
    const s = armar_snapshot_mensual(
      comercio({ productos: [{ sku: "a", nombre: "Alfajor", stock: 0, umbral: 10 }], clientes: [] }),
      "2026-10",
      ZONA_DEFECTO,
    );
    expect(s.acciones.map((a) => a.id)).toEqual(["acc:reponer:a"]);
    expect(s.texto).toContain("Acciones sugeridas:");
  });
});

describe("BOT-S8 ruta del resumen: WhatsApp interactivo solo con acciones", () => {
  let enviados: Array<Record<string, unknown>> = [];

  function semillaRuta(): void {
    delete process.env.TENANT_MODE;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    resetStore();
    limpiar_corridas_mensual();
    process.env.JOBS_SECRET = SECRET;
    control.tenants.set("slice0", {
      id: "slice0",
      nombreComercio: "Distribuidora Sur",
      slug: "sur",
      estado: "activo",
      plan: "base",
      moneda: "ARS",
      ownerGoogleSub: "due",
      esDemo: false,
    });
    control.botLinks.set("+5491100000001", { tenantId: "slice0", googleSub: "due", estado: "verificado" });
    control.waPrefs.set("slice0:due", { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
    control.users.set("due", { googleSub: "due", email: "dueno@sur.test", emailVerificado: true });
    store.movements.push({ id: "m1", tipo: "ingreso", metodo: "Efectivo", monto_centavos: "500000", origen: "venta", idempotency_key: "mk1", ocurrido_en: "2026-10-15T12:00:00.000Z" });
  }

  function conCredenciales(): void {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
    process.env.WHATSAPP_TOKEN = "tok-opaco";
    process.env.WHATSAPP_PLANTILLAS_APROBADAS = JSON.stringify({ [PLANTILLA_RESUMEN_MENSUAL]: "tpl-bot-s8" });
    vi.stubGlobal("fetch", async (_url: unknown, init: { body?: string } = {}) => {
      enviados.push(JSON.parse(init.body ?? "{}") as Record<string, unknown>);
      return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${enviados.length}` }] }), {
        headers: { "content-type": "application/json" },
      });
    });
  }

  const conSecret = () => ctx("http://x/api/jobs/resumen-mensual", { method: "POST", headers: { "X-Job-Secret": SECRET } });

  beforeEach(() => {
    semillaRuta();
    enviados = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PLANTILLAS_APROBADAS;
  });

  afterAll(() => {
    vi.useRealTimers();
    delete process.env.JOBS_SECRET;
  });

  it("con acciones manda un interactivo con botones acc: de 20 caracteres o menos", async () => {
    store.stock.set("demo-sku-1", 0);
    conCredenciales();

    const res = await POSTResumen(conSecret());
    expect(res.status).toBe(200);

    const mensaje = enviados[0]!;
    expect(mensaje["type"]).toBe("interactive");
    const interactive = mensaje["interactive"] as {
      body: { text: string };
      action: { buttons: Array<{ reply: { id: string; title: string } }> };
    };
    expect(interactive.body.text).toContain("Acciones sugeridas:");
    expect(interactive.action.buttons.length).toBeGreaterThanOrEqual(1);
    expect(interactive.action.buttons.length).toBeLessThanOrEqual(3);
    for (const b of interactive.action.buttons) {
      expect(b.reply.id.startsWith("acc:")).toBe(true);
      expect(b.reply.title.length).toBeLessThanOrEqual(20);
    }
  });

  it("con acciones pero cuerpo de más de 1.024 caracteres manda texto sin botones", async () => {
    store.stock.set("demo-sku-1", 0);
    const t = control.tenants.get("slice0")!;
    control.tenants.set("slice0", { ...t, nombreComercio: "Distribuidora ".repeat(80) });
    conCredenciales();

    const res = await POSTResumen(conSecret());
    expect(res.status).toBe(200);

    const mensaje = enviados[0]!;
    expect(mensaje["type"]).toBe("text");
    const cuerpo = (mensaje["text"] as { body: string }).body;
    expect(cuerpo.length).toBeGreaterThan(1024);
    expect(cuerpo).toContain("Acciones sugeridas:");
  });

  it("sin acciones manda solo texto", async () => {
    store.stock.set("demo-sku-1", 999);
    conCredenciales();

    const res = await POSTResumen(conSecret());
    expect(res.status).toBe(200);

    const mensaje = enviados[0]!;
    expect(mensaje["type"]).toBe("text");
    expect((mensaje["text"] as { body: string }).body).not.toContain("Acciones sugeridas:");
  });
});
