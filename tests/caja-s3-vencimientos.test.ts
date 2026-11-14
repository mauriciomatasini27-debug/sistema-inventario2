import { describe, expect, it, beforeEach } from "vitest";
import { vencimientosAAvisar } from "../src/modules/cash/vencimientos.js";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { GET as getDue, POST as postDue, PATCH as patchDue } from "../src/pages/api/cash/due-items.js";
import { POST as postJobCaja } from "../src/pages/api/jobs/vencimientos-caja.js";
import { activarSinglePgDesdeEnv } from "./helpers/pg-tenant-fixture.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

const AHORA = new Date("2026-10-15T12:00:00-03:00").getTime();
const DIA_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

function item(over: Record<string, unknown> = {}) {
  return {
    id: "x",
    concepto: "luz",
    venceEl: iso(AHORA + 2 * DIA_MS),
    montoCentavos: "15000",
    estado: "pendiente",
    avisadoEl: null,
    ...over,
  };
}

describe("CAJA-S3 puro: vencimientosAAvisar a 3d", () => {
  it("vence en exactamente 72h avisa", () => {
    expect(vencimientosAAvisar([item({ venceEl: iso(AHORA + 72 * 3_600_000) })], AHORA).map((d) => d.id)).toEqual(["x"]);
  });

  it("72h+1min no avisa", () => {
    expect(vencimientosAAvisar([item({ venceEl: iso(AHORA + 72 * 3_600_000 + 60_000) })], AHORA)).toEqual([]);
  });

  it("pagada no avisa", () => {
    expect(vencimientosAAvisar([item({ estado: "pagada" })], AHORA)).toEqual([]);
  });

  it("ya avisado no avisa", () => {
    expect(vencimientosAAvisar([item({ avisadoEl: iso(AHORA) })], AHORA)).toEqual([]);
  });

  it("vencido pendiente no avisado avisa", () => {
    expect(vencimientosAAvisar([item({ venceEl: iso(AHORA - DIA_MS) })], AHORA).map((d) => d.id)).toEqual(["x"]);
  });
});

