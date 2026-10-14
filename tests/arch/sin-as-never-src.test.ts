import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import { closingSummaries } from "../../src/db/schema-caja.js";
import { pricingAuditLog } from "../../src/db/schema-precios.js";

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...archivos(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".astro")) out.push(p);
  }
  return out;
}

describe("ARQ-S9 sin as never en src", () => {
  it("src no usa `as never` (el JSON va tipado con $type<T>)", () => {
    const mal: string[] = [];
    for (const f of archivos("src")) {
      const lineas = readFileSync(f, "utf8").split("\n");
      lineas.forEach((linea, i) => {
        if (/\bas never\b/.test(linea)) mal.push(`${f}:${i + 1}`);
      });
    }
    expect(mal, mal.join("\n")).toEqual([]);
  });

  it("columnas JSON tipadas aceptan su forma y rechazan la incorrecta", () => {
    expectTypeOf<typeof pricingAuditLog.$inferInsert["antes"]>().toEqualTypeOf<{ readonly texto: string }>();
    expectTypeOf<typeof pricingAuditLog.$inferInsert["despues"]>().toEqualTypeOf<{ readonly texto: string }>();
    expectTypeOf<typeof closingSummaries.$inferInsert["porMedio"]>().toEqualTypeOf<Record<string, string>>();
    expectTypeOf<{ texto: number }>().not.toEqualTypeOf<typeof pricingAuditLog.$inferInsert["antes"]>();
    expectTypeOf<Record<string, number>>().not.toEqualTypeOf<typeof closingSummaries.$inferInsert["porMedio"]>();
  });
});
