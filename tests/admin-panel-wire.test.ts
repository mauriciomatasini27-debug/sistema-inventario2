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
  // Fase 2: el panel ya no muestra rollouts, señales, mora suelta ni el heat.
  // Se cablean tenants, flags, cobro, reportes y la reauth.
  it("el panel simplificado cablea tenants, flags, cobro, reportes y reauth", () => {
    expect(html).toContain('id="tenants-tabla"');
    expect(html).toContain('id="buscar"');
    expect(html).toContain('id="tenant-detalle"');
    expect(html).toContain('fetch("/api/admin/tenants"');
    expect(html).toContain('fetch("/api/admin/flags"');
    expect(html).toContain('"/api/admin/ledger/asentar"');
    expect(html).toContain('"/api/admin/reportes?estado=recibido"');
    expect(html).toContain('"/api/admin/reportes/"');
    expect(html).toContain('accion: "estado"');
    expect(html).toContain("confirmo_id");
    expect(html).toContain("idempotency_key");
    expect(html).toContain("reauth_requerida");
    expect(html).toContain("suspender_abuso");
    expect(html).not.toContain('id="composicion"');
    expect(html).not.toContain('id="dona-');
    expect(html).not.toContain("GET/POST /api/admin/tenants");
  });

  it("ya no declara la tabla de mora suelta ni el dry-run", () => {
    expect(html).not.toContain('id="mora-tabla"');
    expect(html).not.toContain('id="mora-dryrun"');
    expect(html).not.toContain('data-admin-accion="mora-evaluar"');
    expect(html).not.toContain("ejecutarAccionMora");
    expect(html).not.toContain("HEAT_SLOTS");
    expect(html).not.toContain('"/api/admin/rollouts"');
    expect(html).not.toContain('"/api/admin/senales/consumir"');
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
