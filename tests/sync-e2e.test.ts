import { describe, expect, it, beforeEach } from "vitest";
import { resetOutbox } from "../src/offline/outbox-store.js";
import { resetMappings, registrarProv, fijarDef, resolver, resolverLote } from "../src/offline/id-mappings.js";
import {
  avanzarCursor,
  alcanceDe,
  calcularBackoff,
  decidirPush,
  mapKindASyncModulo,
  reducirPushResult,
} from "../src/offline/sync-policy.js";
import { abrir } from "../src/offline/offline.js";
import type { Cursor, DeviceSeq, Hlc, IdProv, OpId, OpLocal } from "../src/offline/types.js";

beforeEach(async () => {
  await resetOutbox();
  await resetMappings();
});

describe("sync-policy pura", () => {
  it("mapea kind a modulo wire sin leakage", () => {
    expect(mapKindASyncModulo("venta")).toBe("sales");
    expect(mapKindASyncModulo("mov_caja")).toBe("cash");
    expect(mapKindASyncModulo("foto")).toBe("inventory");
    expect(alcanceDe("venta")).toBe("venta");
    expect(alcanceDe("mov_caja")).toBe("caja");
  });

  it("cursor solo avanza (max monótono)", () => {
    const c1 = avanzarCursor(null, "100:0" as Cursor);
    const c2 = avanzarCursor(c1, "99:9" as Cursor);
    expect(c2).toBe(c1);
    const c3 = avanzarCursor(c1, "101:0" as Cursor);
    expect(c3).toBe("101:0");
  });

  it("409 avanza sin sobrescribir, 422 es dead-letter sin reintento", () => {
    const op: OpLocal = {
      opId: "op-1" as OpId,
      seq: 1 as DeviceSeq,
      hlc: "5:0" as Hlc,
      kind: "venta",
      efecto: { kind: "venta", resumen: "test" },
      estado: "pendiente",
      intentos: 0,
      proximoReintentoAt: null,
    };
    expect(reducirPushResult(op, 409, {})).toMatchObject({ accion: "conflicto-avanza" });
    expect(reducirPushResult(op, 422, {})).toMatchObject({ accion: "dead-letter" });
    const ok = reducirPushResult(op, 201, { id_mapeado: "srv-x" });
    expect(ok).toMatchObject({ accion: "confirmar" });
  });

  it("backoff determinista con rand inyectado y decidir respeta backoff", () => {
    expect(calcularBackoff(0, () => 0.5)).toBe(500);
    expect(calcularBackoff(1, () => 0.5)).toBe(1000);
    const op: OpLocal = {
      opId: "op-2" as OpId,
      seq: 1 as DeviceSeq,
      hlc: "1:0" as Hlc,
      kind: "venta",
      efecto: { kind: "venta", resumen: "test" },
      estado: "pendiente",
      intentos: 0,
      proximoReintentoAt: Date.now() + 60_000,
    };
    expect(decidirPush(op, null, new Date())).toMatchObject({ ok: false, motivo: "backoff" });
  });
});

describe("id-mappings", () => {
  it("registra provisorio, resuelve definitivo, idempotente", async () => {
    const op = "op-1" as OpId;
    await registrarProv(op, "caja-01-1" as IdProv);
    expect(await resolver("caja-01-1" as IdProv)).toBe("caja-01-1");
    await fijarDef(op, "srv-abc");
    expect(await resolver("caja-01-1" as IdProv)).toBe("srv-abc");
    await fijarDef(op, "srv-otro");
    expect(await resolver("caja-01-1" as IdProv)).toBe("srv-abc");
    const lote = await resolverLote(["caja-01-1" as IdProv, "caja-01-9" as IdProv]);
    expect(lote.get("caja-01-1" as IdProv)).toBe("srv-abc");
    expect(lote.get("caja-01-9" as IdProv)).toBe("caja-01-9");
  });
});

describe("e2e offline provisorio -> definitivo sin duplicar (ADR-0017)", () => {
  it("vende offline, sync confirma, segundo sync no duplica", async () => {
    const off = await abrir({ deviceCode: "caja-01" });
    const t = await off.vender({ sku: "demo-sku-1", cant: 1, medio: "Efectivo" });
    expect(t.provisorio).toBe("caja-01-1");

    const antes = await off.tickets.resolver(t.provisorio);
    expect(antes.definitivo).toBe(false);

    const r1 = await off.sincronizarAhora();
    expect(r1.subidos).toBe(1);

    const despues = await off.tickets.resolver(t.provisorio);
    expect(despues.definitivo).toBe(true);
    expect(despues.codigo.startsWith("srv-")).toBe(true);

    const r2 = await off.sincronizarAhora();
    expect(r2.subidos).toBe(0);
  });
});
