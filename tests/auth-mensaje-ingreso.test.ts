import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mensajeIngresoLanding } from "../src/modules/auth/mensaje-ingreso.js";
import { destinoGoogleSeguro } from "../src/modules/auth/oauth-destino.js";
import { GOOGLE_AUTH_ENDPOINT } from "../src/modules/auth/oidc.js";

describe("P1-55 mensaje de ingreso en la landing", () => {
  it("lee error y cancelado; ignora otras queries", () => {
    expect(mensajeIngresoLanding(new URLSearchParams("ingreso=error&mensaje=Hola%20mundo"))).toBe("Hola mundo");
    expect(mensajeIngresoLanding(new URLSearchParams("ingreso=cancelado"))).toBe(
      "Cancelaste el ingreso con Google.",
    );
    expect(mensajeIngresoLanding(new URLSearchParams("alta=pendiente"))).toBeNull();
  });

  it("index.astro muestra el aviso con role=alert", () => {
    const index = readFileSync(join(process.cwd(), "src/pages/index.astro"), "utf8");
    expect(index).toContain("mensajeIngresoLanding");
    expect(index).toContain('role="alert"');
    expect(index).toContain("data-ingreso-aviso");
  });
});

describe("P1-55 destino Google seguro", () => {
  it("acepta solo el authorize endpoint de Google", () => {
    const ok = `${GOOGLE_AUTH_ENDPOINT}?client_id=x&state=y`;
    expect(destinoGoogleSeguro(ok)).toBe(ok);
    expect(destinoGoogleSeguro("https://evil.example/o/oauth2/v2/auth")).toBeNull();
    expect(destinoGoogleSeguro("https://accounts.google.com/evil")).toBeNull();
    expect(destinoGoogleSeguro("not-a-url")).toBeNull();
  });
});
