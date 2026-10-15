import { describe, expect, it, beforeEach } from "vitest";
import { asociarQr } from "../src/modules/cash/qr-asociacion.js";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { POST as postQr, DELETE as deleteQr, GET as getQr } from "../src/pages/api/cash/qr.js";
import { POST as postMovements } from "../src/pages/api/cash/movements.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

const T = "2026-10-15T12:00:00-03:00";
const T_MS = new Date(T).getTime();
function mas(minutos: number, segundos = 0): string {
  return new Date(T_MS + minutos * 60_000 + segundos * 1000).toISOString();
}

describe("CAJA-S1 matcher puro: monto exacto ±15 min", () => {
  it("Δ 15:00 exactos es candidato (auto con único)", () => {
    expect(asociarQr({ monto_centavos: 1500, fecha_operacion: T }, [{ id: "m1", monto_centavos: 1500, ocurrido_en: mas(15) }])).toEqual({
      tipo: "auto",
      movimiento_id: "m1",
    });
  });

  it("Δ 15:01 ya no es candidato", () => {
    expect(asociarQr({ monto_centavos: 1500, fecha_operacion: T }, [{ id: "m1", monto_centavos: 1500, ocurrido_en: mas(15, 1) }])).toEqual({
      tipo: "sin_candidato",
    });
  });

  it("monto difiere en 1 centavo: sin candidato", () => {
    expect(asociarQr({ monto_centavos: 1500, fecha_operacion: T }, [{ id: "m1", monto_centavos: 1501, ocurrido_en: T }])).toEqual({
      tipo: "sin_candidato",
    });
  });

  it("dos candidatos: toque con ambos ids", () => {
    expect(
      asociarQr({ monto_centavos: 1500, fecha_operacion: T }, [
        { id: "m1", monto_centavos: 1500, ocurrido_en: mas(-5) },
        { id: "m2", monto_centavos: 1500, ocurrido_en: mas(5) },
      ]),
    ).toEqual({ tipo: "toque", candidatos: ["m1", "m2"] });
  });

  it("cero candidatos: sin_candidato", () => {
    expect(asociarQr({ monto_centavos: 1500, fecha_operacion: T }, [])).toEqual({ tipo: "sin_candidato" });
  });
});

function movimientoQrBody(seq: number) {
  return {
    tipo: "ingreso",
    metodo: "QR",
    categoria_id: "general",
    origen: "cobro_fiado",
    monto_centavos: 1500,
    device_code: "caja-01",
    seq_local: seq,
    client_occurred_at: new Date().toISOString(),
  };
}

describe("CAJA-S1 ruta: auto + Deshacer + 409", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("movimiento QR 1500 en T + recibo 1500 en T+10min → auto; Deshacer → pendiente; reingreso → 409", async () => {
    const t0 = Date.now();
    const mov = (await postMovements(
      ctx("http://x/api/cash/movements", { body: movimientoQrBody(101), headers: { "Idempotency-Key": `s1-mov-${t0}` } }),
    )) as Response;
    expect(mov.status).toBe(201);
    const movJ = (await mov.json()) as { id: string };
    const fecha = new Date(t0 + 10 * 60_000).toISOString();
    const num = `OP-S1-${t0}`;

    const r = (await postQr(
      ctx("http://x/api/cash/qr", {
        body: { numero_operacion: num, monto_centavos: 1500, fecha_operacion: fecha, origen: "manual" },
        headers: { "Idempotency-Key": `s1-qr-${t0}` },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { estado: string; asociacion: { tipo: string; movimiento_id: string; deshacer: boolean } };
    expect(j.estado).toBe("asociado");
    expect(j.asociacion).toEqual({ tipo: "auto", movimiento_id: movJ.id, deshacer: true });

    const d = (await deleteQr(ctx(`http://x/api/cash/qr?numero_operacion=${num}`))) as Response;
    expect(d.status).toBe(200);
    const g = (await getQr(ctx("http://x/api/cash/qr"))) as Response;
    const gj = (await g.json()) as { recibos: Array<{ numeroOperacion: string; estado: string }> };
    expect(gj.recibos.find((x) => x.numeroOperacion === num)?.estado).toBe("pendiente");

    const re = (await postQr(
      ctx("http://x/api/cash/qr", {
        body: { numero_operacion: num, monto_centavos: 1500 },
        headers: { "Idempotency-Key": `s1-qr-re-${t0}` },
      }),
    )) as Response;
    expect(re.status).toBe(409);
    expect(((await re.json()) as { error: string }).error).toBe("ya registrado");
  });

  it("dos movimientos QR mismo monto → toque con candidatos", async () => {
    const t0 = Date.now();
    const ids: string[] = [];
    for (const [i, seq] of [102, 103].entries()) {
      const mov = (await postMovements(
        ctx("http://x/api/cash/movements", { body: movimientoQrBody(seq), headers: { "Idempotency-Key": `s1-toq-${t0}-${i}` } }),
      )) as Response;
      expect(mov.status).toBe(201);
      ids.push(((await mov.json()) as { id: string }).id);
    }
    const r = (await postQr(
      ctx("http://x/api/cash/qr", {
        body: { numero_operacion: `OP-S1-TOQ-${t0}`, monto_centavos: 1500, fecha_operacion: new Date(t0 + 5 * 60_000).toISOString() },
        headers: { "Idempotency-Key": `s1-qr-toq-${t0}` },
      }),
    )) as Response;
    expect(r.status).toBe(201);
    const j = (await r.json()) as { estado: string; asociacion: { tipo: string; candidatos: string[] } };
    expect(j.estado).toBe("pendiente");
    expect(j.asociacion).toEqual({ tipo: "toque", candidatos: ids });
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe.skipIf(!hayPG)("CAJA-S1 PG: migración 0022 crea cash_qr_receipts y persiste cash_movement_id", () => {
  it("aplica 0022 idempotente e inserta recibo asociado", async () => {
    const { readFileSync } = await import("node:fs");
    const { sql } = await import("drizzle-orm");
    const { getTenantDb } = await import("../src/lib/db.js");
    const { cashMovements, cashQrReceipts } = await import("../src/db/schema.js");
    const { eq } = await import("drizzle-orm");
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A ?? "";
    const db = getTenantDb();
    const mig = readFileSync("drizzle/0022_cash_qr_receipts.sql", "utf8");
    for (const parte of mig.split("--> statement-breakpoint")) {
      const stmt = parte.trim();
      if (stmt) await db.execute(sql.raw(stmt));
    }
    const movId = crypto.randomUUID();
    await db.insert(cashMovements).values({
      id: movId,
      saleId: null,
      idempotencyKey: `s1-pg-${Date.now()}`,
      tipo: "ingreso",
      metodo: "QR",
      categoriaId: "general",
      origen: "cobro_fiado",
      montoCentavos: 1500n,
    });
    const num = `OP-S1-PG-${Date.now()}`;
    await db.insert(cashQrReceipts).values({
      numeroOperacion: num,
      montoCentavos: 1500n,
      estado: "asociado",
      idempotencyKey: `s1-pg-qr-${Date.now()}`,
      fechaOperacion: new Date(),
      origen: "manual",
      cashMovementId: movId,
    });
    const filas = await db.select().from(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, num)).limit(1);
    expect(filas[0]?.cashMovementId).toBe(movId);
    await db.delete(cashQrReceipts).where(eq(cashQrReceipts.numeroOperacion, num));
    await db.delete(cashMovements).where(eq(cashMovements.id, movId));
    delete process.env.TENANT_DATABASE_URL;
  });
});
