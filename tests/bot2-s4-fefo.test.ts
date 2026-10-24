import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { products, stockLots } from "../src/db/schema.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { armarRespuestaDetalle, consulta_con_detalle, type LoteCrudo } from "../src/modules/whatsapp/consulta.js";
import { lotesMemoriaDelTenant, textoDetalleSiCorresponde } from "../src/lib/repos/consulta-lotes.js";
import { GET as GETConsult } from "../src/pages/api/whatsapp/consult.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";

const SKU = "LECHEFEFO";
const OTRO = "YERBAFEFO";
const SECRET = "bot2-s4-secret";
const NUMERO = "5491100001111";

function ficha(sku: string, controla: boolean) {
  return {
    sku,
    nombre: "Leche",
    precioCentavos: 20000,
    sector: "general",
    locationId: null,
    archivado: false,
    controlaVencimiento: controla,
    estado: "activo" as const,
    minStock: null,
    reorderQty: null,
  };
}

function loteMem(id: string, sku: string, venceEl: string | null, restante: number, alta = restante) {
  return { id, sku, cantidad: alta, cantidadRestante: restante, venceEl, costoCentavos: "100" };
}

function sembrar(controla: boolean) {
  store.stock.set(SKU, 13);
  store.prices.set(SKU, 20000);
  store.productos.set(SKU, ficha(SKU, controla));
  store.lotes.set("pronto", loteMem("pronto", SKU, "2026-03-01", 2));
  store.lotes.set("tarde", loteMem("tarde", SKU, "2026-12-01", 4));
  store.lotes.set("sin", loteMem("sin", SKU, null, 7));
  store.lotes.set("vacio", loteMem("vacio", SKU, "2026-01-01", 0, 1));
  store.lotes.set("ajeno-sku", loteMem("ajeno-sku", OTRO, "2099-08-08", 55));
}

function lineasDe(texto: string): string[] {
  return texto.split("\n").filter((l) => l.includes("u."));
}

describe("BOT2-S4 detalle FEFO", () => {
  it("con controla_vencimiento ordena FEFO y deja afuera otro tenant, otro sku y cantidad 0", () => {
    const lotes: LoteCrudo[] = [
      { id: "ajeno", tenantId: "t-b", sku: SKU, venceEl: "2026-01-01", cantidad: 99 },
      { id: "otro", tenantId: "t-a", sku: OTRO, venceEl: "2026-01-02", cantidad: 55 },
      { id: "tarde", tenantId: "t-a", sku: SKU, venceEl: "2026-12-01", cantidad: 4 },
      { id: "pronto", tenantId: "t-a", sku: SKU, venceEl: "2026-03-01", cantidad: 2 },
      { id: "sin", tenantId: "t-a", sku: SKU, venceEl: null, cantidad: 7 },
      { id: "vacio", tenantId: "t-a", sku: SKU, venceEl: "2026-01-01", cantidad: 0 },
    ];
    const texto = armarRespuestaDetalle({
      tenantId: "t-a",
      sku: SKU,
      nombre: "Leche",
      comercio: "Kiosco",
      controlaVencimiento: true,
      lotes,
    });
    expect(texto).not.toBeNull();
    expect(lineasDe(texto ?? "")).toEqual(["01/03/2026 — 2 u.", "01/12/2026 — 4 u.", "sin vencimiento — 7 u."]);
    expect(texto).not.toContain("99");
    expect(texto).not.toContain("55");
    expect(texto).not.toContain("0 u.");
    expect(texto).toContain("[Kiosco]");
  });

  it("sin controla_vencimiento no inventa lotes", () => {
    const texto = armarRespuestaDetalle({
      tenantId: "t-a",
      sku: SKU,
      nombre: "Leche",
      comercio: "Kiosco",
      controlaVencimiento: false,
      lotes: [{ id: "p", tenantId: "t-a", sku: SKU, venceEl: "2026-03-01", cantidad: 2 }],
    });
    expect(texto).toBeNull();
  });

  it("detalle solo o con producto, y una consulta común no es detalle", () => {
    expect(consulta_con_detalle("detalle")).toEqual({ detalle: true, texto: "" });
    expect(consulta_con_detalle("ver detalle")).toEqual({ detalle: true, texto: "" });
    expect(consulta_con_detalle("detalle de la leche")).toEqual({ detalle: true, texto: "stock leche" });
    expect(consulta_con_detalle("cuantos leche tengo")).toBeNull();
  });
});

