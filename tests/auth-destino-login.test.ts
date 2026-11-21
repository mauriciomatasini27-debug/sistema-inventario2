import { describe, expect, it } from "vitest";
import { destinoLogin } from "../src/modules/auth/destino-login.js";

describe("TB-165: precedencia del destino post-login", () => {
  it("un next válido gana sobre la allowlist y sobre el comercio", () => {
    expect(destinoLogin({ next: "/admin", esAdmin: true, tenantId: "t1", rol: "dueno" })).toEqual({
      url: "/admin", recorrido: "admin",
    });
    expect(destinoLogin({ next: "/panel", esAdmin: true, tenantId: "t1", rol: "empleado" })).toEqual({
      url: "/panel", recorrido: "empleado",
    });
  });

  it("next=/panel sin comercio sigue yendo al alta", () => {
    expect(destinoLogin({ next: "/panel", esAdmin: false, tenantId: null, rol: null })).toEqual({
      url: "/?alta=pendiente", recorrido: "alta",
    });
  });

  it("un next inválido se ignora y entra la allowlist", () => {
    expect(destinoLogin({ next: "https://evil.example", esAdmin: true, tenantId: "t1", rol: "dueno" })).toEqual({
      url: "/admin", recorrido: "admin",
    });
  });

  it("la allowlist gana con y sin comercio", () => {
    expect(destinoLogin({ next: null, esAdmin: true, tenantId: "t1", rol: "empleado" })).toEqual({
      url: "/admin", recorrido: "admin",
    });
    expect(destinoLogin({ next: null, esAdmin: true, tenantId: null, rol: null })).toEqual({
      url: "/admin", recorrido: "admin",
    });
  });

  it("Dueño y Empleado van a /panel pero con recorrido distinto", () => {
    expect(destinoLogin({ next: null, esAdmin: false, tenantId: "t1", rol: "dueno" })).toEqual({
      url: "/panel", recorrido: "dueno",
    });
    expect(destinoLogin({ next: null, esAdmin: false, tenantId: "t1", rol: "empleado" })).toEqual({
      url: "/panel", recorrido: "empleado",
    });
  });

  it("sin comercio y sin allowlist se pide el alta", () => {
    expect(destinoLogin({ next: null, esAdmin: false, tenantId: null, rol: null })).toEqual({
      url: "/?alta=pendiente", recorrido: "alta",
    });
  });
});
