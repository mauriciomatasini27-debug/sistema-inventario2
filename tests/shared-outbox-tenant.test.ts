import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { idMappings, outbox } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { empujarOperacion, leerLote, type PushEntrada } from "../src/lib/repos/sync.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const hayPG = Boolean(process.env.PG_TEST_URL_A);

function guardarEnv(): Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> {
  const snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
  for (const k of ENV_KEYS) snap[k] = process.env[k];
  return snap;
}

function restaurarEnv(snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>): void {
  for (const k of ENV_KEYS) {
    const v = snap[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function entrada(opId: string, deviceSeq: number, marca: string): PushEntrada {
  return {
    opId,
    deviceCode: "caja-shared",
    deviceSeq,
    hlc: `${deviceSeq}:1`,
    modulo: "ajuste",
    payload: { marca },
  };
}

describe("ADR-0116 outbox shared en memoria", () => {
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(() => {
    restaurarEnv(snap);
    resetStore();
  });

  it("el pull de A no trae la op ni el cursor de B", async () => {
    const opA = randomUUID();
    const opB = randomUUID();
    const a = await conTenant("tenant-a", () => empujarOperacion(entrada(opA, 1, "A")));
    const b = await conTenant("tenant-b", () => empujarOperacion(entrada(opB, 1, "B")));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.cuerpo["cursor_nuevo"]).toBe("1");
    expect(b.cuerpo["cursor_nuevo"]).toBe("1");

    const loteA = await conTenant("tenant-a", () => leerLote(0, 50));
    const loteB = await conTenant("tenant-b", () => leerLote(0, 50));
    expect(loteA.fuente).toBe("memoria");
    expect(loteB.fuente).toBe("memoria");
    expect(loteA.movimientos.map((m) => m.op_id)).toEqual([opA]);
    expect(loteB.movimientos.map((m) => m.op_id)).toEqual([opB]);
    expect(loteA.total).toBe(1);
    expect(loteB.total).toBe(1);
  });
});

describe.skipIf(!hayPG)("ADR-0116 outbox shared en Postgres", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const ops: string[] = [];
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    ops.length = 0;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
    resetStore();
  });

  afterEach(async () => {
    try {
      if (ops.length > 0 && process.env.TENANT_DATABASE_URL) {
        await conTenant(tenantA, async () => {
          const db = getTenantDb();
          await db.delete(idMappings).where(inArray(idMappings.opId, [...ops]));
          await db.delete(outbox).where(inArray(outbox.opId, [...ops]));
        });
      }
    } finally {
      resetStore();
      restaurarEnv(snap);
    }
  });

  it("el pull de A no trae ops de B ni una fila sin tenant", async () => {
    const opA = randomUUID();
    const opB = randomUUID();
    const opNull = randomUUID();
    ops.push(opA, opB, opNull);

    const a = await conTenant(tenantA, () => empujarOperacion(entrada(opA, 5, "A")));
    const b = await conTenant(tenantB, () => empujarOperacion(entrada(opB, 1, "B")));
    expect(a.status).toBe(201);
    expect(a.cuerpo["fuente"]).toBe("db");
    expect(a.cuerpo["cursor_nuevo"]).toBe("1");
    expect(a.cuerpo["id_mapeado"]).toBe(`srv-${opA.slice(0, 8)}`);
    expect(b.status).toBe(201);
    expect(b.cuerpo["cursor_nuevo"]).toBe("1");

    const crudaA = await conTenant(tenantA, () => getTenantDb().select().from(outbox).where(inArray(outbox.opId, [opA])));
    const mapaA = await conTenant(tenantA, () => getTenantDb().select().from(idMappings).where(inArray(idMappings.opId, [opA])));
    expect(crudaA[0]?.tenantId).toBe(tenantA);
    expect(mapaA[0]?.tenantId).toBe(tenantA);

    await conTenant(tenantA, () =>
      getTenantDb()
        .insert(outbox)
        .values({
          opId: opNull,
          deviceCode: "caja-shared",
          deviceSeq: 9,
          hlc: "9:1",
          modulo: "ajuste",
          payload: { marca: "huerfana" },
        }),
    );

    const loteA = await conTenant(tenantA, () => leerLote(0, 50));
    const loteB = await conTenant(tenantB, () => leerLote(0, 50));
    expect(loteA.fuente).toBe("db");
    expect(loteA.total).toBe(1);
    expect(loteA.movimientos.map((m) => m.op_id)).toEqual([opA]);
    expect(loteA.mappings.map((m) => m.op_id)).toEqual([opA]);
    expect(loteB.fuente).toBe("db");
    expect(loteB.total).toBe(1);
    expect(loteB.movimientos.map((m) => m.op_id)).toEqual([opB]);
    expect(loteB.mappings.map((m) => m.op_id)).toEqual([opB]);
    expect(JSON.stringify(loteA)).not.toContain("huerfana");
    expect(JSON.stringify(loteB)).not.toContain("huerfana");
  });

  it("el push de B con el op_id de A no devuelve el payload de A", async () => {
    const opA = randomUUID();
    ops.push(opA);
    const a = await conTenant(tenantA, () => empujarOperacion(entrada(opA, 1, "solo-a")));
    expect(a.status).toBe(201);

    let vioA = false;
    try {
      const cruce = await conTenant(tenantB, () => empujarOperacion(entrada(opA, 1, "solo-b")));
      vioA = JSON.stringify(cruce).includes("solo-a");
    } catch {
      vioA = false;
    }
    expect(vioA).toBe(false);

    const loteA = await conTenant(tenantA, () => leerLote(0, 50));
    expect(loteA.movimientos).toEqual([{ op_id: opA, payload: { marca: "solo-a" } }]);
    const loteB = await conTenant(tenantB, () => leerLote(0, 50));
    expect(loteB.movimientos.map((m) => m.op_id)).not.toContain(opA);
  });

  it("en single el alta deja tenant_id null y el pull ve la fila", async () => {
    process.env.TENANT_MODE = "single";
    const op = randomUUID();
    ops.push(op);
    const r = await empujarOperacion(entrada(op, 1, "single"));
    expect(r.status).toBe(201);
    expect(r.cuerpo["fuente"]).toBe("db");
    const db = getTenantDb();
    const cruda = await db.select().from(outbox).where(inArray(outbox.opId, [op]));
    expect(cruda).toHaveLength(1);
    expect(cruda[0]?.tenantId ?? null).toBeNull();
    const lote = await leerLote(0, 50);
    expect(lote.movimientos.some((m) => m.op_id === op)).toBe(true);
  });
});
