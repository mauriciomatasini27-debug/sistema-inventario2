import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { resetStore } from "../src/lib/store.js";
import { POST as postQr } from "../src/pages/api/cash/qr.js";
import { POST as postClose } from "../src/pages/api/cash/close.js";

function modoSingleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env["TENANT_DATABASE_URL_tenant-a"];
  delete process.env["TENANT_DATABASE_URL_tenant-b"];
}

function qrBody(num: string) {
  return { numero_operacion: num, monto_centavos: 1500, origen: "manual" as const };
}

function closeBody(fecha: string) {
  return { fecha_jornada: fecha, close_type: "manual" };
}

async function registrarQrPendiente(num: string, key: string) {
  const r = (await postQr(
    ctx("http://x/api/cash/qr", { body: qrBody(num), headers: { "Idempotency-Key": key } }),
  )) as Response;
  expect(r.status).toBe(201);
}

async function cerrar(key: string, fecha: string) {
  const r = (await postClose(
    ctx("http://x/api/cash/close", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: closeBody(fecha),
    }),
  )) as Response;
  expect(r.status).toBe(201);
  return (await r.json()) as { fecha_jornada: string; total_centavos: string; qr_sin_comprobante: number };
}

describe("CAJA-S2 cuenta QR sin comprobante en cierre", () => {
  beforeEach(() => {
    modoSingleSinDb();
    resetStore();
  });

  it("cierre con 2 QR pendientes informa qr_sin_comprobante 2", async () => {
    const t0 = Date.now();
    await registrarQrPendiente(`OP-S2-A-${t0}`, `s2-qr-a-${t0}`);
    await registrarQrPendiente(`OP-S2-B-${t0}`, `s2-qr-b-${t0}`);
    const j = await cerrar(`s2-cierre-${t0}`, "2026-10-15");
    expect(j.qr_sin_comprobante).toBe(2);
  });

  it("cierre sin QR informa qr_sin_comprobante 0", async () => {
    const j = await cerrar(`s2-cierre-vacio-${Date.now()}`, "2026-10-15");
    expect(j.qr_sin_comprobante).toBe(0);
  });

  it("reingreso del mismo numero_operacion devuelve 409 ya registrado", async () => {
    const t0 = Date.now();
    const num = `OP-S2-DUP-${t0}`;
    await registrarQrPendiente(num, `s2-qr-dup-${t0}`);
    const re = (await postQr(
      ctx("http://x/api/cash/qr", { body: qrBody(num), headers: { "Idempotency-Key": `s2-qr-dup-re-${t0}` } }),
    )) as Response;
    expect(re.status).toBe(409);
    expect(((await re.json()) as { error: string }).error).toBe("ya registrado");
  });
});
