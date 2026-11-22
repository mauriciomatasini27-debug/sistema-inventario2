import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { payees } from "../src/db/schema-pagos.js";
import { crearAlmacenPayees } from "../src/lib/repos/_almacen.js";
import { prepararOrdenRepo } from "../src/lib/repos/ordenes-pago.js";
import * as serverDb from "../src/lib/server-db.js";
import { BaseNoDisponible, type TenantDb } from "../src/lib/server-db.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import type { Payee } from "../src/modules/payments/beneficiarios.js";

const tenantId = randomUUID();
const payeeId = randomUUID();

function dbConFalloAlLeerPayees(): TenantDb {
  const q: Record<string, unknown> = {};
  const self = () => q;
  q.from = (tabla: unknown) => {
    if (tabla === payees) throw new Error("base caída al leer beneficiarios");
    return q;
  };
  q.where = self;
  q.limit = () => Promise.resolve([]);
  q.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve([]).then(ok, err);
  const tx = { insert: () => ({ values: () => Promise.resolve() }) };
  return {
    select: () => q,
    transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as TenantDb;
}

function input(key: string) {
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

describe("COM-01 #337: fallo real de DB al leer beneficiarios", () => {
  let modo: string | undefined;

  function sembrarPayee(): void {
    const payee: Payee = {
      id: payeeId,
      nombre: "Distribuidora X",
      tipo: "proveedor",
      medioPreferido: "Transferencia",
      activo: true,
    };
    crearAlmacenPayees().guardar(payeeId, payee);
  }

  beforeEach(() => {
    modo = process.env.TENANT_MODE;
    delete process.env.TENANT_MODE;
    resetStore();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(serverDb, "dbVivaTenant").mockReturnValue(dbConFalloAlLeerPayees());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetStore();
    if (modo === undefined) delete process.env.TENANT_MODE;
    else process.env.TENANT_MODE = modo;
  });

  it("multi: propaga BaseNoDisponible en vez de preparar la orden con la memoria caliente", async () => {
    process.env.TENANT_MODE = "multi";
    conTenant(tenantId, sembrarPayee);
    await expect(conTenant(tenantId, () => prepararOrdenRepo(input("clave-multi")))).rejects.toBeInstanceOf(
      BaseNoDisponible,
    );
  });

  it("single: registra el fallo de DB y sigue con la memoria caliente", async () => {
    sembrarPayee();
    const r = await conTenant(tenantId, () => prepararOrdenRepo(input("clave-single")));
    expect(r.status).toBe(201);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("beneficiarios"),
      expect.objectContaining({ error: expect.objectContaining({ message: "base caída al leer beneficiarios" }) }),
    );
  });
});
