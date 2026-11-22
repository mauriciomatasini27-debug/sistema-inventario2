import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore, store } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { getTenantDb } from "../src/lib/db.js";
import { reclamadorDb } from "../src/lib/repos/notification-deliveries.js";
import { notificationDeliveries, notificationEvents } from "../src/db/schema-email.js";
import { POST as postCierre } from "../src/pages/api/jobs/whatsapp-cierre.js";
import { POST as postSemanal } from "../src/pages/api/jobs/whatsapp-semanal.js";

// El envío real sale por red; acá solo importa la idempotencia del claim.
vi.mock("../src/modules/whatsapp/cliente-cloud.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/modules/whatsapp/cliente-cloud.js")>();
  return { ...real, enviar_whatsapp: vi.fn(async () => ({ ok: true as const, wamid: "wamid-wa-entregas" })) };
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);
const FECHA = "2026-11-20";
const SECRETO = "secreto-wa-entregas";
const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
const TENANT = `wa-ent-${sufijo}`;
const SUB = `dueno-${sufijo}`;
const NUMERO = `+5491100${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

function fijarMulti() {
  process.env.TENANT_MODE = "multi";
  process.env.JOBS_SECRET = SECRETO;
  process.env[`TENANT_DATABASE_URL_${TENANT}`] = process.env.PG_TEST_URL_A ?? "";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-wa-entregas";
  process.env.WHATSAPP_TOKEN = "token-wa-entregas";
  process.env.WHATSAPP_PLANTILLAS_APROBADAS = JSON.stringify({
    resumen_cierre_caja: "plantilla-cierre",
    resumen_semanal: "plantilla-semanal",
  });
}

function req(url: string, body?: Record<string, unknown>) {
  return ctx(url, {
    method: "POST",
    headers: { "X-Job-Secret": SECRETO, "X-Tenant-Id": TENANT },
    ...(body === undefined ? {} : { body }),
  });
}

async function borrarEntregas(claves: string[]) {
  await conTenant(TENANT, async () => {
    const db = getTenantDb();
    await db.delete(notificationDeliveries).where(inArray(notificationDeliveries.idempotencyKey, claves));
    await db.delete(notificationEvents).where(inArray(notificationEvents.dedupeKey, claves.map((c) => `entrega:${c}`)));
  });
}

beforeEach(async () => {
  resetStore();
  conTenant(TENANT, () => resetStore());
  fijarMulti();
  control.tenants.set(TENANT, {
    id: TENANT,
    nombreComercio: "Kiosco WA entregas",
    slug: TENANT,
    estado: "activo",
    plan: "basico",
    moneda: "ARS",
    ownerGoogleSub: SUB,
    esDemo: false,
  });
  control.users.set(SUB, { googleSub: SUB, email: `${SUB}@x.com`, emailVerificado: true });
  control.memberships.set(`m-${TENANT}`, {
    id: `m-${TENANT}`,
    tenantId: TENANT,
    googleSub: SUB,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  control.botLinks.set(NUMERO, { tenantId: TENANT, googleSub: SUB, estado: "verificado" });
  control.waPrefs.set(`${TENANT}:${SUB}`, { optIn: true, avisoHora: "08:00", pausadoHastaMs: null });
  conTenant(TENANT, () => {
    store.cierres.set(FECHA, {
      status: 201,
      cierre: {
        fechaJornada: FECHA,
        closeType: "manual",
        totalCentavos: 10000n,
        ultimoMovimientoId: null,
      },
    });
  });
});

afterEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.JOBS_SECRET;
  delete process.env[`TENANT_DATABASE_URL_${TENANT}`];
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PLANTILLAS_APROBADAS;
  resetStore();
  conTenant(TENANT, () => resetStore());
});

describe("reclamadorDb: modos sin base", () => {
  it("single sin base usa memoria y libera la clave para reintentar", async () => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    const tenant = `single-${sufijo}`;
    const reclamador = reclamadorDb(tenant, "sub-single", "whatsapp");
    const clave = `resumen_cierre:wa:${tenant}:${FECHA}`;
    expect(await reclamador.reclamar(clave, "cierre-1")).toBe(true);
    expect(await reclamador.reclamar(clave, "cierre-1")).toBe(false);
    await reclamador.liberar(clave);
    expect(await reclamador.reclamar(clave, "cierre-1")).toBe(true);
  });

  it("multi sin base propaga BaseNoDisponible (la ruta responde 503)", async () => {
    process.env.TENANT_MODE = "multi";
    delete process.env.TENANT_DATABASE_URL;
    const tenant = `sin-base-${sufijo}`;
    const reclamador = reclamadorDb(tenant, "sub", "whatsapp");
    await expect(
      conTenant(tenant, () => reclamador.reclamar("clave-sin-base", "v")),
    ).rejects.toThrow("base_no_disponible");
  });
});

describe.skipIf(!hayPG)("WA cierre/semanal: idempotencia persistida en notification_deliveries", () => {
  it("cierre persiste la entrega por jornada y no reenvía aunque se pierda la memoria", async () => {
    const clave = `resumen_cierre:wa:${TENANT}:${FECHA}`;
    await borrarEntregas([clave]);

    const r1 = (await postCierre(req("http://test/api/jobs/whatsapp-cierre", { tenant_id: TENANT, fecha_jornada: FECHA }))) as Response;
    expect(r1.status).toBe(200);
    expect((r1.headers.get("content-type") ?? "").includes("application/json")).toBe(true);

    await conTenant(TENANT, async () => {
      const filas = await getTenantDb().select().from(notificationDeliveries).where(eq(notificationDeliveries.idempotencyKey, clave));
      expect(filas).toHaveLength(1);
      expect(filas[0]?.canal).toBe("whatsapp");
      expect(filas[0]?.googleSub).toBe(SUB);
    });

    // Proceso nuevo: se pierde la memoria del job pero queda la fila en DB.
    conTenant(TENANT, () => store.notificationDeliveries.clear());
    const r2 = (await postCierre(req("http://test/api/jobs/whatsapp-cierre", { tenant_id: TENANT, fecha_jornada: FECHA }))) as Response;
    expect(r2.status).toBe(409);
    expect((await r2.json() as { error: string }).error).toBe("duplicado_jornada");
    await borrarEntregas([clave]);
  });

  it("semanal persiste una entrega por canal y no reenvía aunque se pierda la memoria", async () => {
    const r1 = (await postSemanal(req("http://test/api/jobs/whatsapp-semanal"))) as Response;
    expect(r1.status).toBe(200);
    const semana = (await r1.json() as { semana: string }).semana;
    const claves = [
      `resumen_semanal:wa:${TENANT}:${semana}`,
      `resumen_semanal:${TENANT}:${semana}`,
    ];

    await conTenant(TENANT, async () => {
      const filas = await getTenantDb().select().from(notificationDeliveries).where(inArray(notificationDeliveries.idempotencyKey, claves));
      expect(filas).toHaveLength(2);
      expect(new Set(filas.map((f) => f.canal))).toEqual(new Set(["whatsapp", "email"]));
    });

    conTenant(TENANT, () => store.notificationDeliveries.clear());
    const r2 = (await postSemanal(req("http://test/api/jobs/whatsapp-semanal"))) as Response;
    expect(r2.status).toBe(200);
    const resultados = (await r2.json() as { resultados: Array<{ tenant_id: string; canales: Array<{ canal: string; estado: string }> }> }).resultados;
    const mios = resultados.find((x) => x.tenant_id === TENANT)?.canales ?? [];
    expect(mios.find((c) => c.canal === "wa")?.estado).toBe("duplicado");
    expect(mios.find((c) => c.canal === "email")?.estado).toBe("duplicado");
    await borrarEntregas(claves);
  });
});
