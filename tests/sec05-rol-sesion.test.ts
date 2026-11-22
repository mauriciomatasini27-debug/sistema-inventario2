import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as postProducts, PATCH as patchProducts } from "../src/pages/api/products.js";
import { POST as postShifts } from "../src/pages/api/cash/shifts.js";
import { POST as postConciliate } from "../src/pages/api/cash/shifts/conciliate.js";
import { POST as postResolve } from "../src/pages/api/cash/shifts/resolve.js";

// P9-13: el rol para autorizar sale de sesión + membership, nunca del body.
// El body `rol` forjado debe ignorarse: manda membership.rol.

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function tenantConMiembro(tenantId: string, sub: string, rol: "dueno" | "empleado", permisos: string[] = []) {
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco Rol",
    slug: "kiosco-rol",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "dueno-1",
    esDemo: false,
  });
  const mid = `m-${tenantId}-${sub}`;
  control.memberships.set(mid, { id: mid, tenantId, googleSub: sub, rol, permisos, estado: "activo" });
}

function sesionDe(sub: string, tenantId: string | null): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function conSesion(url: string, plano: string, opts: { method?: string; body?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
  return ctx(url, {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    ...(opts.body === undefined ? {} : { body: opts.body }),
    headers: { cookie: `__Host-sesion=${plano}`, ...(opts.headers ?? {}) },
  });
}

async function crearProducto(sku: string, plano?: string, extra: Record<string, unknown> = {}) {
  const r = (await postProducts(
    plano
      ? conSesion("http://x/api/products", plano, { body: { sku, nombre: `Prod ${sku}`, precio_centavos: 100, ...extra } })
      : ctx("http://x/api/products", { body: { sku, nombre: `Prod ${sku}`, precio_centavos: 100, ...extra } }),
  )) as Response;
  expect(r.status).toBe(201);
}

async function turnoEnDisputa(): Promise<string> {
  const k = `sec05-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const r1 = (await postShifts(
    ctx("http://x/api/cash/shifts", { body: { fecha_jornada: "2026-10-16", turno: "manana", entregado_por: "ana", esperado_centavos: 200000 }, headers: { "Idempotency-Key": `sh-${k}` } }),
  )) as Response;
  expect(r1.status).toBe(201);
  const j1 = (await r1.json()) as { turno_id: string };
  const c1 = (await postConciliate(
    ctx("http://x/api/cash/shifts/conciliate", { body: { turno_id: j1.turno_id, contado_centavos: 100000, conteos_por_medio: [{ medio: "Efectivo", monto_centavos: 100000 }] }, headers: { "Idempotency-Key": `co-${k}` } }),
  )) as Response;
  expect(((await c1.json()) as { estado: string }).estado).toBe("en_disputa");
  return j1.turno_id;
}

beforeEach(() => {
  modoSingleSinDb();
  resetStore();
});

describe("P9-13 PATCH /api/products: umbrales con rol de sesión, body ignorado", () => {
  it("empleado con rol:'dueno' forjado en body recibe 403", async () => {
    tenantConMiembro("t-rol-1", "emp-1", "empleado");
    const plano = sesionDe("emp-1", "t-rol-1");
    await crearProducto("SEC05-1");
    const r = (await patchProducts(
      conSesion("http://x/api/products?sku=SEC05-1", plano, { method: "PATCH", body: { rol: "dueno", min_stock: 5 } }),
    )) as Response;
    expect(r.status).toBe(403);
  });

  it("dueño con rol:'empleado' forjado en body edita igual (manda la sesión)", async () => {
    tenantConMiembro("t-rol-1", "dueno-1", "dueno");
    const plano = sesionDe("dueno-1", "t-rol-1");
    await crearProducto("SEC05-2");
    const r = (await patchProducts(
      conSesion("http://x/api/products?sku=SEC05-2", plano, { method: "PATCH", body: { rol: "empleado", min_stock: 5 } }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { min_stock: number | null }).min_stock).toBe(5);
  });

  it("sesión sin membership activa recibe 403", async () => {
    tenantConMiembro("t-rol-1", "dueno-1", "dueno");
    const plano = sesionDe("visitante", "t-rol-1");
    await crearProducto("SEC05-3");
    const r = (await patchProducts(
      conSesion("http://x/api/products?sku=SEC05-3", plano, { method: "PATCH", body: { min_stock: 5 } }),
    )) as Response;
    expect(r.status).toBe(403);
  });

  it("legado sin sesión: body rol ignorado, vale el default dueño", async () => {
    await crearProducto("SEC05-4");
    const r = (await patchProducts(
      ctx("http://x/api/products?sku=SEC05-4", { method: "PATCH", body: { rol: "empleado", min_stock: 5 } }),
    )) as Response;
    expect(r.status).toBe(200);
  });
});

describe("P9-13 POST /api/products: estado de alta con rol de sesión", () => {
  it("spec 433 T1: empleado sin crear_productos crea igual; rol y permisos forjados se ignoran", async () => {
    tenantConMiembro("t-rol-1", "emp-1", "empleado", ["registrar_devoluciones"]);
    const plano = sesionDe("emp-1", "t-rol-1");
    const r = (await postProducts(
      conSesion("http://x/api/products", plano, { body: { sku: "SEC05-5", nombre: "Forjado", precio_centavos: 100, rol: "dueno", permisos: ["crear_productos"] } }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { estado: string }).estado).toBe("activo");
  });

  it("empleado con crear_productos en membership (no en body) da de alta activo", async () => {
    tenantConMiembro("t-rol-1", "emp-2", "empleado", ["crear_productos"]);
    const plano = sesionDe("emp-2", "t-rol-1");
    const r = (await postProducts(
      conSesion("http://x/api/products", plano, { body: { sku: "SEC05-6", nombre: "Con permiso", precio_centavos: 100, rol: "empleado" } }),
    )) as Response;
    expect(r.status).toBe(201);
    expect(((await r.json()) as { estado: string }).estado).toBe("activo");
  });
});

describe("P9-13 POST /api/cash/shifts/resolve: rol de sesión, body ignorado", () => {
  it("empleado con rol:'dueno' forjado recibe 403", async () => {
    tenantConMiembro("t-rol-1", "emp-1", "empleado");
    const plano = sesionDe("emp-1", "t-rol-1");
    const turnoId = await turnoEnDisputa();
    const r = (await postResolve(
      conSesion("http://x/api/cash/shifts/resolve", plano, { body: { turno_id: turnoId, nota: "forjado", rol: "dueno", resuelto_por: "emp-1" } }),
    )) as Response;
    expect(r.status).toBe(403);
  });

  it("dueño con rol:'empleado' forjado resuelve igual (manda la sesión)", async () => {
    tenantConMiembro("t-rol-1", "dueno-1", "dueno");
    const plano = sesionDe("dueno-1", "t-rol-1");
    const turnoId = await turnoEnDisputa();
    const r = (await postResolve(
      conSesion("http://x/api/cash/shifts/resolve", plano, { body: { turno_id: turnoId, nota: "justificado", rol: "empleado", resuelto_por: "dueno-1" } }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { estado: string }).estado).toBe("resuelto");
  });

  it("sesión sin membership activa recibe 403", async () => {
    tenantConMiembro("t-rol-1", "dueno-1", "dueno");
    const plano = sesionDe("visitante", "t-rol-1");
    const turnoId = await turnoEnDisputa();
    const r = (await postResolve(
      conSesion("http://x/api/cash/shifts/resolve", plano, { body: { turno_id: turnoId, nota: "forjado sin membership", rol: "dueno", resuelto_por: "visitante" } }),
    )) as Response;
    expect(r.status).toBe(403);
  });
});
