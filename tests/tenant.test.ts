import { describe, expect, it } from "vitest";
import { pgTable, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  conModoTenant,
  conTenant,
  dondeTenant,
  filaConTenant,
  tenantIdAlSellar,
  tenantIdShared,
  tenantUuidMulti,
  UUID_TENANT,
  type ModoTenant,
} from "../src/lib/tenant.js";

const UUID_DEFECTO = "00000000-0000-4000-8000-000000000001";
const UUID_CONTEXTO = "00000000-0000-4000-8000-000000000002";

const t = pgTable("t", { id: text("id") });

const modoSingle: ModoTenant = { esModoMulti: false, esModoShared: false, tenantPorDefecto: UUID_DEFECTO };
const modoMulti: ModoTenant = { esModoMulti: true, esModoShared: false, tenantPorDefecto: "slice0" };
const modoShared: ModoTenant = { esModoMulti: false, esModoShared: true, tenantPorDefecto: "slice0" };

describe("tenant module — single mode", () => {
  it("tenantIdAlSellar returns default uuid when no context", () => {
    expect(conModoTenant(modoSingle, () => tenantIdAlSellar())).toBe(UUID_DEFECTO);
  });
  it("tenantIdAlSellar preserves an uuid context", () => {
    expect(conModoTenant(modoSingle, () => conTenant(UUID_CONTEXTO, () => tenantIdAlSellar()))).toBe(UUID_CONTEXTO);
  });
  it("tenantIdShared returns null outside shared mode", () => {
    expect(conModoTenant(modoSingle, () => tenantIdShared())).toBeNull();
  });
  it("dondeTenant returns extra untouched outside shared mode", () => {
    const extra = sql`true`;
    expect(conModoTenant(modoSingle, () => dondeTenant(t.id, extra))).toBe(extra);
  });
  it("filaConTenant adds the default uuid when missing", () => {
    expect(conModoTenant(modoSingle, () => filaConTenant({ nombre: "x" })).tenantId).toBe(UUID_DEFECTO);
  });
  it("filaConTenant preserves an existing valid uuid", () => {
    expect(conModoTenant(modoSingle, () => filaConTenant({ tenantId: UUID_CONTEXTO })).tenantId).toBe(UUID_CONTEXTO);
  });
});

describe("tenant module — multi mode", () => {
  it("tenantIdAlSellar derives an uuid from a slug context", () => {
    const out = conModoTenant(modoMulti, () => conTenant("acme", () => tenantIdAlSellar()));
    expect(out).toBe(tenantUuidMulti("acme"));
    expect(UUID_TENANT.test(out!)).toBe(true);
  });
  it("tenantIdAlSellar returns undefined with no context", () => {
    expect(conModoTenant(modoMulti, () => tenantIdAlSellar())).toBeUndefined();
  });
  it("tenantIdAlSellar preserves an uuid context", () => {
    expect(conModoTenant(modoMulti, () => conTenant(UUID_CONTEXTO, () => tenantIdAlSellar()))).toBe(UUID_CONTEXTO);
  });
  it("tenantIdShared returns null outside shared mode", () => {
    expect(conModoTenant(modoMulti, () => tenantIdShared())).toBeNull();
  });
  it("filaConTenant throws when there is no context", () => {
    expect(() => conModoTenant(modoMulti, () => filaConTenant({}))).toThrow("Falta tenant_id para persistir");
  });
  it("tenantUuidMulti is deterministic and shaped as uuid", () => {
    expect(tenantUuidMulti("acme")).toBe(tenantUuidMulti("acme"));
    expect(UUID_TENANT.test(tenantUuidMulti("acme"))).toBe(true);
  });
});

describe("tenant module — shared mode", () => {
  it("tenantIdAlSellar returns the context tenant", () => {
    expect(conModoTenant(modoShared, () => conTenant(UUID_CONTEXTO, () => tenantIdAlSellar()))).toBe(UUID_CONTEXTO);
  });
  it("tenantIdAlSellar throws without context", () => {
    expect(() => conModoTenant(modoShared, () => tenantIdAlSellar())).toThrow("Falta tenant");
  });
  it("tenantIdShared throws without context", () => {
    expect(() => conModoTenant(modoShared, () => tenantIdShared())).toThrow("Falta tenant");
  });
  it("tenantIdShared returns the context tenant", () => {
    expect(conModoTenant(modoShared, () => conTenant(UUID_CONTEXTO, () => tenantIdShared()))).toBe(UUID_CONTEXTO);
  });
  it("dondeTenant builds a tenant condition", () => {
    const extra = undefined;
    const cond = conModoTenant(modoShared, () => conTenant(UUID_CONTEXTO, () => dondeTenant(t.id, extra)));
    expect(cond).not.toBe(extra);
  });
  it("filaConTenant throws without context", () => {
    expect(() => conModoTenant(modoShared, () => filaConTenant({}))).toThrow("Falta tenant");
  });
});
