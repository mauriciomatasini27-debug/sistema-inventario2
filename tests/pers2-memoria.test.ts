import { readFileSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { store, resetStore } from "../src/lib/store.js";
import { intentarLeer, intentarPersistir } from "../src/lib/server-db.js";
import { GET as balanceGET } from "../src/pages/api/credit/balance.js";

function setMulti() {
  process.env.TENANT_MODE = "multi";
}

function setSingle() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env.TENANT_DATABASE_URL_tenant_a;
  delete process.env.TENANT_DATABASE_URL_tenant_b;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

afterEach(() => {
  setSingle();
  resetStore();
  conTenant("tenant-a", () => resetStore());
  conTenant("tenant-b", () => resetStore());
  setSingle();
});

describe("PERS2-S1 memoria por tenant", () => {
  it("multi: cada tenant tiene su propio estado en memoria", () => {
    setMulti();
    conTenant("tenant-a", () => {
      resetStore();
      store.movements.push({
        id: "m-a1",
        tipo: "ingreso",
        metodo: "Efectivo",
        monto_centavos: "100",
        origen: "test",
        idempotency_key: "k-a1",
      });
      store.stock.set("demo-sku-1", 42);
    });
    conTenant("tenant-b", () => {
      expect(store.movements).toEqual([]);
      expect(store.stock.get("demo-sku-1")).toBe(10);
    });
    conTenant("tenant-a", () => {
      expect(store.movements.length).toBe(1);
      expect(store.stock.get("demo-sku-1")).toBe(42);
    });
  });

  it("multi: fuera de contexto leer store lanza Falta tenant", () => {
    setMulti();
    expect(() => store.movements).toThrow(/Falta tenant/);
  });

  it("multi: resetStore dentro de un contexto resetea solo ese tenant", () => {
    setMulti();
    conTenant("tenant-a", () => {
      resetStore();
      store.movements.push({
        id: "m-a1",
        tipo: "ingreso",
        metodo: "Efectivo",
        monto_centavos: "100",
        origen: "test",
        idempotency_key: "k-a1",
      });
    });
    conTenant("tenant-b", () => {
      resetStore();
      store.movements.push({
        id: "m-b1",
        tipo: "ingreso",
        metodo: "Efectivo",
        monto_centavos: "200",
        origen: "test",
        idempotency_key: "k-b1",
      });
    });
    conTenant("tenant-a", () => resetStore());
    conTenant("tenant-a", () => {
      expect(store.movements).toEqual([]);
    });
    conTenant("tenant-b", () => {
      expect(store.movements.length).toBe(1);
    });
  });

  it("single: un solo estado compartido como hoy", () => {
    setSingle();
    resetStore();
    store.movements.push({
      id: "m-s1",
      tipo: "ingreso",
      metodo: "Efectivo",
      monto_centavos: "100",
      origen: "test",
      idempotency_key: "k-s1",
    });
    expect(store.movements.length).toBe(1);
    store.stock.set("demo-sku-1", 7);
    expect(store.stock.get("demo-sku-1")).toBe(7);
  });
});

describe("PERS2-S2 sin fallback silencioso en multi", () => {
  it("multi sin DB del tenant: intentarLeer e intentarPersistir rechazan", async () => {
    setMulti();
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    await conTenant("tenant-a", async () => {
      await expect(intentarLeer(async () => "x")).rejects.toThrow();
      await expect(intentarPersistir(async () => {})).rejects.toThrow();
    });
  });

  it("multi sin DB del tenant: GET /api/credit/balance responde 503 base_no_disponible", async () => {
    setMulti();
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    const res = await conTenant("tenant-a", () =>
      balanceGET(ctx("http://test/api/credit/balance?customer_id=x")),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "base_no_disponible" });
  });

  it("single sin DB: intentarLeer devuelve null y la ruta responde desde memoria", async () => {
    setSingle();
    await expect(intentarLeer(async () => "x")).resolves.toBeNull();
    resetStore();
    store.creditMovs.push({ customer_id: "cli-1", debe: "300", haber: "0", key: "k1" });
    const res = await balanceGET(ctx("http://test/api/credit/balance?customer_id=cli-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fuente).toBe("memoria");
    expect(body.saldo_centavos).toBe("300");
  });
});

describe("PERS2-AT6 store no es objeto plano", () => {
  it("src/lib/store.ts no exporta store como objeto literal", () => {
    const src = readFileSync(new URL("../src/lib/store.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/export const store = \{/);
  });
});
