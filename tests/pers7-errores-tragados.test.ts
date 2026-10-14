import { afterEach, describe, expect, it, vi } from "vitest";
import { transact } from "../src/offline/db.js";
import { enviar_whatsapp } from "../src/modules/whatsapp/cliente-cloud.js";
import { enviar_plantilla_ticket_listo } from "../src/modules/sales/ticket_template.js";
import { ordenRivalTrasConflicto } from "../src/lib/repos/ordenes-pago.js";
import type { TenantDb } from "../src/lib/server-db.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PERS7 cola offline registra el turno fallido sin cortar la cadena", () => {
  it("transact que lanza rechaza, avisa y el siguiente resuelve", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      transact(() => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    expect(warn).toHaveBeenCalled();
    await expect(transact(() => 42)).resolves.toBe(42);
  });
});

describe("PERS7 WhatsApp 2xx sin JSON registra y devuelve respuesta_invalida", () => {
  const fetchSinJson = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("no json")) });

  it("enviar_whatsapp", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await enviar_whatsapp({
      phoneNumberId: "1",
      token: "t",
      toE164: "+5491100000000",
      payload: { type: "text", text: { body: "hola", preview_url: false } },
      fetchFn: fetchSinJson,
    });
    expect(r).toEqual({ ok: false, codigo: "respuesta_invalida" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("enviar_plantilla_ticket_listo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await enviar_plantilla_ticket_listo({
      phoneNumberId: "1",
      token: "t",
      toE164: "+5491100000000",
      vars: { numeroTicket: "T-1", totalArs: "$1,00", linkPublico: "https://x" },
      idempotencyKey: "k",
      vistos: new Map(),
      marcarEnviado: () => {},
      fetchFn: fetchSinJson,
    });
    expect(r).toEqual({ ok: false, codigo: "respuesta_invalida" });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("PERS7 orden rival que falla registra la key y devuelve null", () => {
  it("select que lanza", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = {
      select: () => {
        throw new Error("base caída");
      },
    } as unknown as TenantDb;
    await expect(ordenRivalTrasConflicto(db, "k-1")).resolves.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[1]).toMatchObject({ key: "k-1" });
  });
});
