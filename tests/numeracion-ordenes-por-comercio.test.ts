import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { paymentOrders, payees } from "../src/db/schema-pagos.js";
import { getTenantDb } from "../src/lib/db.js";
import { prepararOrdenRepo } from "../src/lib/repos/ordenes-pago.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { aplicarHasta, crearBase } from "./helpers/migracion-pg.js";

const PG = process.env.PG_TEST_URL_A;
const ENV = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const tidA = randomUUID();
const tidB = randomUUID();
const payeeA = randomUUID();
const payeeB = randomUUID();
let url = "";
let snap: Partial<Record<(typeof ENV)[number], string | undefined>> = {};

function input(key: string, payeeId: string) {
  return {
    key,
    payeeId,
    concepto: "Factura de prueba",
    montoCentavos: 100_000n,
    venceElMs: Date.UTC(2026, 11, 31),
    medioSugerido: "Transferencia" as const,
    instruccion: "transferencia" as const,
    creadoPor: "duena",
  };
}

describe.skipIf(!PG)("ADR-0123 numeración de órdenes por comercio", () => {
  beforeAll(async () => {
    url = await crearBase(`m55_num_${Date.now()}`, PG!);
    await aplicarHasta("0055_unicidad_por_comercio", url);
  });

  beforeEach(() => {
    snap = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = url;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(() => {
    for (const k of ENV) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
    resetStore();
  });

  it(
    "cada comercio arranca en OP-0001 y avanza por su propia serie, sin cambiar el 409",
    async () => {
      for (const [tid, payeeId, nombre] of [
        [tidA, payeeA, "Payee A"],
        [tidB, payeeB, "Payee B"],
      ] as const) {
        await conTenant(tid, () =>
          getTenantDb().insert(payees).values({
            id: payeeId,
            tenantId: tid,
            nombre,
            tipo: "proveedor",
            medioPreferido: "Transferencia",
            alias: `alias-${payeeId}`,
            activo: true,
          }),
        );
      }

      // A ya emitió OP-0001: con el MAX global de hoy, B arrancaría en OP-0002.
      await conTenant(tidA, () =>
        getTenantDb().insert(paymentOrders).values({
          tenantId: tidA,
          idempotencyKey: "semilla-a",
          numero: "OP-0001",
          payeeId: payeeA,
          concepto: "Semilla A",
          montoCentavos: 100_000n,
          venceEl: new Date(Date.UTC(2026, 11, 31)),
          metodoSugerido: "Transferencia",
          instruccionTipo: "transferencia",
          instruccionSnapshot: { medioSugerido: "Transferencia" },
          creadoPor: "duena",
        }),
      );

      const rB = await conTenant(tidB, () => prepararOrdenRepo(input("clave-b", payeeB)));
      expect(rB.status).toBe(201);
      expect((rB.body as { numero: string }).numero).toBe("OP-0001");

      const rA = await conTenant(tidA, () => prepararOrdenRepo(input("clave-a", payeeA)));
      expect(rA.status).toBe(201);
      expect((rA.body as { numero: string }).numero).toBe("OP-0002");

      const repetida = await conTenant(tidB, () => prepararOrdenRepo(input("clave-b", payeeB)));
      expect(repetida.status).toBe(409);
    },
    120_000,
  );
});
