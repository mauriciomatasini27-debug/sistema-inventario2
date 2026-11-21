import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (p: string) => readFileSync(p, "utf8");

describe("TB-165: cuestionario como ruta opcional desde el panel", () => {
  it("el panel ofrece el enlace sólo al Dueño y con el comercio resuelto", () => {
    const panel = leer("src/pages/panel.astro");
    expect(panel).toMatch(/accesoCuestionario\s*=\s*mostrarBienvenida/);
    expect(panel).toContain('href={accesoCuestionario}');
    expect(panel).toContain("/onboarding?tenant_id=");
    expect(panel).toContain("data-cuestionario-link");
  });

  it("el guard del enlace exige esDueno", () => {
    const panel = leer("src/pages/panel.astro");
    // TB-165: el guard esDueno alimenta la orientación que decide el enlace.
    expect(panel).toMatch(/esDueno\([\s\S]{0,600}mostrarBienvenida/);
  });

  it("el login nunca redirige al cuestionario", () => {
    const callback = leer("src/pages/api/auth/callback.ts");
    expect(callback).not.toContain('"/onboarding"');
    expect(callback).not.toContain("'/onboarding'");
  });

  it("el cuestionario tiene salida al panel y no queda a medias", () => {
    const pagina = leer("src/pages/onboarding.astro");
    expect(pagina).toContain('href="/panel"');
    expect(pagina).toContain("localStorage.setItem(storageKey");
  });
});
