import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { nombresUbicacionesRubro } from "../src/modules/onboarding/ubicaciones-rubro.js";
import { listarUbicaciones, sembrarUbicacionesRubro } from "../src/lib/repos/catalogo.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { locations } from "../src/db/schema.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";

const KIOSCO = [
  "Mostrador",
  "Góndola 1",
  "Heladera 1",
  "Exhibidor de golosinas",
  "Estante detrás del mostrador",
  "Depósito",
];

const OTRO = ["Mostrador", "Estante 1", "Depósito"];

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function sesionEnStore(sub: string, tenantId: string | null = null) {
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

function req(plano: string, cuerpo: unknown) {
  return ctx("http://x/api/onboarding/alta", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
    body: cuerpo as Record<string, unknown>,
  });
}

describe("ON4 seed ubicaciones: decisión pura", () => {
  it("kiosco sin ubicaciones crea exactamente las 6 del PRD", () => {
    expect(nombresUbicacionesRubro("kiosco", [])).toEqual(KIOSCO);
  });

  it("rubro desconocido usa la plantilla otro", () => {
    expect(nombresUbicacionesRubro("ferreteria", [])).toEqual(OTRO);
  });

  it("si ya hay una ubicación, aunque esté archivada, no crea nada", () => {
    expect(nombresUbicacionesRubro("kiosco", [{ archivada: true }])).toEqual([]);
    expect(nombresUbicacionesRubro("kiosco", [{ archivada: false }])).toEqual([]);
  });
});

describe("ON4.1/ON4.2 alta autoservicio siembra ubicaciones del rubro", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("kiosco deja 6 ubicaciones vacías y el segundo POST 409 no duplica", async () => {
    const plano = sesionEnStore("dueno-on4");
    const cuerpo = { nombre_comercio: "Kiosco ON4", rubro: "kiosco", request_key: "on4-seed-1" };

    const r1 = await postAlta(req(plano, cuerpo));
    expect(r1.status).toBe(201);
    const j1 = (await r1.json()) as { tenant_id: string };

    const trasPrimera = (await listarUbicaciones()).filter((u) => !u.archivada).map((u) => u.nombre);
    expect(trasPrimera).toEqual(KIOSCO);

    const evento = control.events.find((e) => e.tenantId === j1.tenant_id && e.tipo === "ubicaciones_sembradas_rubro");
    expect(evento?.detalle).toMatchObject({
      origen: "Sistema (plantilla de rubro)",
      version: "v1",
      cantidad: 6,
    });

    const r2 = await postAlta(req(plano, cuerpo));
    expect(r2.status).toBe(409);
    expect(((await r2.json()) as { tenant_id: string }).tenant_id).toBe(j1.tenant_id);
    expect((await listarUbicaciones()).filter((u) => !u.archivada)).toHaveLength(6);
  });

  it("sembrar dos veces el mismo tenant en memoria no duplica", async () => {
    const primera = await sembrarUbicacionesRubro("t-on4", "kiosco");
    expect(primera.creadas.map((u) => u.nombre)).toEqual(KIOSCO);
    const segunda = await sembrarUbicacionesRubro("t-on4", "kiosco");
    expect(segunda.creadas).toEqual([]);
    expect((await listarUbicaciones()).filter((u) => !u.archivada)).toHaveLength(6);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const tenantA = randomUUID();
const tenantB = randomUUID();
let basePrivA = "";
let basePrivB = "";

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env[`TENANT_DATABASE_URL_${tenantA}`] = basePrivA;
  process.env[`TENANT_DATABASE_URL_${tenantB}`] = basePrivB;
}

async function borrarUbicaciones(tenantId: string) {
  await conTenant(tenantId, async () => {
    await getTenantDb().delete(locations).where(inArray(locations.nombre, KIOSCO));
  });
}

async function filas(tenantId: string) {
  return conTenant(tenantId, async () =>
    getTenantDb().select().from(locations).where(inArray(locations.nombre, KIOSCO)),
  );
}

describe.skipIf(!hayPG)("ON4 seed PG: siembra DB-first aislada por tenant e idempotente", () => {
  beforeAll(async () => {
    basePrivA = await asegurarBasePrivada("on4_seed_ubic_a", process.env.PG_TEST_URL_A ?? "");
    basePrivB = await asegurarBasePrivada("on4_seed_ubic_b", process.env.PG_TEST_URL_B ?? "");
    fijarMulti();
    resetStore();
    await borrarUbicaciones(tenantA);
    await borrarUbicaciones(tenantB);
  });

  afterAll(async () => {
    if (!basePrivA) return;
    fijarMulti();
    await borrarUbicaciones(tenantA);
    await borrarUbicaciones(tenantB);
    delete process.env.TENANT_MODE;
    delete process.env[`TENANT_DATABASE_URL_${tenantA}`];
    delete process.env[`TENANT_DATABASE_URL_${tenantB}`];
  });

  it("siembra en A, B no recibe nada y la segunda corrida no duplica", async () => {
    fijarMulti();
    const primera = await sembrarUbicacionesRubro(tenantA, "kiosco");
    expect(primera.creadas.map((u) => u.nombre)).toEqual(KIOSCO);
    expect(await filas(tenantA)).toHaveLength(6);
    expect(await filas(tenantB)).toHaveLength(0);

    const segunda = await sembrarUbicacionesRubro(tenantA, "kiosco");
    expect(segunda.creadas).toEqual([]);
    expect(await filas(tenantA)).toHaveLength(6);
  });
});
