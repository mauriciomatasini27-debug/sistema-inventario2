import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { locations } from "../src/db/schema.js";
import { GET as getLocations, PATCH as patchLocations, POST as postLocations } from "../src/pages/api/locations.js";
import { ctx } from "./helpers/ctx.js";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function post(body: unknown) {
  return ctx("http://x/api/locations", { method: "POST", body: body as Record<string, unknown> });
}

function patch(body: unknown) {
  return ctx("http://x/api/locations", { method: "PATCH", body: body as Record<string, unknown> });
}

async function crear(nombre: string): Promise<{ id: string; nombre: string; archivada: boolean }> {
  const r = (await postLocations(post({ nombre }))) as Response;
  expect(r.status).toBe(201);
  return (await r.json()) as { id: string; nombre: string; archivada: boolean };
}

async function listar(): Promise<Array<{ id: string; nombre: string }>> {
  const r = (await getLocations(ctx("http://x/api/locations"))) as Response;
  expect(r.status).toBe(200);
  return ((await r.json()) as { ubicaciones: Array<{ id: string; nombre: string }> }).ubicaciones;
}

describe("ON4-5 renombrar ubicaciones: PATCH /api/locations", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  afterEach(() => {
    modoSingleSinDb();
  });

  it("renombra una ubicación existente y la lista devuelve el nombre nuevo", async () => {
    const a = await crear("Gondola 1");
    const r = (await patchLocations(patch({ id: a.id, nombre: "Pasillo 4" }))) as Response;
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: a.id, nombre: "Pasillo 4", archivada: false });
    expect((await listar()).map((u) => u.nombre)).toEqual(["Pasillo 4"]);
  });

  it("recorta espacios y acepta cambiar solo mayúsculas del propio nombre", async () => {
    const a = await crear("Gondola 1");
    const conEspacios = (await patchLocations(patch({ id: a.id, nombre: "  Pasillo 4  " }))) as Response;
    expect(conEspacios.status).toBe(200);
    expect(((await conEspacios.json()) as { nombre: string }).nombre).toBe("Pasillo 4");
    const propia = (await patchLocations(patch({ id: a.id, nombre: "PASILLO 4" }))) as Response;
    expect(propia.status).toBe(200);
    expect(((await propia.json()) as { nombre: string }).nombre).toBe("PASILLO 4");
    expect((await listar()).map((u) => u.nombre)).toEqual(["PASILLO 4"]);
  });

  it("409 case-insensitive contra otra ubicación y no toca ninguna", async () => {
    const a = await crear("Gondola 1");
    await crear("Gondola 2");
    const r = (await patchLocations(patch({ id: a.id, nombre: "gondola 2" }))) as Response;
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "ubicacion duplicada" });
    expect((await listar()).map((u) => u.nombre)).toEqual(["Gondola 1", "Gondola 2"]);
  });

  it("404 cuando la ubicación no existe", async () => {
    const r = (await patchLocations(
      patch({ id: "00000000-0000-4000-8000-000000000000", nombre: "Pasillo 4" }),
    )) as Response;
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "ubicacion desconocida" });
    expect(await listar()).toEqual([]);
  });

  it("422 con body inválido: id no uuid, nombre vacío o nombre de más de 80", async () => {
    const a = await crear("Gondola 1");
    expect(((await patchLocations(patch({ nombre: "Pasillo 4" }))) as Response).status).toBe(422);
    expect(((await patchLocations(patch({ id: "no-uuid", nombre: "Pasillo 4" }))) as Response).status).toBe(422);
    expect(((await patchLocations(patch({ id: a.id, nombre: "   " }))) as Response).status).toBe(422);
    expect(((await patchLocations(patch({ id: a.id, nombre: "x".repeat(81) }))) as Response).status).toBe(422);
    expect((await listar()).map((u) => u.nombre)).toEqual(["Gondola 1"]);
  });

  it("503 en multi sin base del comercio", async () => {
    process.env.TENANT_MODE = "multi";
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    const r = (await conTenant("tenant-a", () =>
      patchLocations(patch({ id: "00000000-0000-4000-8000-000000000000", nombre: "Pasillo 4" })),
    )) as Response;
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "base_no_disponible" });
  });
});

describe("ON4-5 renombrar ubicaciones: UI de /panel/stock", () => {
  const stock = leer("src/pages/panel/stock.astro");

  it("cada fila ofrece Renombrar contra PATCH /api/locations", () => {
    expect(stock).toContain('"Renombrar"');
    expect(stock).toContain('method: "PATCH"');
    expect(stock).toContain("Guardar");
    expect(stock).toContain("Cancelar");
  });

  it("el editor tiene etiqueta, Enter guarda, Escape cancela y devuelve el foco", () => {
    expect(stock).toContain('"Nuevo nombre"');
    expect(stock).toContain('"Escape"');
    expect(stock).toContain(".focus()");
  });

  it("el error 409 se anuncia en un role=status con aria-live y respeta reduced motion", () => {
    expect(stock).toContain('"role", "status"');
    expect(stock).toContain('"aria-live"');
    expect(stock).toContain("prefers-reduced-motion");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

const sufijoPG = `rn${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`.replace(/[^a-z0-9]/g, "").slice(0, 12);
const nombrePG = `Gondola RN ${sufijoPG}`;
const renombradaPG = `Pasillo RN ${sufijoPG}`;
let idPG: string | null = null;

describe.skipIf(!hayPG)("ON4-5 renombrar ubicaciones PG: persiste en la base", () => {
  beforeAll(() => {
    fijarMulti();
    resetStore();
  });

  afterAll(async () => {
    fijarMulti();
    await conTenant("tenant-a", async () => {
      const db = getTenantDb();
      // Por qué por id: el último PATCH deja el nombre en mayúsculas.
      if (idPG) await db.delete(locations).where(eq(locations.id, idPG));
    });
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("renombrar escribe en locations y acepta cambiar solo mayúsculas de la propia", async () => {
    const loc = (await conTenant("tenant-a", () =>
      postLocations(post({ nombre: nombrePG })),
    )) as Response;
    expect(loc.status).toBe(201);
    const ubicacion = (await loc.json()) as { id: string };
    idPG = ubicacion.id;
    const r = (await conTenant("tenant-a", () =>
      patchLocations(patch({ id: ubicacion.id, nombre: renombradaPG })),
    )) as Response;
    expect(r.status).toBe(200);
    const filas = await conTenant("tenant-a", async () =>
      getTenantDb()
        .select({ nombre: locations.nombre })
        .from(locations)
        .where(eq(locations.id, ubicacion.id)),
    );
    expect(filas[0]?.nombre).toBe(renombradaPG);
    const r2 = (await conTenant("tenant-a", () =>
      patchLocations(patch({ id: ubicacion.id, nombre: renombradaPG.toUpperCase() })),
    )) as Response;
    expect(r2.status).toBe(200);
  });
});
