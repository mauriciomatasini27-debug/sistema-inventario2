import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { POST as postAlertas } from "../src/pages/api/jobs/alertas-stock.js";
import {
  armar_pie_ver_todo,
  clave_alerta_stock,
  cobertura_dias,
  en_ventana_quiebre,
  es_quiebre,
  filtrar_pendientes,
  canalesEfectivos,
  resolver_destinatarios,
  umbral_efectivo,
} from "../src/modules/alertas/stock-bajo.js";
import { ejecutar_alertas_stock, limpiar_claves_alertas } from "../src/jobs/alertas-stock.js";

describe("ALR-S1 umbral efectivo con fallback rotación 7d", () => {
  it("usa el mínimo cuando hay", () => {
    expect(umbral_efectivo(10, 50)).toBe(10);
  });
  it("sin mínimo usa la demanda 7d", () => {
    expect(umbral_efectivo(null, 14)).toBe(14);
    expect(umbral_efectivo(0, 3)).toBe(3);
  });
  it("sin mínimo ni rotación no alerta", () => {
    expect(umbral_efectivo(null, 0)).toBeNull();
    expect(umbral_efectivo(0, 0)).toBeNull();
  });
});

describe("ALR-S2 idempotencia tenant+producto+día y ventana quiebre", () => {
  it("clave incluye tenant, producto y día", () => {
    const k = clave_alerta_stock("t-a", "sku-1", "2026-10-16");
    expect(k).toContain("t-a");
    expect(k).toContain("sku-1");
    expect(k).toContain("2026-10-16");
    expect(clave_alerta_stock("t-a", "sku-1", "2026-10-16")).toBe(k);
    expect(clave_alerta_stock("t-b", "sku-1", "2026-10-16")).not.toBe(k);
  });
  it("quiebre es saldo 0 y la ventana es 10 a 20", () => {
    expect(es_quiebre(0)).toBe(true);
    expect(es_quiebre(1)).toBe(false);
    expect(en_ventana_quiebre("09:59")).toBe(false);
    expect(en_ventana_quiebre("10:00")).toBe(true);
    expect(en_ventana_quiebre("16:00")).toBe(true);
    expect(en_ventana_quiebre("20:00")).toBe(true);
    expect(en_ventana_quiebre("20:01")).toBe(false);
  });
  it("segunda corrida el mismo día no reenvía (AT2)", async () => {
    limpiar_claves_alertas();
    const catalogo = [{ sku: "a", nombre: "Coca", stock: 0, minimo: 5, ventas7d: 0, proveedor: null as string | null }];
    const base = {
      tenantId: "t-a",
      fecha: "2026-10-16",
      modo: "matutino" as const,
      catalogo,
      destinatarios: [{ googleSub: "d1", rol: "dueno" as const, canales: ["whatsapp", "email"] as Array<"whatsapp" | "email"> }],
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    };
    const r1 = await ejecutar_alertas_stock({ ...base, yaEnviados: new Set<string>() });
    expect(r1.enviadas).toBe(1);
    expect(r1.clavesRegistradas).toHaveLength(1);
    expect(r1.clavesRegistradas[0]).toContain(":d1");
    const r2 = await ejecutar_alertas_stock({ ...base, yaEnviados: new Set<string>(r1.clavesRegistradas) });
    expect(r2.enviadas).toBe(0);
    expect(r2.omitidasYa).toBe(1);
  });
  it("otra persona en un segundo tick todavía recibe la misma alerta", async () => {
    limpiar_claves_alertas();
    const catalogo = [{ sku: "a", nombre: "Coca", stock: 0, minimo: 5, ventas7d: 0, proveedor: null as string | null }];
    const base = {
      tenantId: "t-a",
      fecha: "2026-10-16",
      modo: "matutino" as const,
      catalogo,
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    };
    const r1 = await ejecutar_alertas_stock({
      ...base,
      destinatarios: [{ googleSub: "d1", rol: "dueno" as const, canales: ["email"] as Array<"whatsapp" | "email"> }],
      yaEnviados: new Set<string>(),
    });
    const r2 = await ejecutar_alertas_stock({
      ...base,
      destinatarios: [{ googleSub: "e1", rol: "encargado" as const, canales: ["email"] as Array<"whatsapp" | "email"> }],
      yaEnviados: new Set<string>(r1.clavesRegistradas),
    });
    expect(r2.enviadas).toBe(1);
  });
  it("modo quiebre solo avisa saldo 0", async () => {
    limpiar_claves_alertas();
    const catalogo = [
      { sku: "a", nombre: "Coca", stock: 0, minimo: 5, ventas7d: 0, proveedor: null as string | null },
      { sku: "b", nombre: "Sprite", stock: 4, minimo: 6, ventas7d: 0, proveedor: null as string | null },
    ];
    const r = await ejecutar_alertas_stock({
      tenantId: "t-a",
      fecha: "2026-10-16",
      modo: "quiebre",
      catalogo,
      destinatarios: [{ googleSub: "d1", rol: "dueno" as const, canales: ["email"] as Array<"whatsapp" | "email"> }],
      yaEnviados: new Set<string>(),
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(r.alertas.map((a) => a.sku)).toEqual(["a"]);
  });
  it("el job solo lee: no muta el catálogo (AT1)", async () => {
    limpiar_claves_alertas();
    const item = Object.freeze({ sku: "a", nombre: "Coca", stock: 2, minimo: 5, ventas7d: 0, proveedor: null as string | null });
    const catalogo = Object.freeze([item]);
    await ejecutar_alertas_stock({
      tenantId: "t-a",
      fecha: "2026-10-16",
      modo: "matutino",
      catalogo,
      destinatarios: [],
      yaEnviados: new Set<string>(),
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(item.stock).toBe(2);
    expect(catalogo).toHaveLength(1);
  });
});

describe("ALR-S3 destinatarios por rol y canal", () => {
  const duenoBase = {
    rol: "dueno" as const,
    googleSub: "d",
    optInWa: true,
    avisoHora: "08:00",
    pausaHastaMs: null as number | null,
  };

  it("encargado sin opt-in WA recibe solo email con canal ambos", () => {
    const enc = {
      rol: "encargado" as const,
      googleSub: "e1",
      optInWa: false,
      email: "e@x.com",
      canal: "ambos" as const,
      avisoHora: "08:00",
      pausaHastaMs: null,
    };
    expect(canalesEfectivos(enc)).toEqual(["email"]);
    const r = resolver_destinatarios({
      duenos: [duenoBase],
      encargados: [enc],
      ahoraMs: 100,
      modo: "matutino",
      horaTick: "08:00",
    });
    const e1 = r.find((d) => d.googleSub === "e1");
    expect(e1?.canales).toEqual(["email"]);
  });
  it("canal pausado no recibe", () => {
    const r = resolver_destinatarios({
      duenos: [{ ...duenoBase, pausaHastaMs: 999 }],
      encargados: [],
      ahoraMs: 100,
      modo: "matutino",
      horaTick: "08:00",
    });
    expect(r).toHaveLength(0);
  });
  it("dueño siempre incluido aunque el encargado no tenga opt-in", () => {
    const r = resolver_destinatarios({
      duenos: [duenoBase],
      encargados: [
        {
          rol: "encargado",
          googleSub: "e1",
          optInWa: false,
          canal: "whatsapp",
          avisoHora: "08:00",
          pausaHastaMs: 999,
        },
      ],
      ahoraMs: 100,
      modo: "matutino",
      horaTick: "08:00",
    });
    expect(r.some((d) => d.googleSub === "d")).toBe(true);
    expect(r.some((d) => d.googleSub === "e1")).toBe(false);
  });
  it("matutino exige avisoHora igual al tick", () => {
    const r = resolver_destinatarios({
      duenos: [{ ...duenoBase, avisoHora: "09:00" }],
      encargados: [],
      ahoraMs: 100,
      modo: "matutino",
      horaTick: "08:00",
    });
    expect(r).toHaveLength(0);
  });
});

describe("ALR-S4 contenido agrupado de a 10 con ver todo", () => {
  it("25 bajo mínimo se pagina de a 10 con pie ver todo", () => {
    const pie1 = armar_pie_ver_todo({ total: 25, pagina: 1, porPagina: 10 });
    expect(pie1).toContain("10");
    expect(pie1.toLowerCase()).toContain("ver todo");
    const pie2 = armar_pie_ver_todo({ total: 8, pagina: 1, porPagina: 10 });
    expect(pie2).toBe("");
  });
  it("cobertura en días sale del stock y la venta diaria", () => {
    expect(cobertura_dias(10, 2)).toBe(5);
    expect(cobertura_dias(0, 2)).toBe(0);
    expect(cobertura_dias(10, 0)).toBeNull();
  });
  it("filtrar_pendientes deja fuera lo ya enviado", () => {
    expect(filtrar_pendientes(["a", "b"], new Set(["a"]))).toEqual(["b"]);
  });
});

describe("ALR-S2 endpoint POST /api/jobs/alertas-stock", () => {
  const SECRETO = "secreto-alr-s2";
  let n = 0;

  beforeEach(() => {
    delete process.env.TENANT_MODE;
    process.env.JOBS_SECRET = SECRETO;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    resetStore();
    limpiar_claves_alertas();
  });
  afterEach(() => {
    delete process.env.JOBS_SECRET;
    resetStore();
  });

  function comercio(optIn: boolean): string {
    n += 1;
    const tenantId = `t-alr-${n}`;
    const sub = `dueno-alr-${n}`;
    control.tenants.set(tenantId, {
      id: tenantId,
      nombreComercio: `Kiosco ${n}`,
      slug: `kiosco-alr-${n}`,
      estado: "activo",
      plan: "basico",
      moneda: "ARS",
      ownerGoogleSub: sub,
      esDemo: false,
    });
    control.botLinks.set(`+54911000090${String(n).padStart(2, "0")}`, { tenantId, googleSub: sub, estado: "verificado" });
    control.waPrefs.set(`${tenantId}:${sub}`, { optIn, avisoHora: "08:00", pausadoHastaMs: null });
    control.memberships.set(`m-${sub}`, { id: `m-${sub}`, tenantId, googleSub: sub, rol: "dueno", permisos: [], estado: "activo" });
    control.users.set(sub, { googleSub: sub, email: `dueno-${n}@test.com`, emailVerificado: true });
    return tenantId;
  }

  it("sin secreto responde 403", async () => {
    comercio(true);
    const r = (await postAlertas(ctx("http://x/api/jobs/alertas-stock", { headers: {} }))) as Response;
    expect(r.status).toBe(403);
  });

  it("quiebre fuera de ventana se omite sin enviar", async () => {
    comercio(true);
    store.stock.set("demo-sku-1", 0);
    const r = (await postAlertas(
      ctx("http://x/api/jobs/alertas-stock?modo=quiebre&hora=09:00", { headers: { "X-Job-Secret": SECRETO } }),
    )) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { omitido: string; alertas: unknown[] };
    expect(j.omitido).toBe("fuera_ventana");
    expect(j.alertas).toEqual([]);
  });

  it("matutino avisa el quiebre sin mutar stock y la segunda corrida no repite", async () => {
    comercio(true);
    store.stock.set("demo-sku-1", 0);
    const fecha = "2026-10-16";
    const base = `http://x/api/jobs/alertas-stock?fecha=${fecha}`;
    const r1 = (await postAlertas(ctx(base, { headers: { "X-Job-Secret": SECRETO } }))) as Response;
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as { alertas: Array<{ sku: string; clave: string }>; enviadas: number };
    expect(j1.alertas.map((a) => a.sku)).toEqual(["demo-sku-1"]);
    expect(j1.enviadas).toBe(1);
    expect(j1.alertas[0]?.clave).toContain("t-alr-");
    expect(store.stock.get("demo-sku-1")).toBe(0);
    const r2 = (await postAlertas(ctx(base, { headers: { "X-Job-Secret": SECRETO } }))) as Response;
    const j2 = (await r2.json()) as { alertas: unknown[]; omitidas_ya: number };
    expect(j2.alertas).toEqual([]);
    expect(j2.omitidas_ya).toBe(1);
  });
});

describe("ALR-S5 armar pedido queda borrador sin enviar", () => {
  it("el job nunca marca enviado al proveedor: solo borrador", async () => {
    limpiar_claves_alertas();
    const r = await ejecutar_alertas_stock({
      tenantId: "t-a",
      fecha: "2026-10-16",
      modo: "matutino",
      catalogo: [{ sku: "a", nombre: "Coca", stock: 0, minimo: 5, ventas7d: 0, proveedor: "Distri" }],
      destinatarios: [{ googleSub: "d1", rol: "dueno" as const, canales: ["email"] as Array<"whatsapp" | "email"> }],
      yaEnviados: new Set<string>(),
      enviarWa: () => ({ ok: true }),
      enviarEmail: () => ({ ok: true }),
    });
    expect(r.enviadas).toBe(1);
    expect(r.enviosProveedor).toBe(0);
  });
});
