import { describe, expect, it, beforeEach, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { GET as getCallback } from "../src/pages/api/auth/callback.js";
import { GET as getReauth } from "../src/pages/api/auth/reauth.js";

// OIDC mockeado solo en el borde: el intercambio y la verificación.
// Todo lo demás (PKCE, state, cookies, sesiones) corre de verdad.
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

// Set-Cookie real (sin mock): el redirect de ctx() devuelve Response y la
// ruta adjunta headers, igual que el runtime Astro. Si la ruta no adjunta
// cookies, se ve acá.
function setCookies(r: Response): string[] {
  const h = r.headers as Headers & { getSetCookie?: () => string[] };
  return typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
}

function sesion(sub: string, tenantId: string | null) {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c;
}

beforeEach(() => {
  resetStore();
  process.env.GOOGLE_LOGIN_CLIENT_ID = "login-client";
  process.env.GOOGLE_LOGIN_CLIENT_SECRET = "shh";
  process.env.GOOGLE_LOGIN_REDIRECT = "http://x/api/auth/callback";
});

describe("AU-FIX-S5 login punta a punta con redirect real", () => {
  it("login entrega state+PKCE en cookies y el callback crea sesión", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    expect(rLogin.status).toBe(302);
    const loc = rLogin.headers.get("Location") ?? "";
    expect(loc).toContain("accounts.google.com");
    const state = new URL(loc).searchParams.get("state") ?? "";
    expect(state).not.toBe("");
    const cookies = setCookies(rLogin);
    const jar = cookies.join("; ");
    expect(jar).toContain(`__Host-oauth-state=${state}`);
    expect(jar).toContain("__Host-oauth-pkce=");

    const cb = ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
      headers: { cookie: jar },
    });
    const rCb = await getCallback(cb);
    expect(rCb.status).toBe(302);
    expect(cb.cookies.has("__Host-sesion")).toBe(true);
    expect([...control.sessions.values()].some((s) => s.googleSub === "juan")).toBe(true);
    expect(control.events.some((e) => e.tipo === "login" && e.actor === "juan")).toBe(true);
    expect(control.pendingAuth.has(state)).toBe(false);
  });

  it("state vencido da 403 y borra la entrada", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const state = new URL(rLogin.headers.get("Location") ?? "").searchParams.get("state") ?? "";
    const p = control.pendingAuth.get(state)!;
    control.pendingAuth.set(state, { ...p, expiraEnMs: Date.now() - 1000 });
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: setCookies(rLogin).join("; ") },
      }),
    );
    expect(rCb.status).toBe(403);
    expect(control.pendingAuth.has(state)).toBe(false);
  });

  it("sin cookies el callback sigue 403", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const state = new URL(rLogin.headers.get("Location") ?? "").searchParams.get("state") ?? "";
    const rCb = await getCallback(ctx(`http://x/api/auth/callback?code=CODE&state=${state}`));
    expect(rCb.status).toBe(403);
  });
});

describe("AU-FIX-S6 regresión: redirects siempre con Set-Cookie", () => {
  it("login adjunta state+pkce; reauth adjunta reauth-state+pkce", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const jarLogin = setCookies(rLogin).join("; ");
    expect(jarLogin).toContain("__Host-oauth-state=");
    expect(jarLogin).toContain("__Host-oauth-pkce=");

    control.users.set("juan", { googleSub: "juan", email: "juan@gmail.com", emailVerificado: true });
    const c = sesion("juan", "t-1");
    const rReauth = await getReauth(
      ctx("http://x/api/auth/reauth", {
        headers: { cookie: `__Host-sesion=${c.idPlano}` },
      }),
    );
    expect(rReauth.status).toBe(302);
    const jarReauth = setCookies(rReauth).join("; ");
    expect(jarReauth).toContain("__Host-reauth-state=");
    expect(jarReauth).toContain("__Host-reauth-pkce=");
  });
});
