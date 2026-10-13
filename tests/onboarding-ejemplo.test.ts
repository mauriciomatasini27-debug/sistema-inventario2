import { describe, expect, it, beforeEach } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { dias_ejemplo, plantilla_ejemplo, expira_ejemplo } from "../src/modules/onboarding/ejemplo.js";
import { elegir_demos_a_purgar } from "../src/modules/tenants/purga-demos.js";

beforeEach(() => {
  resetStore();
});

describe("ejemplo ON10", () => {
  it("la plantilla depende del rubro y dura 14 días", () => {
    expect(plantilla_ejemplo("kiosco").productos.length).toBeGreaterThan(0);
    expect(plantilla_ejemplo("libreria").productos[0]).toContain("ficti");
    expect(dias_ejemplo()).toBe(14);
    const desde = new Date("2026-10-10T12:00:00.000Z");
    expect(new Date(expira_ejemplo(desde)).getTime() - desde.getTime()).toBe(14 * 24 * 3600 * 1000);
  });

  it("la demo vencida queda elegible para purga", () => {
    const demoId = "demo-1";
    control.tenants.set(demoId, {
      id: demoId,
      nombreComercio: "Ejemplo",
      slug: "ejemplo",
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: "d",
      esDemo: true,
      trialHasta: "2026-10-01T00:00:00.000Z",
    });
    const ids = elegir_demos_a_purgar(
      [{ id: demoId, esDemo: true, estado: "activo", trialHasta: "2026-10-01T00:00:00.000Z" }],
      new Date("2026-10-10T12:00:00.000Z"),
    );
    expect(ids).toEqual([demoId]);
  });
});
