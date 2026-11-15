import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("src/pages/admin.astro", "utf8");

describe("ADMIN-PANEL-WIRE tarjetas", () => {
  it("declara data-admin-accion y los endpoints que ya existen", () => {
    expect(html).toContain("data-admin-accion");
    expect(html).toContain('"/api/admin/rollouts"');
    expect(html).toContain('"/api/admin/flags"');
    expect(html).toContain('"/api/admin/ledger/asentar"');
    expect(html).toContain('"/api/admin/senales/consumir"');
    expect(html).toContain('"/api/admin/reportes/"');
    expect(html).toContain("accion: \"estado\"");
    expect(html).toContain("confirmo_id");
    expect(html).toContain("idempotency_key");
    expect(html).toContain("r.status === 409 && abierta === key && key");
    expect(html).toContain("ultimaSenalEn");
    expect(html).toContain("b.consumidas");
    expect(html).toContain("b.descartadas");
    expect(html).toContain("for (let i = 0; i < 12; i++)");
  });
});