describe("CAJA-S3 ruta/job: alta, aviso idempotente, precarga y pago", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("alta 15000 a 2d, job avisa 1, segundo corre avisa 0, precarga, pago Transferencia, repago 409", async () => {
    const vence = iso(Date.now() + 2 * DIA_MS);
    const alta = (await postDue(ctx("http://x/api/cash/due-items", { body: { concepto: "Alquiler galpon", vence_el: vence, monto_centavos: 15000 } }))) as Response;
    expect(alta.status).toBe(201);
    const creado = (await alta.json()) as { id: string };
    expect(typeof creado.id).toBe("string");

    const j1 = (await postJobCaja(ctx("http://x/api/jobs/vencimientos-caja", { method: "POST" }))) as Response;
    expect(j1.status).toBe(200);
    const j1j = (await j1.json()) as { avisados: Array<{ id: string; concepto: string }> };
    expect(j1j.avisados.map((a) => a.concepto)).toEqual(["Alquiler galpon"]);

    const j2 = (await postJobCaja(ctx("http://x/api/jobs/vencimientos-caja", { method: "POST" }))) as Response;
    const j2j = (await j2.json()) as { avisados: unknown[] };
    expect(j2j.avisados).toEqual([]);

    const pre = (await getDue(ctx(`http://x/api/cash/due-items?id=${creado.id}`))) as Response;
    expect(pre.status).toBe(200);
    expect(await pre.json()).toEqual({
      precarga: { concepto: "Alquiler galpon", monto_centavos: 15000, metodo: "Efectivo", categoria_id: "vencimiento", origen: `vencimiento:${creado.id}` },
    });

    const pago = (await patchDue(
      ctx(`http://x/api/cash/due-items?id=${creado.id}`, { method: "PATCH", body: { metodo: "Transferencia" }, headers: { "Idempotency-Key": "caja-s3-pago-1" } }),
    )) as Response;
    expect(pago.status).toBe(200);
    const pagoj = (await pago.json()) as { estado: string; egreso_id: string };
    expect(pagoj.estado).toBe("pagada");
    expect(typeof pagoj.egreso_id).toBe("string");

    const listaRes = (await getDue(ctx("http://x/api/cash/due-items"))) as Response;
    const lista = (await listaRes.json()) as {
      vencimientos: Array<{ id: string; estado: string; avisa: boolean }>;
    };
    expect(lista.vencimientos.find((d) => d.id === creado.id)?.estado).toBe("pagada");
    expect(lista.vencimientos.find((d) => d.id === creado.id)?.avisa).toBe(false);

    const repago = (await patchDue(
      ctx(`http://x/api/cash/due-items?id=${creado.id}`, { method: "PATCH", headers: { "Idempotency-Key": "caja-s3-pago-2" } }),
    )) as Response;
    expect(repago.status).toBe(409);

    const replay = (await patchDue(
      ctx(`http://x/api/cash/due-items?id=${creado.id}`, { method: "PATCH", headers: { "Idempotency-Key": "caja-s3-pago-1" } }),
    )) as Response;
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { egreso_id: string }).egreso_id).toBe(pagoj.egreso_id);
  });

  it("precarga 404 desconocido y 409 ya pagada; el egreso guarda metodo Transferencia y monto 15000", async () => {
    const no = (await getDue(ctx("http://x/api/cash/due-items?id=no-existe"))) as Response;
    expect(no.status).toBe(404);

    const vence = iso(Date.now() + 2 * DIA_MS);
    const alta = (await postDue(ctx("http://x/api/cash/due-items", { body: { concepto: "Luz galpon", vence_el: vence, monto_centavos: 15000 } }))) as Response;
    const creado = (await alta.json()) as { id: string };
    const pago = (await patchDue(
      ctx(`http://x/api/cash/due-items?id=${creado.id}`, { method: "PATCH", body: { metodo: "Transferencia" }, headers: { "Idempotency-Key": "caja-s3-pago-3" } }),
    )) as Response;
    expect(pago.status).toBe(200);

    const prePagada = (await getDue(ctx(`http://x/api/cash/due-items?id=${creado.id}`))) as Response;
    expect(prePagada.status).toBe(409);

    const { store } = await import("../src/lib/store.js");
    const mov = store.movements.find((m) => m.origen === `vencimiento:${creado.id}`);
    expect(mov?.monto_centavos).toBe("15000");
    expect(mov?.metodo).toBe("Transferencia");
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe.skipIf(!hayPG)("CAJA-S3 PG: migracion 0023 crea cash_due_items y el repo persiste aviso y pago", () => {
  it("aplica 0023 idempotente; marcarAvisados y pagarVencimiento escriben avisado_el, pagado_el y cash_movement_id", async () => {
    const { readFileSync } = await import("node:fs");
    const { sql, eq } = await import("drizzle-orm");
    const { getTenantDb } = await import("../src/lib/db.js");
    const { cashDueItems, cashMovements } = await import("../src/db/schema.js");
    const { crearVencimiento, marcarAvisados, pagarVencimiento } = await import("../src/lib/repos/caja.js");
    modoSingleSinDb();
    resetStore();
    activarSinglePgDesdeEnv();
    try {
      const db = getTenantDb();
      const mig = readFileSync("drizzle/0023_cash_due_items.sql", "utf8");
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        for (const parte of mig.split("--> statement-breakpoint")) {
          const stmt = parte.trim();
          if (stmt) await db.execute(sql.raw(stmt));
        }
      }
      const d = await crearVencimiento({ concepto: "Alquiler galpon pg", venceEl: iso(Date.now() + 2 * DIA_MS), montoCentavos: 15000 });
      const recien = await db.select().from(cashDueItems).where(eq(cashDueItems.id, d.id)).limit(1);
      expect(recien[0]?.estado).toBe("pendiente");
      expect(recien[0]?.montoCentavos).toBe(15000n);
      expect(recien[0]?.avisadoEl).toBeNull();

      expect(await marcarAvisados([d.id], iso(Date.now()))).toEqual([d.id]);
      resetStore();
      expect(await marcarAvisados([d.id], iso(Date.now()))).toEqual([]);

      const key = `caja-s3-pg-${Date.now()}`;
      const r = await pagarVencimiento({ id: d.id, key, metodo: "Transferencia" });
      expect(r.status).toBe(200);
      const egresoId = r.status === 200 ? r.egresoId : "";
      const pagada = await db.select().from(cashDueItems).where(eq(cashDueItems.id, d.id)).limit(1);
      expect(pagada[0]?.estado).toBe("pagada");
      expect(pagada[0]?.cashMovementId).toBe(egresoId);
      expect(pagada[0]?.pagadoEl instanceof Date).toBe(true);
      expect(pagada[0]?.avisadoEl instanceof Date).toBe(true);
      const mov = await db.select().from(cashMovements).where(eq(cashMovements.id, egresoId)).limit(1);
      expect(mov[0]?.metodo).toBe("Transferencia");
      expect(mov[0]?.montoCentavos).toBe(15000n);
      expect(mov[0]?.origen).toBe(`vencimiento:${d.id}`);

      resetStore();
      const replay = await pagarVencimiento({ id: d.id, key });
      expect(replay).toEqual({ status: 200, id: d.id, egresoId });
      const tras = await db.select().from(cashDueItems).where(eq(cashDueItems.id, d.id)).limit(1);
      expect(tras[0]?.pagadoEl?.getTime()).toBe(pagada[0]?.pagadoEl?.getTime());
      expect((await pagarVencimiento({ id: d.id, key: `${key}-otra` })).status).toBe(409);

      await db.delete(cashDueItems).where(eq(cashDueItems.id, d.id));
      await db.delete(cashMovements).where(eq(cashMovements.id, egresoId));
    } finally {
      delete process.env.TENANT_DATABASE_URL;
    }
  });
});
