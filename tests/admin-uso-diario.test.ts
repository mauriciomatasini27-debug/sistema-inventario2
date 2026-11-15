import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { adminStore, resetAdmin } from "../src/lib/admin-store.js";
import { control, resetStore } from "../src/lib/store.js";
import { fechaAR } from "../src/lib/fecha-ar.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { PLANES_EJEMPLO, planDe } from "../src/modules/planes/catalogo.js";
import { registrarUso } from "../src/lib/repos/planes.js";
import { GET as GETTenants } from "../src/pages/api/admin/tenants.js";
import {
  estimarMargen,
  filasUsoMargen,
  guardarUsoDiario,
  type UsoDiarioContadores,
} from "../src/modules/admin/uso-margen.js";
import { GET as GETUso } from "../src/pages/api/admin/uso.js";

const PLUS = planDe(PLANES_EJEMPLO, "plus");
const PRECIO_PLUS = BigInt(Math.round(PLUS.precioMensualUSD * 100));
const MITAD_PLUS = PRECIO_PLUS / 2n;

function uso(parcial: Partial<UsoDiarioContadores> & Pick<UsoDiarioContadores, "tenantId" | "dia">): UsoDiarioContadores {
  return {
    mensajesWa: 0,
    consultasLlm: 0,
    costoWaCentavos: 0n,
    costoLlmCentavos: 0n,
    ...parcial,
  };
}

