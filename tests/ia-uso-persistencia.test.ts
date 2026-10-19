import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { tenants } from "../src/db/schema.js";
import { aiUsage, usageCounters } from "../src/db/schema-planes.js";
import { crearAsistente } from "../src/modules/ia/asistente.js";
import { ProveedorLLMFake } from "../src/modules/ia/proveedor.js";
import { crearRegistroUsoIA, olvidarUsoIAMemoria } from "../src/lib/repos/ia-uso.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

describe("IA-S5 memoria: registro por consulta con aislamiento por tenant y mes", () => {
  beforeEach(() => {
    modoSingleSinDb();
    olvidarUsoIAMemoria();
  });

  it("una fila por consulta: usoDelMes cuenta filas y suma tokens y costo", async () => {
    const registro = crearRegistroUsoIA();
    await registro.registrar({
      tenantId: "t1",
      mes: "2026-10",
      proveedor: "fake",
      modelo: "chico",
      tokensEntrada: 10,
      tokensSalida: 5,
      costoCentavos: 3,
    });
    await registro.registrar({
      tenantId: "t1",
      mes: "2026-10",
      proveedor: "fake",
      modelo: "chico",
      tokensEntrada: 4,
      tokensSalida: 2,
      costoCentavos: 1,
    });
    expect(await registro.usoDelMes("t1", "2026-10")).toEqual({
      consultas: 2,
      tokensEntrada: 14,
      tokensSalida: 7,
      costoCentavos: 4,
    });
  });

  it("aísla por tenant y por mes: mes nuevo arranca en cero", async () => {
    const registro = crearRegistroUsoIA();
    await registro.registrar({ tenantId: "t1", mes: "2026-10", tokensEntrada: 1, tokensSalida: 1, costoCentavos: 0 });
    expect(await registro.usoDelMes("t1", "2026-11")).toEqual({
      consultas: 0,
      tokensEntrada: 0,
      tokensSalida: 0,
      costoCentavos: 0,
    });
    expect(await registro.usoDelMes("t2", "2026-10")).toEqual({
      consultas: 0,
      tokensEntrada: 0,
      tokensSalida: 0,
      costoCentavos: 0,
    });
  });

  it("el asistente con cupo agotado avisa y no llama al LLM", async () => {
    const registro = crearRegistroUsoIA();
    const proveedor = new ProveedorLLMFake();
    const asistente = crearAsistente({
      proveedor,
      registro,
      lecturas: { top_productos: () => [{ nombre: "Yerba", cantidad: 5 }] },
      cupoConsultasPorMes: 1,
      mesActual: () => "2026-10",
    });
    const ok = await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?");
    expect(ok.rechazada).toBe(false);
    const sinCupo = await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?");
    expect(sinCupo.rechazada).toBe(true);
    expect(sinCupo.texto).toMatch(/cupo/i);
    expect(proveedor.llamadas).toBe(1);
  });

  it("mes nuevo reinicia el cupo del asistente", async () => {
    const registro = crearRegistroUsoIA();
    const proveedor = new ProveedorLLMFake();
    let mes = "2026-10";
    const asistente = crearAsistente({
      proveedor,
      registro,
      lecturas: { top_productos: () => [{ nombre: "Yerba", cantidad: 5 }] },
      cupoConsultasPorMes: 1,
      mesActual: () => mes,
    });
    expect((await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?")).rechazada).toBe(
      false,
    );
    mes = "2026-11";
    expect((await asistente.preguntar({ tenantId: "t1", rol: "dueno" }, "¿qué vendí más esta semana?")).rechazada).toBe(
      false,
    );
    expect(proveedor.llamadas).toBe(2);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const sufijoPG = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const uuidA = randomUUID();
const uuidB = randomUUID();

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env["TENANT_DATABASE_URL_tenant-a"] = process.env.PG_TEST_URL_A ?? "";
  process.env["TENANT_DATABASE_URL_tenant-b"] = process.env.PG_TEST_URL_B ?? "";
}

async function asegurarTenantDb(tenant: "tenant-a" | "tenant-b", id: string) {
  await conTenant(tenant, async () => {
    await getTenantDb()
      .insert(tenants)
      .values({ id, nombreComercio: `IA uso ${sufijoPG}`, slug: `ia-uso-${sufijoPG}-${tenant}` })
      .onConflictDoNothing();
  });
}

async function borrarRastroPG() {
  for (const [tenant, id] of [["tenant-a", uuidA], ["tenant-b", uuidB]] as const) {
    await conTenant(tenant, async () => {
      const db = getTenantDb();
      await db.delete(aiUsage).where(eq(aiUsage.tenantId, id));
      await db.delete(usageCounters).where(eq(usageCounters.tenantId, id));
      await db.delete(tenants).where(eq(tenants.id, id));
    });
  }
}

describe.skipIf(!hayPG)("IA-S5 PG: ai_usage persiste una fila por consulta, aislado A/B y por mes", () => {
  beforeAll(async () => {
    fijarMulti();
    olvidarUsoIAMemoria();
    await asegurarTenantDb("tenant-a", uuidA);
    await asegurarTenantDb("tenant-b", uuidB);
  });

  afterAll(async () => {
    fijarMulti();
    await borrarRastroPG();
    delete process.env.TENANT_MODE;
    delete process.env["TENANT_DATABASE_URL_tenant-a"];
    delete process.env["TENANT_DATABASE_URL_tenant-b"];
  });

  it("persiste una fila por consulta con tenant, mes, proveedor, modelo, tokens y costo", async () => {
    fijarMulti();
    await conTenant("tenant-a", () =>
      crearRegistroUsoIA().registrar({
        tenantId: uuidA,
        mes: "2026-10",
        proveedor: "fake",
        modelo: "chico",
        tokensEntrada: 10,
        tokensSalida: 5,
        costoCentavos: 3,
      }),
    );
    const filas = await conTenant("tenant-a", () =>
      getTenantDb().select().from(aiUsage).where(eq(aiUsage.tenantId, uuidA)),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      tenantId: uuidA,
      mes: "2026-10",
      proveedor: "fake",
      modelo: "chico",
      tokensIn: 10,
      tokensOut: 5,
    });
    expect(filas[0]!.costoCentavos).toBe(3n);
  });

  it("usoDelMes agrega con SQL y B no ve las filas de A", async () => {
    fijarMulti();
    await conTenant("tenant-a", () =>
      crearRegistroUsoIA().registrar({ tenantId: uuidA, mes: "2026-10", tokensEntrada: 4, tokensSalida: 2, costoCentavos: 1 }),
    );
    await conTenant("tenant-a", async () => {
      expect(await crearRegistroUsoIA().usoDelMes(uuidA, "2026-10")).toEqual({
        consultas: 2,
        tokensEntrada: 14,
        tokensSalida: 7,
        costoCentavos: 4,
      });
      expect(await crearRegistroUsoIA().usoDelMes(uuidA, "2026-11")).toEqual({
        consultas: 0,
        tokensEntrada: 0,
        tokensSalida: 0,
        costoCentavos: 0,
      });
    });
    await conTenant("tenant-b", async () => {
      expect(await crearRegistroUsoIA().usoDelMes(uuidB, "2026-10")).toEqual({
        consultas: 0,
        tokensEntrada: 0,
        tokensSalida: 0,
        costoCentavos: 0,
      });
    });
  });

  it("cada consulta suma el contador usage_counters asistente_ia", async () => {
    fijarMulti();
    const filas = await conTenant("tenant-a", () =>
      getTenantDb()
        .select()
        .from(usageCounters)
        .where(eq(usageCounters.tenantId, uuidA)),
    );
    const propias = filas.filter((f) => f.feature === "asistente_ia" && f.mes === "2026-10");
    expect(propias).toHaveLength(1);
    expect(propias[0]).toMatchObject({ usado: 2, mes: "2026-10", feature: "asistente_ia" });
  });

  it("el cupo agotado sigue bloqueando con el registro en DB", async () => {
    fijarMulti();
    const proveedor = new ProveedorLLMFake();
    const asistente = await conTenant("tenant-a", async () =>
      crearAsistente({
        proveedor,
        registro: crearRegistroUsoIA(),
        lecturas: { top_productos: () => [{ nombre: "Yerba", cantidad: 5 }] },
        cupoConsultasPorMes: 1,
        mesActual: () => "2026-12",
      }),
    );
    const ok = await conTenant("tenant-a", () =>
      asistente.preguntar({ tenantId: uuidA, rol: "dueno" }, "¿qué vendí más esta semana?"),
    );
    expect(ok.rechazada).toBe(false);
    const sinCupo = await conTenant("tenant-a", () =>
      asistente.preguntar({ tenantId: uuidA, rol: "dueno" }, "¿qué vendí más esta semana?"),
    );
    expect(sinCupo.rechazada).toBe(true);
    expect(sinCupo.texto).toMatch(/cupo/i);
    expect(proveedor.llamadas).toBe(1);
  });
});
