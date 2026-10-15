import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { closingSummaries } from "../src/db/schema-caja.js";
import { cerrarCaja } from "../src/lib/repos/caja.js";

// H1 #78: el conteo QR es informativo; si falla no puede revertir ni
// duplicar un cierre ya persistido. La tabla rota simula el fallo solo en
// la lectura de QR: el insert del cierre y el resto de la base siguen vivos.
vi.mock("../src/db/schema.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/db/schema.js")>();
  const tablaRota = new Proxy(real.cashQrReceipts, {
    get() {
      throw new Error("H1: falla el conteo QR");
    },
  });
  return { ...real, cashQrReceipts: tablaRota };
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const FECHA = "2027-06-16";
const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

async function filasCierreDb() {
  return conTenant("tenant-a", async () =>
    getTenantDb().select().from(closingSummaries).where(eq(closingSummaries.fechaJornada, FECHA)),
  );
}

async function limpiarCierreDb() {
  await conTenant("tenant-a", async () =>
    getTenantDb().delete(closingSummaries).where(eq(closingSummaries.fechaJornada, FECHA)),
  );
}

describe.skipIf(!hayPG)("H1 #78 con DB viva: el fallo del conteo QR no duplica el cierre", () => {
  beforeEach(async () => {
    fijarMulti();
    resetStore();
    await limpiarCierreDb();
  });

  afterAll(async () => {
    fijarMulti();
    await limpiarCierreDb();
    modoSingleSinDb();
  });

  it("cierra 201 con fuente db y qr 0 aunque falle el conteo QR", async () => {
    const r = await conTenant("tenant-a", () =>
      cerrarCaja({ key: `h1-cierre-${sufijo}`, fechaJornada: FECHA, closeType: "manual" }),
    );
    expect(r.status).toBe(201);
    if (r.status !== 201) return;
    expect(r.fuente).toBe("db");
    expect(r.qrSinComprobante).toBe(0);
    expect((await filasCierreDb()).length).toBe(1);
  });

  it("reintento con otra key para la misma fecha es 409 y no agrega filas", async () => {
    const primera = await conTenant("tenant-a", () =>
      cerrarCaja({ key: `h1-cierre-re-${sufijo}`, fechaJornada: FECHA, closeType: "manual" }),
    );
    expect(primera.status).toBe(201);
    const reintento = await conTenant("tenant-a", () =>
      cerrarCaja({ key: `h1-cierre-re2-${sufijo}`, fechaJornada: FECHA, closeType: "manual" }),
    );
    expect(reintento.status).toBe(409);
    expect((await filasCierreDb()).length).toBe(1);
  });
});

describe("H1 #78 en memoria: el fallo del conteo QR no impide el cierre", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("cierra 201 con qr 0 aunque falle el conteo QR", async () => {
    const t0 = Date.now();
    const espia = vi.spyOn(store.qrRecibos, "values").mockImplementation(() => {
      throw new Error("H1: falla el conteo QR");
    });
    try {
      const r = await cerrarCaja({ key: `h1-cierre-mem-${t0}`, fechaJornada: "2026-10-15", closeType: "manual" });
      expect(r.status).toBe(201);
      if (r.status !== 201) return;
      expect(r.fuente).toBe("memoria");
      expect(r.qrSinComprobante).toBe(0);
      const reintento = await cerrarCaja({
        key: `h1-cierre-mem-re-${t0}`,
        fechaJornada: "2026-10-15",
        closeType: "manual",
      });
      expect(reintento.status).toBe(409);
    } finally {
      espia.mockRestore();
    }
  });
});
