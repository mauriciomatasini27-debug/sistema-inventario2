import { beforeEach, describe, expect, it } from "vitest";
import { bd, crearTablasVacias, resetDb } from "../src/offline/db.js";
import {
  confirmar,
  descartarMemoriaOutbox,
  encolar,
  hidratarOutbox,
  pendientes,
  repararSeq,
  resetOutbox,
} from "../src/offline/outbox-store.js";
import {
  descartarMemoriaMappings,
  fijarDef,
  hidratarMappings,
  registrarProv,
  resetMappings,
  resolver,
} from "../src/offline/id-mappings.js";
import type { IdProv, OpId } from "../src/offline/types.js";

beforeEach(async () => {
  await resetDb();
  await resetOutbox();
  await resetMappings();
});

describe("sqlite local PWA-S3 (diario durable + hidrata)", () => {
  it("DDL real crea journal_outbox, journal_idmap, kv_meta y photos_queue", async () => {
    await crearTablasVacias();
    const out = bd().exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const tablas = out[0]!.values.map((v) => String(v[0]));
    expect(tablas).toContain("journal_outbox");
    expect(tablas).toContain("journal_idmap");
    expect(tablas).toContain("kv_meta");
    expect(tablas).toContain("photos_queue");
  });

  it("journal sobrevive a pérdida total de memoria (restart)", async () => {
    await crearTablasVacias();
    const a = await encolar({ kind: "venta", resumen: "v1" });
    const b = await encolar({ kind: "mov_caja", resumen: "m1" });
    await confirmar(a.opId, "srv-abc");
    await registrarProv(a.opId, "caja-01-1" as IdProv);
    await fijarDef(a.opId, "srv-abc");

    // Restart: cae la memoria, SQLite queda.
    await descartarMemoriaOutbox();
    await descartarMemoriaMappings();
    expect(await pendientes(10)).toHaveLength(0);

    await hidratarOutbox();
    await hidratarMappings();
    const list = await pendientes(10);
    // a confirmada no es pendiente; b sí.
    expect(list.map((o) => o.opId)).toEqual([b.opId]);
    expect(await resolver("caja-01-1" as IdProv)).toBe("srv-abc");

    // El seq continúa sin reasignar pasado.
    await repararSeq();
    const c = await encolar({ kind: "venta", resumen: "v2" });
    expect(c.seq).toBeGreaterThan(b.seq);
  });

  it("export bytes no vacío tras escrituras (formato durable)", async () => {
    await crearTablasVacias();
    await encolar({ kind: "venta", resumen: "v1" });
    expect(bd().export().length).toBeGreaterThan(0);
  });

  it("sin abrir, todo sigue en memoria (stub compatible)", async () => {
    // Sin crearTablasVacias: el diario no-ops y la memoria manda.
    const a = await encolar({ kind: "venta", resumen: "v1" });
    expect(await pendientes(10)).toHaveLength(1);
    expect((await pendientes(10))[0]!.opId).toBe(a.opId);
  });

  it("resetDb vacía el diario: hidratar posterior no recupera nada", async () => {
    await crearTablasVacias();
    const a = await encolar({ kind: "venta", resumen: "v1" });
    await registrarProv(a.opId, "caja-01-1" as IdProv);
    await resetDb();
    await resetOutbox();
    await resetMappings();
    await crearTablasVacias();
    await hidratarOutbox();
    await hidratarMappings();
    expect(await pendientes(10)).toHaveLength(0);
    expect(await resolver("caja-01-1" as IdProv)).toBe("caja-01-1");
  });
});
