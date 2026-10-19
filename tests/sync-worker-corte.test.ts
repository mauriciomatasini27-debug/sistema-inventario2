import { beforeEach, describe, expect, it } from "vitest";
import { encolar, pendientes, resetOutbox } from "../src/offline/outbox-store.js";
import { sincronizarAhora, type PushPort, type PushResult } from "../src/offline/sync-worker.js";

beforeEach(async () => {
  await resetOutbox();
});

describe("sync-worker corta el flush ante error de red/5xx", () => {
  it("si el primer push lanza, no manda el segundo y los dos quedan pendientes", async () => {
    const a = await encolar({ kind: "venta", resumen: "v1" });
    const b = await encolar({ kind: "venta", resumen: "v2" });
    const enviados: string[] = [];
    const push: PushPort = {
      async enviar(op): Promise<PushResult> {
        enviados.push(op.opId);
        throw new Error("sin red");
      },
    };

    const r = await sincronizarAhora({ push });

    expect(enviados).toEqual([a.opId]);
    expect(r.subidos).toBe(0);
    expect((await pendientes(10)).map((o) => o.opId)).toEqual([a.opId, b.opId]);
  });
});
