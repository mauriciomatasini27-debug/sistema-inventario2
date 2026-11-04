import { describe, expect, it, beforeEach, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { GET as getCallback } from "../src/pages/api/auth/callback.js";

vi.mock("../src/modules/auth/oidc.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/modules/auth/oidc.js")>();
  return {
    ...mod,
    intercambiarCodigo: async () => ({ idToken: "fake-id-token" }),
    verificarIdToken: async () => ({
      sub: "juan",
      email: "juan@gmail.com",
      emailVerificado: true,
      nombre: "Juan",
    }),
  };
});

const persistirSesion = vi.hoisted(() => vi.fn(async (_s?: unknown): Promise<boolean> => false));
vi.mock("../src/lib/control-db.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/lib/control-db.js")>();
  return {
    ...mod,
    persistirSesion: persistirSesion,
    persistirUsuario: async () => true,
  };
});

function setCookies(r: Response): string[] {
  const h = r.headers as Headers & { getSetCookie?: () => string[] };
  return typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
}

function jarDeCookies(cookies: string[]): string {
  return cookies
    .map((c) => c.split(";")[0]!.trim())
    .filter(Boolean)
    .join("; ");
}

function stateDeCookies(cookies: string[]): string {
  const jar = cookies.join("; ");
  const m = jar.match(/__Host-oauth-state=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

describe("P1-55 callback no cierra login si falla persistirSesion con DB", () => {
  beforeEach(() => {
    resetStore();
    persistirSesion.mockReset();
    persistirSesion.mockResolvedValue(false);
    process.env.GOOGLE_LOGIN_CLIENT_ID = "login-client";
    process.env.GOOGLE_LOGIN_CLIENT_SECRET = "shh";
    process.env.GOOGLE_LOGIN_REDIRECT = "http://x/api/auth/callback";
  });

  it("con CONTROL_DATABASE_URL y persist false: error y sin sesión", async () => {
    process.env.CONTROL_DATABASE_URL = "postgres://fake";
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const cookies = setCookies(rLogin);
    const state = stateDeCookies(cookies);
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: jarDeCookies(cookies), accept: "text/html" },
      }),
    );
    expect(rCb.status).toBe(302);
    expect(rCb.headers.get("Location")).toMatch(/ingreso=error/);
    expect(rCb.headers.get("Location")).toMatch(/guardar%20tu%20sesi/);
    expect([...control.sessions.values()].some((s) => s.googleSub === "juan")).toBe(false);
  });

  it("sin CONTROL_DATABASE_URL: memoria alcanza y el login sigue", async () => {
    delete process.env.CONTROL_DATABASE_URL;
    persistirSesion.mockResolvedValue(false);
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const cookies = setCookies(rLogin);
    const state = stateDeCookies(cookies);
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: jarDeCookies(cookies) },
      }),
    );
    expect(rCb.status).toBe(302);
    expect(rCb.headers.get("Location")).not.toMatch(/ingreso=error/);
    expect([...control.sessions.values()].some((s) => s.googleSub === "juan")).toBe(true);
  });
});
