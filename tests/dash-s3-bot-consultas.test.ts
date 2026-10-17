import { beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "../src/lib/store.js";
import { leerResumenConsultasBot, registrarConsultaBot } from "../src/lib/repos/bot-consultas.js";

function singleSinDb() {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
}

const AHORA = Date.parse("2026-10-17T12:00:00Z");

describe("DASH-S3 consultas del bot en memoria", () => {
  beforeEach(() => {
    singleSinDb();
    resetStore();
  });

  it("registra y cuenta la consulta de hoy", async () => {
    await registrarConsultaBot({ tenantId: "t-1", numeroE164: "+5491155551234", wamid: "w-1", ahoraMs: AHORA });
    expect(await leerResumenConsultasBot("t-1", AHORA)).toEqual({ hoy: 1, ultimaEnMs: AHORA });
  });

  it("el reintento de Meta con el mismo wamid no duplica", async () => {
    await registrarConsultaBot({ tenantId: "t-1", numeroE164: "+5491155551234", wamid: "w-1", ahoraMs: AHORA });
    await registrarConsultaBot({ tenantId: "t-1", numeroE164: "+5491155551234", wamid: "w-1", ahoraMs: AHORA + 1000 });
    expect(await leerResumenConsultasBot("t-1", AHORA + 1000)).toEqual({ hoy: 1, ultimaEnMs: AHORA });
  });

  it("cada comercio ve solo sus consultas", async () => {
    await registrarConsultaBot({ tenantId: "t-1", numeroE164: "+54911", wamid: "w-a", ahoraMs: AHORA });
    await registrarConsultaBot({ tenantId: "t-2", numeroE164: "+54922", wamid: "w-b", ahoraMs: AHORA });
    expect((await leerResumenConsultasBot("t-1", AHORA)).hoy).toBe(1);
    expect((await leerResumenConsultasBot("t-2", AHORA)).hoy).toBe(1);
    expect((await leerResumenConsultasBot("t-3", AHORA)).hoy).toBe(0);
  });

  it("una consulta de las 23:30 AR de ayer no cuenta hoy pero marca la última", async () => {
    const ayerAr = Date.parse("2026-10-17T02:30:00Z");
    await registrarConsultaBot({ tenantId: "t-1", numeroE164: "+54911", wamid: "w-a", ahoraMs: ayerAr });
    expect(await leerResumenConsultasBot("t-1", AHORA)).toEqual({ hoy: 0, ultimaEnMs: ayerAr });
  });
});
