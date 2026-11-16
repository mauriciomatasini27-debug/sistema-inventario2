import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore, store } from "../src/lib/store.js";
import { POST as postDue, PATCH as patchDue } from "../src/pages/api/cash/due-items.js";
import { crearVencimiento, pagarVencimiento } from "../src/lib/repos/caja.js";
import { activarTenantPgEnSingle } from "./helpers/pg-tenant-fixture.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

const DIA_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

describe("M2 memoria: doble pago secuencial del mismo vencimiento", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });
  afterEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("segundo pago con clave nueva da 409 ya_pagado y deja un solo egreso", async () => {
    const vence = iso(Date.now() + 2 * DIA_MS);
    const alta = (await postDue(ctx("http://x/api/cash/due-items", { body: { concepto: "M2 luz", vence_el: vence, monto_centavos: 9000 } }))) as Response;
    expect(alta.status).toBe(201);
    const creado = (await alta.json()) as { id: string };

    const p1 = (await patchDue(
      ctx(`http://x/api/cash/due-items?id=${creado.id}`, { method: "PATCH", headers: { "Idempotency-Key": "m2-mem-1" } }),
    )) as Response;
    expect(p1.status).toBe(200);

    const p2 = (await patchDue(
      ctx(`http://x/api/cash/due-items?id=${creado.id}`, { method: "PATCH", headers: { "Idempotency-Key": "m2-mem-2" } }),
    )) as Response;
    expect(p2.status).toBe(409);
    expect(await p2.json()).toEqual({ error: "ya_pagado" });

    expect(store.movements.filter((m) => m.origen === `vencimiento:${creado.id}`)).toHaveLength(1);
  });
});

const PG_URL = process.env.PG_TEST_URL ?? process.env.PG_TEST_URL_A ?? "";
const hayPG = Boolean(PG_URL);

function modoSinglePG(url: string) {
  modoSingleSinDb();
  process.env.TENANT_DATABASE_URL = url;
  activarTenantPgEnSingle();
}

async function prepararTablas() {
  const { readFileSync } = await import("node:fs");
  const { sql } = await import("drizzle-orm");
  const { getTenantDb } = await import("../src/lib/db.js");
  const db = getTenantDb();
  try {
    await db.execute(sql.raw(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`));
  } catch {
    // El default gen_random_uuid no se usa: los ids los genera el repo.
  }
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "cash_movements" (
    "id" uuid PRIMARY KEY NOT NULL,
    "idempotency_key" text NOT NULL,
    "sale_id" uuid,
    "tipo" text NOT NULL,
    "metodo" text NOT NULL,
    "categoria_id" text NOT NULL,
    "origen" text NOT NULL,
    "monto_centavos" bigint NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "cash_movements_idempotency_key_unique" UNIQUE("idempotency_key")
  )`));
  const mig = readFileSync("drizzle/0023_cash_due_items.sql", "utf8");
  for (const parte of mig.split("--> statement-breakpoint")) {
    const stmt = parte.trim();
    if (stmt) await db.execute(sql.raw(stmt));
  }
}

describe.skipIf(!hayPG)("M2 PG: pago concurrente del mismo vencimiento", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
    delete process.env.TENANT_DATABASE_URL;
  });
  afterEach(() => {
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
    modoSingleSinDb();
    resetStore();
  });

  it("dos pagos concurrentes dan un 200 y un 409 con un solo cash_movement enlazado", async () => {
    const { eq } = await import("drizzle-orm");
    const { getTenantDb } = await import("../src/lib/db.js");
    const { cashDueItems, cashMovements } = await import("../src/db/schema.js");
    modoSinglePG(PG_URL);
    resetStore();
    await prepararTablas();
    const sello = Date.now();
    const d = await crearVencimiento({ concepto: "M2 concurrente", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 12000 });
    try {
      const [r1, r2] = await Promise.all([
        pagarVencimiento({ id: d.id, key: `m2-pg-a-${sello}`, metodo: "Transferencia" }),
        pagarVencimiento({ id: d.id, key: `m2-pg-b-${sello}`, metodo: "Transferencia" }),
      ]);
      const oks = [r1, r2].filter((r) => r.status === 200);
      const perdidos = [r1, r2].filter((r) => r.status === 409);
      expect(oks).toHaveLength(1);
      expect(perdidos).toHaveLength(1);
      expect(perdidos[0]).toEqual({ status: 409, error: "ya_pagado" });
      const egresoId = oks[0]?.status === 200 ? oks[0].egresoId : "";
      expect(typeof egresoId).toBe("string");

      const movs = await getTenantDb().select().from(cashMovements).where(eq(cashMovements.origen, `vencimiento:${d.id}`));
      expect(movs).toHaveLength(1);
      expect(movs[0]?.id).toBe(egresoId);
      const fila = await getTenantDb().select().from(cashDueItems).where(eq(cashDueItems.id, d.id)).limit(1);
      expect(fila[0]?.estado).toBe("pagada");
      expect(fila[0]?.cashMovementId).toBe(egresoId);
      expect(fila[0]?.pagadoEl instanceof Date).toBe(true);
    } finally {
      const db = getTenantDb();
      await db.delete(cashDueItems).where(eq(cashDueItems.id, d.id));
      const movs = await db.select().from(cashMovements).where(eq(cashMovements.origen, `vencimiento:${d.id}`));
      for (const m of movs) await db.delete(cashMovements).where(eq(cashMovements.id, m.id));
    }
  });

  it("fallo en el insert del movimiento revierte el claim: la fila perdedora sigue pendiente", async () => {
    const { eq } = await import("drizzle-orm");
    const { getTenantDb } = await import("../src/lib/db.js");
    const { cashDueItems, cashMovements } = await import("../src/db/schema.js");
    modoSinglePG(PG_URL);
    resetStore();
    await prepararTablas();
    const sello = Date.now();
    const clave = `m2-pg-misma-${sello}`;
    const a = await crearVencimiento({ concepto: "M2 misma clave A", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 5000 });
    const b = await crearVencimiento({ concepto: "M2 misma clave B", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 7000 });
    try {
      const [ra, rb] = await Promise.all([
        pagarVencimiento({ id: a.id, key: clave, metodo: "Efectivo" }),
        pagarVencimiento({ id: b.id, key: clave, metodo: "Efectivo" }),
      ]);
      const oks = [ra, rb].filter((r) => r.status === 200);
      const perdidos = [ra, rb].filter((r) => r.status === 409);
      expect(oks).toHaveLength(1);
      expect(perdidos).toHaveLength(1);

      const db = getTenantDb();
      const movs = await db.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, clave));
      expect(movs).toHaveLength(1);
      const ganadorId = movs[0]?.origen === `vencimiento:${a.id}` ? a.id : b.id;
      const perdedorId = ganadorId === a.id ? b.id : a.id;
      const perdedora = await db.select().from(cashDueItems).where(eq(cashDueItems.id, perdedorId)).limit(1);
      expect(perdedora[0]?.estado).toBe("pendiente");
      expect(perdedora[0]?.pagadoEl).toBeNull();
      expect(perdedora[0]?.cashMovementId).toBeNull();
    } finally {
      const db = getTenantDb();
      for (const id of [a.id, b.id]) await db.delete(cashDueItems).where(eq(cashDueItems.id, id));
      const movs = await db.select().from(cashMovements).where(eq(cashMovements.idempotencyKey, clave));
      for (const m of movs) await db.delete(cashMovements).where(eq(cashMovements.id, m.id));
    }
  });
});