describe("BOT2-S4 la partición no mezcla comercios", () => {
  it("otro tenant no ve lotes ajenos", () => {
    const prev = process.env.TENANT_MODE;
    process.env.TENANT_MODE = "multi";
    const a = randomUUID();
    const b = randomUUID();
    try {
      resetStore();
      conTenant(a, () => {
        store.lotes.set("a1", loteMem("a1", SKU, "2026-05-01", 3));
      });
      conTenant(b, () => {
        store.lotes.set("b1", loteMem("b1", SKU, "2026-05-01", 8));
      });
      const deA = lotesMemoriaDelTenant(a);
      expect(deA.map((l) => l.cantidad)).toEqual([3]);
      expect(deA.every((l) => l.tenantId === a)).toBe(true);
      const texto = armarRespuestaDetalle({
        tenantId: a,
        sku: SKU,
        nombre: "Leche",
        comercio: "A",
        controlaVencimiento: true,
        lotes: [...deA, ...lotesMemoriaDelTenant(b)],
      });
      expect(texto).toContain("3 u.");
      expect(texto).not.toContain("8 u.");
    } finally {
      if (prev === undefined) delete process.env.TENANT_MODE;
      else process.env.TENANT_MODE = prev;
      resetStore();
    }
  });
});

function firma(raw: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(raw, "utf8").digest("hex")}`;
}

let nWamid = 0;
function wamid(): string {
  nWamid += 1;
  return `wamid-bot2-s4-${nWamid}`;
}

function comercio() {
  control.tenants.set("t-fefo", {
    id: "t-fefo",
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "g-fefo",
    esDemo: false,
  });
  control.memberships.set("m-fefo", {
    id: "m-fefo",
    tenantId: "t-fefo",
    googleSub: "g-fefo",
    rol: "dueno",
    permisos: [],
    estado: "activo",
    puedeUsarBot: true,
  });
  control.botLinks.set(`+${NUMERO}`, { tenantId: "t-fefo", googleSub: "g-fefo", estado: "verificado" });
}

async function mensaje(texto: string): Promise<Record<string, unknown>> {
  const raw = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ id: wamid(), from: NUMERO, timestamp: "1729000000", type: "text", text: { body: texto } }] } }] }],
  });
  const res = (await postWebhook(
    ctx("http://x/api/whatsapp/webhook", { method: "POST", headers: { "X-Hub-Signature-256": firma(raw) }, body: raw }),
  )) as Response;
  return (await res.json()) as Record<string, unknown>;
}

describe("BOT2-S4 webhook", () => {
  it("pide detalle después del saldo y lista FEFO; el saldo solo no inventa lotes", async () => {
    resetStore();
    process.env.WHATSAPP_APP_SECRET = SECRET;
    delete process.env.WHATSAPP_TOKEN;
    comercio();
    sembrar(true);
    const saldo = await mensaje(`cuantos ${SKU} tengo`);
    expect(saldo["accion"]).toBe("consulta");
    expect(String(saldo["respuesta"])).toContain("13 u.");
    expect(String(saldo["respuesta"])).not.toContain("lotes por vencimiento");
    const detalle = await mensaje("detalle");
    expect(lineasDe(String(detalle["respuesta"]))).toEqual([
      "01/03/2026 — 2 u.",
      "01/12/2026 — 4 u.",
      "sin vencimiento — 7 u.",
    ]);
    expect(String(detalle["respuesta"])).not.toContain("55");
    expect(String(detalle["respuesta"])).not.toContain("08/08/2099");
  });

  it("detalle en el mismo mensaje también lista FEFO", async () => {
    resetStore();
    process.env.WHATSAPP_APP_SECRET = SECRET;
    delete process.env.WHATSAPP_TOKEN;
    comercio();
    sembrar(true);
    const detalle = await mensaje(`detalle ${SKU}`);
    expect(lineasDe(String(detalle["respuesta"]))).toEqual([
      "01/03/2026 — 2 u.",
      "01/12/2026 — 4 u.",
      "sin vencimiento — 7 u.",
    ]);
  });

  it("sin controla_vencimiento el detalle responde el saldo y no lista lotes", async () => {
    resetStore();
    process.env.WHATSAPP_APP_SECRET = SECRET;
    delete process.env.WHATSAPP_TOKEN;
    comercio();
    sembrar(false);
    await mensaje(`cuantos ${SKU} tengo`);
    const detalle = await mensaje("detalle");
    const texto = String(detalle["respuesta"]);
    expect(texto).toContain("13 u.");
    expect(texto).not.toContain("lotes por vencimiento");
    expect(texto).not.toContain("08/08/2099");
    expect(texto).not.toContain("01/03/2026");
  });
});

function sesionPlano(): string {
  const c = crearSesion({ googleSub: "bot2-s4", tenantId: "t-fefo", ahora: new Date() });
  control.sessions.set(c.registro.idHash, c.registro);
  return c.idPlano;
}

describe("BOT2-S4 GET consult", () => {
  it("detalle con flag lista FEFO y sin flag deja el saldo", async () => {
    resetStore();
    sembrar(true);
    const plano = sesionPlano();
    const con = await GETConsult(
      ctx(`http://x/api/whatsapp/consult?term=${encodeURIComponent(`detalle ${SKU}`)}&comercio=Kiosco`, {
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    );
    const ok = (await (con as Response).json()) as { texto?: string; decision?: string };
    expect(ok.decision).toBe("directo");
    expect(lineasDe(ok.texto ?? "")).toEqual(["01/03/2026 — 2 u.", "01/12/2026 — 4 u.", "sin vencimiento — 7 u."]);

    store.productos.set(SKU, ficha(SKU, false));
    const sin = await GETConsult(
      ctx(`http://x/api/whatsapp/consult?term=${encodeURIComponent(`detalle ${SKU}`)}&comercio=Kiosco`, {
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    );
    const cuerpo = (await (sin as Response).json()) as { texto?: string };
    expect(cuerpo.texto ?? "").toContain("13 u.");
    expect(cuerpo.texto ?? "").not.toContain("lotes por vencimiento");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

describe.skipIf(!hayPG)("BOT2-S4 lotes en la base del tenant", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const sku = `FEFO${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.toUpperCase();
  let modoPrev: string | undefined;

  function fijarMulti() {
    process.env.TENANT_MODE = "multi";
    process.env[`TENANT_DATABASE_URL_${tenantA}`] = process.env.PG_TEST_URL_A ?? "";
    process.env[`TENANT_DATABASE_URL_${tenantB}`] = process.env.PG_TEST_URL_B ?? "";
  }

  beforeAll(async () => {
    modoPrev = process.env.TENANT_MODE;
    fijarMulti();
    resetStore();
    for (const [tenant, urlQty] of [
      [tenantA, 2],
      [tenantB, 99],
    ] as const) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.insert(products).values({ sku, nombre: "Leche", precioCentavos: 100n, stockActual: 13 });
        if (tenant === tenantA) {
          await db.insert(stockLots).values([
            { sku, cantidad: 4, cantidadRestante: 4, venceEl: new Date("2026-12-01T00:00:00.000Z"), costoCentavos: 100n },
            { sku, cantidad: 2, cantidadRestante: 2, venceEl: new Date("2026-03-01T00:00:00.000Z"), costoCentavos: 100n },
            { sku, cantidad: 7, cantidadRestante: 7, venceEl: null, costoCentavos: 100n },
            { sku, cantidad: 1, cantidadRestante: 0, venceEl: new Date("2026-01-01T00:00:00.000Z"), costoCentavos: 100n },
          ]);
        } else {
          await db.insert(stockLots).values({
            sku,
            cantidad: urlQty,
            cantidadRestante: urlQty,
            venceEl: new Date("2026-01-15T00:00:00.000Z"),
            costoCentavos: 100n,
          });
        }
        store.productos.set(sku, ficha(sku, true));
      });
    }
  });

  afterAll(async () => {
    fijarMulti();
    for (const tenant of [tenantA, tenantB]) {
      await conTenant(tenant, async () => {
        const db = getTenantDb();
        await db.delete(stockLots).where(eq(stockLots.sku, sku));
        await db.delete(products).where(inArray(products.sku, [sku]));
      });
    }
    delete process.env[`TENANT_DATABASE_URL_${tenantA}`];
    delete process.env[`TENANT_DATABASE_URL_${tenantB}`];
    if (modoPrev === undefined) delete process.env.TENANT_MODE;
    else process.env.TENANT_MODE = modoPrev;
    resetStore();
  });

  it("la base del otro comercio no entra en el detalle y el orden es FEFO", async () => {
    fijarMulti();
    conTenant(tenantA, () => {
      store.productos.set(sku, ficha(sku, true));
    });
    const texto = await textoDetalleSiCorresponde({ tenantId: tenantA, sku, nombre: "Leche", comercio: "A" });
    expect(texto).not.toBeNull();
    const lineas = lineasDe(texto ?? "");
    expect(lineas[0]).toContain("2 u.");
    expect(lineas[1]).toContain("4 u.");
    expect(lineas[2]).toContain("sin vencimiento");
    expect(lineas[2]).toContain("7 u.");
    expect(texto).not.toContain("99");
  });

  it("sin el flag no lista los lotes de la base", async () => {
    fijarMulti();
    conTenant(tenantA, () => {
      store.productos.set(sku, ficha(sku, false));
    });
    const texto = await textoDetalleSiCorresponde({ tenantId: tenantA, sku, nombre: "Leche", comercio: "A" });
    expect(texto).toBeNull();
  });
});