function adminSesion(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function req(url: string, plano: string) {
  return ctx(url, { method: "GET", headers: { cookie: `__Host-sesion=${plano}` } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T15:00:00.000Z"));
  resetStore();
  resetAdmin();
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ADMIN-USO-DIARIO umbral de margen", () => {
  it("no marca cuando el costo técnico es exactamente la mitad del precio", () => {
    const m = estimarMargen({
      tenantId: "t-plus",
      plan: "plus",
      mes: "2026-10",
      usos: [uso({ tenantId: "t-plus", dia: "2026-10-24", costoWaCentavos: MITAD_PLUS })],
    });
    expect(m.precioPlanCentavos).toBe(PRECIO_PLUS);
    expect(m.costoTecnicoCentavos).toBe(MITAD_PLUS);
    expect(m.margenCentavos).toBe(PRECIO_PLUS - MITAD_PLUS);
    expect(m.marcado).toBe(false);
  });

  it("marca cuando el costo técnico supera la mitad del precio", () => {
    const costo = MITAD_PLUS + 1n;
    const m = estimarMargen({
      tenantId: "t-plus",
      plan: "plus",
      mes: "2026-10",
      usos: [uso({ tenantId: "t-plus", dia: "2026-10-24", costoLlmCentavos: costo })],
    });
    expect(m.marcado).toBe(true);
    expect(m.margenCentavos).toBe(PRECIO_PLUS - costo);
  });

  it("suma WhatsApp y asistente del mes, y deja afuera otro mes", () => {
    const m = estimarMargen({
      tenantId: "t-plus",
      plan: "plus",
      mes: "2026-10",
      usos: [
        uso({ tenantId: "t-plus", dia: "2026-10-01", costoWaCentavos: MITAD_PLUS - 10n, mensajesWa: 4 }),
        uso({ tenantId: "t-plus", dia: "2026-10-24", costoLlmCentavos: 11n, consultasLlm: 2 }),
        uso({ tenantId: "t-plus", dia: "2026-11-01", costoWaCentavos: 9_000n, mensajesWa: 80 }),
      ],
    });
    expect(m.costoTecnicoCentavos).toBe(MITAD_PLUS + 1n);
    expect(m.marcado).toBe(true);
    const noviembre = estimarMargen({
      tenantId: "t-plus",
      plan: "plus",
      mes: "2026-11",
      usos: [
        uso({ tenantId: "t-plus", dia: "2026-10-24", costoWaCentavos: MITAD_PLUS + 1n }),
        uso({ tenantId: "t-plus", dia: "2026-11-01", costoWaCentavos: 1n }),
      ],
    });
    expect(noviembre.costoTecnicoCentavos).toBe(1n);
    expect(noviembre.marcado).toBe(false);
  });

  it("un plan sin precio de referencia no se marca aunque el costo sea alto", () => {
    const m = estimarMargen({
      tenantId: "t-demo",
      plan: "demo",
      mes: "2026-10",
      usos: [uso({ tenantId: "t-demo", dia: "2026-10-24", costoWaCentavos: 50_000n })],
    });
    expect(m.precioPlanCentavos).toBeNull();
    expect(m.margenCentavos).toBeNull();
    expect(m.marcado).toBe(false);
  });
});

describe("ADMIN-USO-DIARIO aislamiento", () => {
  it("el costo de otro tenant no entra en el margen", () => {
    const filas = filasUsoMargen({
      dia: "2026-10-24",
      tenants: [
        { id: "barato", slug: "barato", plan: "plus" },
        { id: "caro", slug: "caro", plan: "plus" },
      ],
      usos: [
        uso({ tenantId: "barato", dia: "2026-10-24", costoWaCentavos: 1n, mensajesWa: 2, consultasLlm: 1 }),
        uso({ tenantId: "caro", dia: "2026-10-24", costoWaCentavos: MITAD_PLUS + 5n, mensajesWa: 40 }),
        uso({ tenantId: "ajeno", dia: "2026-10-24", costoWaCentavos: 80_000n, mensajesWa: 9 }),
      ],
    });
    expect(filas.map((f) => f.tenantId)).toEqual(["barato", "caro"]);
    const barato = filas[0];
    const caro = filas[1];
    expect(barato?.marcado).toBe(false);
    expect(barato?.costoTecnicoCentavos).toBe("1");
    expect(barato?.mensajesWa).toBe(2);
    expect(barato?.consultasLlm).toBe(1);
    expect(caro?.marcado).toBe(true);
    expect(caro?.costoTecnicoCentavos).toBe((MITAD_PLUS + 5n).toString());
    expect(JSON.stringify(filas)).not.toContain("ajeno");
  });

  it("la fila solo trae contadores técnicos", () => {
    const filas = filasUsoMargen({
      dia: "2026-10-24",
      tenants: [{ id: "t1", slug: "k", plan: "base" }],
      usos: [uso({ tenantId: "t1", dia: "2026-10-24", mensajesWa: 3, consultasLlm: 1, costoWaCentavos: 10n })],
    });
    const basico = planDe(PLANES_EJEMPLO, "basico");
    expect(filas[0]).toEqual({
      tenantId: "t1",
      slug: "k",
      plan: "base",
      dia: "2026-10-24",
      mensajesWa: 3,
      consultasLlm: 1,
      costoWaCentavos: "10",
      costoLlmCentavos: "0",
      costoTecnicoCentavos: "10",
      precioPlanCentavos: String(Math.round(basico.precioMensualUSD * 100)),
      margenCentavos: String(Math.round(basico.precioMensualUSD * 100) - 10),
      marcado: false,
      ejemplo: true,
    });
    const crudo = JSON.stringify(filas);
    for (const prohibido of ["producto", "cliente", "venta", "stock", "fiado", "empleado", "nombreComercio"]) {
      expect(crudo.toLowerCase()).not.toContain(prohibido.toLowerCase());
    }
  });

  it("rechaza contadores negativos y no los guarda", () => {
    const destino = new Map<string, UsoDiarioContadores>();
    expect(guardarUsoDiario(destino, uso({ tenantId: "t1", dia: "2026-10-24", costoWaCentavos: -1n })).ok).toBe(false);
    expect(guardarUsoDiario(destino, uso({ tenantId: "t1", dia: "2026-10-24", mensajesWa: 1.5 })).ok).toBe(false);
    expect(guardarUsoDiario(destino, uso({ tenantId: "t1", dia: "2026-13-40" })).ok).toBe(false);
    expect(destino.size).toBe(0);
  });
});

describe("ADMIN-USO-DIARIO GET /api/admin/uso", () => {
  it("sin allowlist responde 403 y no devuelve costos", async () => {
    control.tenants.set("t1", {
      id: "t1",
      nombreComercio: "Kiosco Secreto",
      slug: "k",
      estado: "activo",
      plan: "plus",
      moneda: "ARS",
      ownerGoogleSub: "dueno-secreto-9",
      esDemo: false,
    });
    guardarUsoDiario(adminStore.usoDiario, uso({ tenantId: "t1", dia: "2026-10-24", costoWaCentavos: MITAD_PLUS + 1n }));
    const plano = adminSesion("visitante");
    const r = (await GETUso(req("http://x/api/admin/uso?dia=2026-10-24", plano))) as Response;
    expect(r.status).toBe(403);
    const texto = await r.text();
    expect(texto).not.toContain("Kiosco Secreto");
    expect(texto).not.toContain((MITAD_PLUS + 1n).toString());
  });

  it("marca solo al tenant que supera el umbral y oculta el nombre del comercio", async () => {
    control.tenants.set("barato", {
      id: "barato",
      nombreComercio: "Kiosco Secreto",
      slug: "barato",
      estado: "activo",
      plan: "plus",
      moneda: "ARS",
      ownerGoogleSub: "dueno-secreto-9",
      esDemo: false,
    });
    control.tenants.set("caro", {
      id: "caro",
      nombreComercio: "Otro Secreto",
      slug: "caro",
      estado: "activo",
      plan: "plus",
      moneda: "ARS",
      ownerGoogleSub: "dueno-otro",
      esDemo: false,
    });
    expect(guardarUsoDiario(adminStore.usoDiario, uso({
      tenantId: "barato",
      dia: "2026-10-24",
      mensajesWa: 2,
      consultasLlm: 1,
      costoWaCentavos: 1n,
    })).ok).toBe(true);
    guardarUsoDiario(adminStore.usoDiario, uso({
      tenantId: "caro",
      dia: "2026-10-24",
      mensajesWa: 30,
      costoLlmCentavos: MITAD_PLUS + 1n,
    }));
    const plano = adminSesion("admin-1");
    const r = (await GETUso(req("http://x/api/admin/uso?dia=2026-10-24", plano))) as Response;
    expect(r.status).toBe(200);
    const body = (await r.json()) as { uso: Array<Record<string, unknown>> };
    expect(body.uso.map((f) => f["tenantId"])).toEqual(["barato", "caro"]);
    expect(body.uso[0]?.["marcado"]).toBe(false);
    expect(body.uso[1]?.["marcado"]).toBe(true);
    const crudo = JSON.stringify(body);
    expect(crudo).not.toContain("Kiosco Secreto");
    expect(crudo).not.toContain("Otro Secreto");
    expect(crudo).not.toContain("dueno-secreto-9");
    const uno = (await GETUso(req("http://x/api/admin/uso?dia=2026-10-24&tenant_id=barato", plano))) as Response;
    const solo = (await uno.json()) as { uso: Array<{ tenantId: string; marcado: boolean }> };
    expect(solo.uso.map((f) => f.tenantId)).toEqual(["barato"]);
    expect(solo.uso[0]?.marcado).toBe(false);
  });

  it("día inválido es 422 y un tenant desconocido es 404", async () => {
    const plano = adminSesion("admin-1");
    const mal = (await GETUso(req("http://x/api/admin/uso?dia=2026-13-40", plano))) as Response;
    expect(mal.status).toBe(422);
    const no = (await GETUso(req("http://x/api/admin/uso?tenant_id=nadie", plano))) as Response;
    expect(no.status).toBe(404);
  });

  it("sin día usa el día civil de Argentina", async () => {
    const plano = adminSesion("admin-1");
    const r = (await GETUso(req("http://x/api/admin/uso", plano))) as Response;
    expect(r.status).toBe(200);
    const body = (await r.json()) as { dia: string; uso: unknown[] };
    expect(body.dia).toBe(fechaAR());
    expect(body.uso).toEqual([]);
  });
});

describe("ADMIN-USO-DIARIO GET /api/admin/tenants", () => {
  it("refleja uso_wa desde usage_counters, aísla tenants y marca costo alto", async () => {
    const dia = fechaAR();
    const mes = dia.slice(0, 7);
    control.tenants.set("barato", {
      id: "barato",
      nombreComercio: "Kiosco Secreto",
      slug: "barato",
      estado: "activo",
      plan: "plus",
      moneda: "ARS",
      ownerGoogleSub: "dueno-1",
      esDemo: false,
    });
    control.tenants.set("caro", {
      id: "caro",
      nombreComercio: "Otro Secreto",
      slug: "caro",
      estado: "activo",
      plan: "plus",
      moneda: "ARS",
      ownerGoogleSub: "dueno-2",
      esDemo: false,
    });
    await registrarUso({
      tenantId: "barato",
      mes,
      feature: "bot_consulta",
      cantidad: 7,
      costoCentavos: 1n,
    });
    await registrarUso({
      tenantId: "caro",
      mes,
      feature: "asistente_ia",
      cantidad: 3,
      costoCentavos: MITAD_PLUS + 1n,
    });
    await registrarUso({
      tenantId: "ajeno",
      mes,
      feature: "bot_consulta",
      cantidad: 99,
      costoCentavos: 50_000n,
    });
    const plano = adminSesion("admin-1");
    const r = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(r.status).toBe(200);
    const body = (await r.json()) as { tenants: Array<Record<string, unknown>> };
    const barato = body.tenants.find((t) => t["id"] === "barato");
    const caro = body.tenants.find((t) => t["id"] === "caro");
    expect(barato?.["uso_wa"]).toBe(7);
    expect(barato?.["costo_alto"]).toBe(false);
    expect(caro?.["uso_wa"]).toBe(0);
    expect(caro?.["costo_alto"]).toBe(true);
    expect(body.tenants.map((t) => t["id"])).not.toContain("ajeno");
    expect(barato?.["nombre"]).toBe("Kiosco Secreto");
    expect(caro?.["nombre"]).toBe("Otro Secreto");
    const crudo = JSON.stringify(body);
    expect(crudo).not.toContain("dueno-1");
    expect(crudo).not.toContain("dueno-2");
  });
});

describe("ADMIN-USO-DIARIO panel y frontera", () => {
  it("el panel muestra la marca en texto y no nombra datos de negocio", () => {
    const html = readFileSync("src/pages/admin.astro", "utf8");
    expect(html).toContain('id="uso"');
    expect(html).toContain("/api/admin/uso");
    expect(html).toContain("Costo alto");
    expect(html).not.toContain("nombreComercio");
    expect(html).not.toMatch(/getTenantDb|schema-precios|products|customers/);
  });

  it("la ruta y el cálculo no leen la base del comercio", () => {
    const fuentes = [
      readFileSync("src/pages/api/admin/uso.ts", "utf8"),
      readFileSync("src/modules/admin/uso-margen.ts", "utf8"),
    ].join("\n");
    expect(fuentes).not.toMatch(/getTenantDb|schema-precios|schema-whatsapp|from\("sales"|from\("products"/);
  });
});
