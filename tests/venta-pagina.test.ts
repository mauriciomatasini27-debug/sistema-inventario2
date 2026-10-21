import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const leer = (p: string): string => readFileSync(join(RAIZ, p), "utf8");

describe("venta.astro: el script principal se empaqueta", () => {
  const src = (): string => leer("src/pages/venta.astro");

  it("ningún <script> usa define:vars ni is:inline (rompen los imports)", () => {
    const tags = [...src().matchAll(/<script[^>]*>/g)].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(tag).not.toContain("define:vars");
      expect(tag).not.toContain("is:inline");
    }
  });

  it("el tenant va en un data-tenant que el script lee con dataset", () => {
    const s = src();
    expect(s).toMatch(/data-tenant=\{tenantId/);
    expect(s).toContain(".dataset.tenant");
  });
});
