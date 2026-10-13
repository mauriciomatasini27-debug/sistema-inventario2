import { describe, expect, it, beforeEach } from "vitest";
import {
  confirmar,
  definitivoDe,
  encolar,
  marcarEnviado,
  pendientes,
  repararSeq,
  resetOutbox,
  simularCrashVolatil,
} from "../src/offline/outbox-store.js";

beforeEach(async () => {
  await resetOutbox();
});

describe("outbox-store offline", () => {
  it("asigna seq monótono y ordena pendientes", async () => {
    const a = await encolar({ kind: "venta", resumen: "v1" });
    const b = await encolar({ kind: "venta", resumen: "v2" });
    expect(b.seq).toBeGreaterThan(a.seq);
    const list = await pendientes(10);
    expect(list.map((o) => o.opId)).toEqual([a.opId, b.opId]);
  });

  it("encolar mismo op_id con mismo efecto es no-op", async () => {
    const a = await encolar({ kind: "venta", resumen: "v1" });
    const again = await encolar({ kind: "venta", resumen: "v1" }, "caja-01", a.opId);
    expect(again.opId).toBe(a.opId);
    expect(await pendientes(10)).toHaveLength(1);
  });

  it("marcarEnviado y confirmar son idempotentes", async () => {
    const a = await encolar({ kind: "mov_caja", resumen: "m1" });
    await marcarEnviado(a.opId);
    await marcarEnviado(a.opId);
    await confirmar(a.opId, "srv-abc");
    await confirmar(a.opId, "srv-otro");
    expect(await pendientes(10)).toHaveLength(0);
    expect(await definitivoDe(a.opId)).toBe("srv-abc");
  });

  it("repararSeq tras crash conserva orden sin reasignar pasado", async () => {
    const a = await encolar({ kind: "venta", resumen: "v1" });
    await simularCrashVolatil();
    await repararSeq();
    const b = await encolar({ kind: "venta", resumen: "v2" });
    expect(b.seq).toBeGreaterThan(a.seq);
  });
});
