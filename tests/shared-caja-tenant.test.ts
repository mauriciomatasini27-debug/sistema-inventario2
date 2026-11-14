import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cashMovements } from "../src/db/schema.js";
import { getTenantDb } from "../src/lib/db.js";
import { obtenerBalance, listarMovimientos } from "../src/lib/repos/caja.js";
import {
  insertarMovimientosCaja,
  listarMovimientosCaja,
  type MovimientoCajaNuevo,
  type SesionCaja,
} from "../src/lib/repos/movimientos-caja.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { registrar_movimiento_db_first } from "../src/modules/cash/registro_movimiento.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

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

function movimiento(key: string, montoCentavos: bigint): MovimientoCajaNuevo {
  return {
    idempotencyKey: key,
    tipo: "ingreso",
    metodo: "Efectivo",
    categoriaId: "general",
    origen: "ajuste",
    montoCentavos,
  };
}

function esClaveUnica(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur; i++) {
    if (typeof cur === "object" && cur !== null && "code" in cur && (cur as { code: unknown }).code === "23505") return true;
    const msg = cur instanceof Error ? cur.message : String(cur);
    if (msg.includes("cash_movements_idempotency_key_unique")) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

describe("ADR-0116 C5 caja shared en memoria", () => {
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

  it("A no ve el balance ni el historial de B", async () => {
    const alta = (key: string, monto: number) =>
      registrar_movimiento_db_first({
        key,
        tipo: "ingreso",
        metodo: "Efectivo",
        categoria_id: "general",
        origen: "ajuste",
        monto_centavos: monto,
      });
    const a = await conTenant("tenant-a", () => alta("c5-mem-a", 1000));
    const b = await conTenant("tenant-b", () => alta("c5-mem-b", 4000));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const balA = await conTenant("tenant-a", () => obtenerBalance());
    const histA = await conTenant("tenant-a", () => listarMovimientos());
    const balB = await conTenant("tenant-b", () => obtenerBalance());
    const histB = await conTenant("tenant-b", () => listarMovimientos());

    expect(balA.fuente).toBe("memoria");
    expect(balA.total).toBe("1000");
    expect(histA.map((m) => m.idempotency_key)).toEqual(["c5-mem-a"]);
    expect(balB.total).toBe("4000");
    expect(histB.map((m) => m.idempotency_key)).toEqual(["c5-mem-b"]);
  });

  it("una lista vacía no pide tenant ni escribe", async () => {
    let escribio = false;
    const db = {
      insert() {
        escribio = true;
        return { values: () => Promise.reject(new Error("no debía escribir")) };
      },
    };
    await insertarMovimientosCaja(db as unknown as SesionCaja, []);
    expect(escribio).toBe(false);
  });
});

describe.skipIf(!hayPG)("ADR-0116 C5 caja shared en Postgres", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const claves: string[] = [];
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    claves.length = 0;
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(async () => {
    try {
      if (claves.length > 0 && process.env.TENANT_DATABASE_URL) {
        await conTenant(tenantA, async () => {
          await getTenantDb().delete(cashMovements).where(inArray(cashMovements.idempotencyKey, [...claves]));
        });
      }
    } finally {
      restaurarEnv(snap);
      resetStore();
    }
  });

  it("A no ve la caja de B y una fila sin tenant queda invisible", async () => {
    const keyA = `c5-a-${randomUUID()}`;
    const keyB = `c5-b-${randomUUID()}`;
    const keyNull = `c5-null-${randomUUID()}`;
    claves.push(keyA, keyB, keyNull);

    await conTenant(tenantA, () => insertarMovimientosCaja(getTenantDb(), [movimiento(keyA, 1000n)]));
    await conTenant(tenantB, () => insertarMovimientosCaja(getTenantDb(), [movimiento(keyB, 4000n)]));
    await conTenant(tenantA, () =>
      getTenantDb().insert(cashMovements).values(
        filaPg(
          {
            idempotencyKey: keyNull,
            tipo: "ingreso",
            metodo: "Efectivo",
            categoriaId: "general",
            origen: "ajuste",
            montoCentavos: 9_999_999n,
          },
          tenantA,
        ),
      ),
    );

    const balA = await conTenant(tenantA, () => obtenerBalance());
    const histA = await conTenant(tenantA, () => listarMovimientos());
    const balB = await conTenant(tenantB, () => obtenerBalance());
    const histB = await conTenant(tenantB, () => listarMovimientos());

    expect(balA.fuente).toBe("db");
    expect(balA.total).toBe("1000");
    expect(histA.map((m) => m.idempotency_key)).toEqual([keyA]);
    expect(balB.fuente).toBe("db");
    expect(balB.total).toBe("4000");
    expect(histB.map((m) => m.idempotency_key)).toEqual([keyB]);

    const visto = await conTenant(tenantB, () => listarMovimientosCaja(getTenantDb(), { tipo: "clave", idempotencyKey: keyA }));
    expect(visto).toEqual([]);

    let rechazo: unknown = null;
    try {
      await conTenant(tenantB, () => insertarMovimientosCaja(getTenantDb(), [movimiento(keyA, 1n)]));
    } catch (e) {
      rechazo = e;
    }
    expect(esClaveUnica(rechazo)).toBe(true);
    const releido = await conTenant(tenantB, () => listarMovimientosCaja(getTenantDb(), { tipo: "clave", idempotencyKey: keyA }));
    expect(releido).toEqual([]);
  });

  it("en single el alta deja tenant_id null y el listado ve la fila", async () => {
    process.env.TENANT_MODE = "single";
    const key = `c5-single-${randomUUID()}`;
    claves.push(key);
    const db = getTenantDb();
    await insertarMovimientosCaja(db, [movimiento(key, 700n)]);
    const cruda = await db.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, key));
    expect(cruda).toHaveLength(1);
    expect(cruda[0]?.tenantId ?? null).toBeNull();
    const lista = await listarMovimientos();
    expect(lista.some((m) => m.idempotency_key === key)).toBe(true);
  });
});
