import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("P1-74 migración 0044 en journal", () => {
  it("journal registra 0044_piloto_schema_tenant_precios", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.some((e) => e.tag === "0044_piloto_schema_tenant_precios")).toBe(true);
  });

  it("el SQL crea inventory_counts y tablas del piloto", () => {
    const body = readFileSync("drizzle/0044_piloto_schema_tenant_precios.sql", "utf8");
    for (const t of [
      "platform_feedback_reports",
      "inventory_counts",
      "fiscal_customers",
      "product_flags",
      "report_exports",
      "mp_preapproval_tenants",
    ]) {
      expect(body).toContain(`CREATE TABLE IF NOT EXISTS "${t}"`);
    }
    expect(body).toContain("price_adjustments_tenant_idempotency_uq");
  });
});