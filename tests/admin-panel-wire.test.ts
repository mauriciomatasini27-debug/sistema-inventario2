import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { adminStore, type AdminActoMem, type AdminAsientoMem } from "../src/lib/admin-store.js";
import {
  _resetHydrateGateForTests,
  asegurarAdminHidratado,
  fusionarHidratacion,
  type HidratacionLeida,
} from "../src/lib/admin-hydrate.js";

const html = readFileSync("src/pages/admin.astro", "utf8");

describe("ADMIN-PANEL-WIRE tarjetas", () => {
  it("declara data-admin-accion y los endpoints que ya existen", () => {
    expect(html).toContain("data-admin-accion");
    expect(html).toContain('"/api/admin/rollouts"');
    expect(html).toContain('"/api/admin/flags"');
    expect(html).toContain('"/api/admin/ledger/asentar"');
    expect(html).toContain('"/api/admin/senales/consumir"');
    expect(html).toContain('"/api/admin/reportes/"');
    expect(html).toContain("accion: \"estado\"");
    expect(html).toContain("confirmo_id");
    expect(html).toContain("idempotency_key");
    expect(html).toContain("r.status === 409 && abierta === key && key");
    expect(html).toContain("ultimaSenalEn");
    expect(html).toContain("b.consumidas");
    expect(html).toContain("b.descartadas");
    expect(html).toContain("for (let i = 0; i < 12; i++)");
  });

  it("manda la suspensión a Tenants y no promete mora/suspender ni regularizar", () => {
    expect(html).toContain('href="#tenants"');
    expect(html).toContain("Suspender y reactivar están en");
    expect(html).not.toContain("/api/admin/mora/");
    expect(html).not.toContain("data-admin-accion=\"mora-");
  });
});

function vacio(): HidratacionLeida {
  return {
    actos: [],
    health: [],
    asientos: [],
    eventosVida: [],
    overrides: [],
    policies: new Map(),
    usoDiario: new Map(),
  };
}

function acto(hash: string, creadoEn: string): AdminActoMem {
  return {
    id: hash,
    actorGoogleSub: "sub",
    actoKind: "cobro_asentado",
    tenantId: "t",
    detalle: { kind: "cobro_asentado", tenantId: "t", ledgerEntryId: "l" },
    prevHash: null,
    hash,
    origen: "panel",
    creadoEn,
  };
}

function asiento(id: string, idempotencyKey: string): AdminAsientoMem {
  return {
    id,
    tenantId: "t",
    montoCentavos: 100n,
    medio: "transferencia",
    referenciaExterna: "ref",
    idempotencyKey,
    creadoPor: "sub",
    creadoEn: "2026-11-15T00:00:00.000Z",
  };
}

describe("ADMIN-PANEL-WIRE hidratación", () => {
  beforeEach(() => {
    _resetHydrateGateForTests();
  });

  it("no mezcla el audit log si este proceso ya tiene actos", () => {
    adminStore.actos.push(acto("mem", "2026-11-15T03:00:00.000Z"));
    fusionarHidratacion({ ...vacio(), actos: [acto("db", "2026-11-14T00:00:00.000Z")] });
    expect(adminStore.actos.map((a) => a.hash)).toEqual(["mem"]);
  });

  it("carga los actos vacíos ordenados por creadoEn", () => {
    fusionarHidratacion({
      ...vacio(),
      actos: [acto("nuevo", "2026-11-15T02:00:00.000Z"), acto("viejo", "2026-11-15T01:00:00.000Z")],
    });
    expect(adminStore.actos.map((a) => a.hash)).toEqual(["viejo", "nuevo"]);
  });

  it("no inserta un asiento cuya idempotencyKey ya está en memoria", () => {
    adminStore.asientos.set("mem", asiento("mem", "k1"));
    const merged = fusionarHidratacion({
      ...vacio(),
      asientos: [asiento("db", "k1"), asiento("nuevo", "k2")],
    });
    expect(adminStore.asientos.has("db")).toBe(false);
    expect(adminStore.asientos.get("nuevo")?.idempotencyKey).toBe("k2");
    expect(merged.asientos).toBe(1);
  });

  it("comparte una promesa y no lee la base si no hay URL de control", async () => {
    const previa = process.env.CONTROL_DATABASE_URL;
    delete process.env.CONTROL_DATABASE_URL;
    try {
      const a = asegurarAdminHidratado();
      const b = asegurarAdminHidratado();
      expect(b).toBe(a);
      await expect(a).resolves.toMatchObject({ ok: false, merged: {} });
    } finally {
      if (previa === undefined) delete process.env.CONTROL_DATABASE_URL;
      else process.env.CONTROL_DATABASE_URL = previa;
    }
  });
});
