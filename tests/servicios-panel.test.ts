import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ctx } from "./helpers/ctx.js";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as GETAccounts } from "../src/pages/api/service-accounts.js";
import { GET as GETDue } from "../src/pages/api/utility-bills/due.js";
import { resetStore, store } from "../src/lib/store.js";

beforeEach(() => {
  resetStore();
  store.serviceAccounts.set("acc-luz", {
    id: "acc-luz",
    servicio: "luz",
    proveedor: "Edenor",
    titular: "Kiosco Centro",
    numeroCuenta: "12345",
    alias: "Luz local",
    vencimientoTipicoDia: 10,
    emailOrigen: "facturas@edenor.com",
    medioHabitual: "Debito",
    debitoAutomatico: false,
    activa: true,
  });
  const base = {
    accountId: "acc-luz",
    periodo: "2026-10",
    estado: "pendiente" as const,
    necesitaRevision: false,
    origen: "pdf_digital" as const,
    confianzaMonto: "alta" as const,
    confianzaVencimiento: "alta" as const,
  };
  store.utilityBills.set("b-prox", { ...base, id: "b-prox", messageId: "m1", vencimiento: "2026-10-12", montoCentavos: 4800000n });
  store.utilityBills.set("b-venc", { ...base, id: "b-venc", messageId: "m2", vencimiento: "2026-10-08", montoCentavos: 4650000n });
  store.utilityBills.set("b-pagada", { ...base, id: "b-pagada", messageId: "m3", vencimiento: "2026-10-05", montoCentavos: 4500000n, estado: "pagada" });
});

describe("CS7 panel de consumos (APIs)", () => {
  it("GET /api/service-accounts lista cuentas sin emails", async () => {
    const res = (await GETAccounts(ctx("http://x/api/service-accounts"))) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(j.items).toHaveLength(1);
    expect(j.items[0]).toMatchObject({ account_id: "acc-luz", servicio: "luz", proveedor: "Edenor", activa: true });
    expect(j.items[0]).not.toHaveProperty("email_origen");
  });

  it("GET /api/utility-bills/due expone account_id y periodo para agrupar", async () => {
    const res = (await GETDue(ctx(
      "http://localhost/api/utility-bills/due?hoy=2026-10-10&dentro_dias=7",
    ))) as Response;
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      proximas: Array<Record<string, string>>;
      vencidas: Array<Record<string, string>>;
    };
    expect(j.proximas.map((f) => f["bill_id"])).toEqual(["b-prox"]);
    expect(j.proximas[0]).toMatchObject({ account_id: "acc-luz", periodo: "2026-10" });
    expect(j.vencidas.map((f) => f["bill_id"])).toEqual(["b-venc"]);
    expect(j.vencidas[0]).toMatchObject({ account_id: "acc-luz" });
  });
});

describe("CS7 panel de consumos (vista)", () => {
  const panel = readFileSync(join(process.cwd(), "src", "components", "panel", "ConsumosCard.astro"), "utf8");

  it("tiene seccion consumos que consume ambas APIs", () => {
    expect(panel).toContain('id="consumos"');
    expect(panel).toContain('id="consumos-cuentas"');
    expect(panel).toContain('id="consumos-proximas"');
    expect(panel).toContain('id="consumos-vencidas"');
    expect(panel).toContain('fetch("/api/service-accounts")');
    expect(panel).toContain('fetch("/api/utility-bills/due?dentro_dias=7")');
  });

  it("no empuja montos a ningun outbox global", () => {
    expect(panel.toLowerCase()).not.toContain("opsoutbox");
    expect(panel.toLowerCase()).not.toContain("ops_outbox");
  });

  it("el dueño crea una cuenta y el 201 recarga la lista y el selector", () => {
    const consumos = readFileSync(join(process.cwd(), "src", "pages", "panel", "consumos.astro"), "utf8");
    expect(consumos).toContain('id="cuenta-form"');
    for (const campo of ["servicio", "proveedor", "titular"]) {
      expect(consumos).toContain(`data-campo="${campo}"`);
    }
    for (const valor of ["luz", "gas", "agua", "internet", "telefono", "tasas", "arca", "otro"]) {
      expect(consumos).toContain(`value="${valor}"`);
    }
    const post = consumos.indexOf('fetch("/api/service-accounts",');
    expect(post).toBeGreaterThan(-1);
    const despues = consumos.slice(post, post + 1400);
    expect(despues).toContain('method: "POST"');
    expect(despues).toContain("servicio, proveedor, titular");
    expect(despues).toContain("mostrarErrores(");
    expect(despues).toContain("textoError(");
    expect(despues).toContain("cargadorCuentas.invalidar()");
    expect(despues).toContain("cargarCuentas()");
    expect(consumos).not.toMatch(/fetch\(\s*"\/api\/utility-bills"\s*,/);
  });

  it("la página de consumos integra los borradores de email", () => {
    const consumos = readFileSync(join(process.cwd(), "src", "pages", "panel", "consumos.astro"), "utf8");
    expect(consumos).toContain('id="consumos-borradores"');
    expect(consumos).toContain('fetch("/api/email-drafts")');
    expect(consumos).toContain('fetch("/api/email-drafts/confirm"');
    expect(consumos).toContain('fetch("/api/email-drafts/discard"');
    expect(consumos).toContain('id="borrador-form"');
  });
});
