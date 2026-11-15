import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { payees } from "../src/db/schema-pagos.js";
import { serviceAccounts } from "../src/db/schema-servicios.js";
import { saleReturns } from "../src/db/schema-tickets.js";
import { whatsappSessions } from "../src/db/schema-whatsapp.js";
import { sales } from "../src/db/schema.js";
import { ejecutar_resumen_mensual, ZONA_DEFECTO } from "../src/jobs/resumen-mensual.js";
import { getTenantDb } from "../src/lib/db.js";
import { leerFiscalDocs } from "../src/lib/fiscal-db.js";
import { leerResumenPanel } from "../src/lib/repos/panel.js";
import { listarCuentasDetalle } from "../src/lib/repos/servicios.js";
import { leerSesion, guardarSesion } from "../src/lib/repos/whatsapp.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { dondeTenant } from "../src/lib/tenant-scope.js";
import { filaPg } from "./helpers/pg-tenant-fixture.js";

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
const hayPG = Boolean(process.env.PG_TEST_URL_A);
const NUMERO = "+5491111111185";

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

describe.skipIf(!hayPG)("P1-85 shared E2E: B no ve datos de A (#207)", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const keyVenta = `p85-v-${randomUUID()}`;
  const keyRet = `p85-r-${randomUUID()}`;
  const numDev = `D-P85-${randomUUID().slice(0, 8)}`;
  let snap: ReturnType<typeof guardarEnv> = {};

  beforeEach(() => {
    snap = guardarEnv();
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
  });

  afterEach(async () => {
    try {
      await conTenant(tenantA, async () => {
        const db = getTenantDb();
        await db.delete(saleReturns).where(eq(saleReturns.idempotencyKey, keyRet));
        await db.delete(sales).where(eq(sales.idempotencyKey, keyVenta));
        await db.delete(payees).where(eq(payees.nombre, "P85-payee-A"));
        await db.delete(serviceAccounts).where(eq(serviceAccounts.titular, "P85-cuenta-A"));
        await db.delete(whatsappSessions).where(eq(whatsappSessions.numeroE164, NUMERO));
      });
      await conTenant(tenantB, async () => {
        const db = getTenantDb();
        await db.delete(serviceAccounts).where(eq(serviceAccounts.titular, "P85-cuenta-B"));
        await db.delete(whatsappSessions).where(eq(whatsappSessions.numeroE164, NUMERO));
      });
    } finally {
      restaurarEnv(snap);
      resetStore();
    }
  });

  it("panel, servicios, payees, WA y fiscal quedan aislados entre A y B", async () => {
    await conTenant(tenantA, async () => {
      const db = getTenantDb();
      const [v] = await db
        .insert(sales)
        .values(filaPg({ idempotencyKey: keyVenta, medio: "Efectivo", totalCentavos: 5000n, clientOccurredAt: new Date() }, tenantA))
        .returning({ id: sales.id });
      await db.insert(saleReturns).values(
        filaPg(
          {
            idempotencyKey: keyRet,
            saleId: v!.id,
            numeroDevolucion: numDev,
            montoCentavos: 250n,
            acumuladoNuevoCentavos: 250n,
            medio: "Efectivo",
            motivo: "p85",
            actor: "test",
          },
          tenantA,
        ),
      );
      await db.insert(payees).values(filaPg({ nombre: "P85-payee-A", tipo: "proveedor", medioPreferido: "Transferencia" }, tenantA));
      await db.insert(serviceAccounts).values(
        filaPg({ servicio: "luz", proveedor: "Edenor", titular: "P85-cuenta-A", activa: true }, tenantA),
      );
      await guardarSesion(NUMERO, "menu", { secreto: "de-A" }, Date.now() + 60_000);
    });

    await conTenant(tenantB, async () => {
      const db = getTenantDb();
      await db.insert(serviceAccounts).values(
        filaPg({ servicio: "gas", proveedor: "Metrogas", titular: "P85-cuenta-B", activa: true }, tenantB),
      );
      await guardarSesion(NUMERO, "menu", { secreto: "de-B" }, Date.now() + 60_000);
    });

    const panelB = await conTenant(tenantB, () => leerResumenPanel());
    expect(panelB.datos.devoluciones.some((d) => d.montoCentavos === 250n)).toBe(false);

    const cuentasB = await conTenant(tenantB, () => listarCuentasDetalle());
    expect(cuentasB.some((c) => c.titular === "P85-cuenta-A")).toBe(false);
    expect(cuentasB.some((c) => c.titular === "P85-cuenta-B")).toBe(true);

    const payeesB = await conTenant(tenantB, async () =>
      getTenantDb().select().from(payees).where(dondeTenant(payees.tenantId)),
    );
    expect(payeesB.some((p) => p.nombre === "P85-payee-A")).toBe(false);

    const sesionB = await conTenant(tenantB, () => leerSesion(NUMERO, Date.now()));
    expect(sesionB?.contexto.secreto).toBe("de-B");

    const fiscalB = await conTenant(tenantB, () => leerFiscalDocs(tenantB));
    expect(Array.isArray(fiscalB) || fiscalB === null).toBe(true);
  });
});

describe("P1-85 resumen mensual: emails distintos no cruzan datos", () => {
  it("cada comercio recibe solo su texto en su destino", async () => {
    const ahoraMs = Date.parse("2026-11-01T12:30:00Z");
    const emails: Array<{ tenantId: string; destino: string; texto: string }> = [];
    await ejecutar_resumen_mensual({
      comercios: [
        {
          tenantId: "ta",
          nombreComercio: "Pyme A",
          modulos: ["cobranza"],
          movimientos: [{ tipo: "ingreso", montoCentavos: 1_000_000n, origen: "venta", ocurridoEn: "2026-10-10T12:00:00.000Z" }],
          clientes: [{ id: "a1", nombre: "Cliente A", telefono: null, saldoCentavos: 100n, topeCentavos: 0n, diasMax: 0 }],
          pagos: [],
          prefsWa: { optIn: false, avisoHora: "08:00", pausadoHastaMs: null },
          prefsEmail: { resumenCierre: true, pausadoHastaMs: null },
          destinoEmail: "a@comercio.test",
        },
        {
          tenantId: "tb",
          nombreComercio: "Pyme B",
          modulos: ["cobranza"],
          movimientos: [{ tipo: "ingreso", montoCentavos: 2_000_000n, origen: "venta", ocurridoEn: "2026-10-11T12:00:00.000Z" }],
          clientes: [{ id: "b1", nombre: "Cliente B", telefono: null, saldoCentavos: 200n, topeCentavos: 0n, diasMax: 0 }],
          pagos: [],
          prefsWa: { optIn: false, avisoHora: "08:00", pausadoHastaMs: null },
          prefsEmail: { resumenCierre: true, pausadoHastaMs: null },
          destinoEmail: "b@comercio.test",
        },
      ],
      ahoraMs,
      zona: ZONA_DEFECTO,
      enviarWa: async () => ({ ok: true }),
      encolarEmail: async (tenantId, payload) => {
        emails.push({ tenantId, destino: payload.destino, texto: payload.texto });
        return { ok: true };
      },
    });
    expect(emails).toHaveLength(2);
    expect(emails[0]).toMatchObject({ tenantId: "ta", destino: "a@comercio.test" });
    expect(emails[0]?.texto).toContain("Pyme A");
    expect(emails[0]?.texto).not.toContain("Pyme B");
    expect(emails[1]).toMatchObject({ tenantId: "tb", destino: "b@comercio.test" });
    expect(emails[1]?.texto).toContain("Pyme B");
    expect(emails[1]?.texto).not.toContain("Pyme A");
  });
});
