import { describe, expect, it, beforeEach, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { GET as getHaciaGoogle } from "../src/pages/api/auth/hacia-google.js";
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

function destinoDeCookies(cookies: string[]): string {
  const jar = cookies.join("; ");
  const m = jar.match(/__Host-oauth-destino=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

// P1-55: login 302 same-origin; el hop entrega la URL de Google.
async function loginYHop(): Promise<{ rLogin: Response; rHop: Response; state: string; jar: string }> {
  const rLogin = await getLogin(ctx("http://x/api/auth/login"));
  const cookies = setCookies(rLogin);
  const jar = jarDeCookies(cookies);
  const rHop = await getHaciaGoogle(
    ctx("http://x/api/auth/hacia-google", { headers: { cookie: jar } }),
  );
  return { rLogin, rHop, state: stateDeCookies(cookies), jar };
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
  delete process.env.CONTROL_DATABASE_URL;
  process.env.GOOGLE_LOGIN_CLIENT_ID = "login-client";
  process.env.GOOGLE_LOGIN_CLIENT_SECRET = "shh";
  process.env.GOOGLE_LOGIN_REDIRECT = "http://x/api/auth/callback";
});

describe("AU-FIX-S5 login punta a punta con redirect real", () => {
  it("login entrega state+PKCE en cookies y el callback crea sesión", async () => {
    const { rLogin, rHop, state, jar } = await loginYHop();
    expect(rLogin.status).toBe(302);
    expect(rLogin.headers.get("Location")).toBe("/api/auth/hacia-google");
    expect(rHop.status).toBe(302);
    const loc = rHop.headers.get("Location") ?? "";
    expect(loc).toContain("accounts.google.com");
    expect(state).not.toBe("");
    expect(new URL(loc).searchParams.get("state")).toBe(state);
    expect(jar).toContain("__Host-oauth-state=");
    expect(jar).toContain("__Host-oauth-pkce=");

    const cb = ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
      headers: { cookie: jar },
    });
    const rCb = await getCallback(cb);
    expect(rCb.status).toBe(302);
    expect(cb.cookies.has("__Host-sesion")).toBe(true);
    expect(setCookies(rCb).some((c) => c.includes("__Host-sesion="))).toBe(true);
    expect([...control.sessions.values()].some((s) => s.googleSub === "juan")).toBe(true);
    expect(control.events.some((e) => e.tipo === "login" && e.actor === "juan")).toBe(true);
    expect(control.pendingAuth.has(state)).toBe(false);
  });

  it("state vencido da 403 y borra la entrada", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const state = stateDeCookies(setCookies(rLogin));
    const p = control.pendingAuth.get(state)!;
    control.pendingAuth.set(state, { ...p, expiraEnMs: Date.now() - 1000 });
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: jarDeCookies(setCookies(rLogin)) },
      }),
    );
    expect(rCb.status).toBe(403);
    expect(control.pendingAuth.has(state)).toBe(false);
  });

  it("sin cookies el callback sigue 403", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const state = stateDeCookies(setCookies(rLogin));
    const rCb = await getCallback(ctx(`http://x/api/auth/callback?code=CODE&state=${state}`));
    expect(rCb.status).toBe(403);
  });
});

describe("P1-55 login hop same-origin antes de Google", () => {
  it("login 302 al hop con cookies oauth+destino; hop 302 a Google", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    expect(rLogin.status).toBe(302);
    expect(rLogin.headers.get("Location")).toBe("/api/auth/hacia-google");
    const cookies = setCookies(rLogin);
    expect(cookies.some((c) => c.startsWith("__Host-oauth-destino="))).toBe(true);
    const destino = destinoDeCookies(cookies);
    expect(destino).toContain("accounts.google.com");
    const rHop = await getHaciaGoogle(
      ctx("http://x/api/auth/hacia-google", { headers: { cookie: jarDeCookies(cookies) } }),
    );
    expect(rHop.status).toBe(302);
    expect(rHop.headers.get("Location")).toBe(destino);
    expect(setCookies(rHop).some((c) => c.includes("__Host-oauth-destino=") && c.includes("Max-Age=0"))).toBe(true);
  });

  it("hop sin destino cookie vuelve a la landing con error", async () => {
    const rHop = await getHaciaGoogle(ctx("http://x/api/auth/hacia-google"));
    expect(rHop.status).toBe(302);
    expect(rHop.headers.get("Location")).toMatch(/^\/\?ingreso=error/);
  });
});

describe("P1-23 cookies OAuth durables (state+pkce+nonce)", () => {
  it("las cookies oauth traen HttpOnly, Secure, SameSite=Lax, Path=/ y Max-Age=600", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    expect(rLogin.status).toBe(302);
    const cookies = setCookies(rLogin).filter((c) => !c.startsWith("__Host-oauth-destino="));
    expect(cookies.length).toBeGreaterThanOrEqual(3);
    for (const c of cookies) {
      expect(c).toContain("HttpOnly");
      expect(c).toContain("Secure");
      expect(c).toContain("SameSite=Lax");
      expect(c).toContain("Path=/");
      expect(c).toContain("Max-Age=600");
    }
    const jar = cookies.join("; ");
    expect(jar).toContain("__Host-oauth-state=");
    expect(jar).toContain("__Host-oauth-pkce=");
    expect(jar).toContain("__Host-oauth-nonce=");
  });

  it("callback sin pendingAuth en memoria (otra instancia) sigue con cookies", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const state = stateDeCookies(setCookies(rLogin));
    expect(control.pendingAuth.has(state)).toBe(true);
    control.pendingAuth.clear();
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: jarDeCookies(setCookies(rLogin)) },
      }),
    );
    expect(rCb.status).toBe(302);
    expect([...control.sessions.values()].some((s) => s.googleSub === "juan")).toBe(true);
  });
});

describe("P3-2a allowlist de next sin open-redirect (login.ts:33, callback.ts:178)", () => {
  async function flujoConNext(next: string | null): Promise<{ destino: string | null; pendienteNext: string | undefined }> {
    const qs = next === null ? "" : `?next=${encodeURIComponent(next)}`;
    const rLogin = await getLogin(ctx(`http://x/api/auth/login${qs}`));
    const state = stateDeCookies(setCookies(rLogin));
    const pendienteNext = control.pendingAuth.get(state)?.next;
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: jarDeCookies(setCookies(rLogin)) },
      }),
    );
    return { destino: rCb.headers.get("Location"), pendienteNext };
  }

  it("next=/panel se guarda y el callback redirige ahí", async () => {
    const { destino, pendienteNext } = await flujoConNext("/panel");
    expect(pendienteNext).toBe("/panel");
    expect(destino).toBe("/panel");
  });

  it("next absoluto y protocol-relative se ignoran (sin open-redirect)", async () => {
    for (const malo of ["https://evil.example/", "//evil.example/", "javascript:alert(1)"]) {
      resetStore();
      const { destino, pendienteNext } = await flujoConNext(malo);
      expect(pendienteNext).toBeUndefined();
      expect(destino).toBe("/?alta=pendiente");
      expect(destino ?? "").not.toContain("evil");
    }
  });

  it("vectores hostiles extra se ignoran: /\\evil, esquema sin barras, path con escape", async () => {
    for (const malo of ["/\\evil", "https:evil.example", "HTTP://evil.example/x", "/admin/../evil", "/panel?x=//evil"]) {
      resetStore();
      const { destino, pendienteNext } = await flujoConNext(malo);
      expect(pendienteNext).toBeUndefined();
      expect(destino).toBe("/?alta=pendiente");
      expect(destino ?? "").not.toContain("evil");
    }
  });
});

describe("P3-2b AU2-S3 bifurcación admin/tenant sin next (callback.ts)", () => {
  async function callbackSinNext(): Promise<string | null> {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const state = stateDeCookies(setCookies(rLogin));
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: jarDeCookies(setCookies(rLogin)) },
      }),
    );
    return rCb.headers.get("Location");
  }

  it("sub en ADMIN_ALLOWLIST_SUBS sin next termina en /admin", async () => {
    process.env.ADMIN_ALLOWLIST_SUBS = "juan";
    expect(await callbackSinNext()).toBe("/admin");
  });

  it("tenant común sin next mantiene el defecto con tenant (/)", async () => {
    delete process.env.ADMIN_ALLOWLIST_SUBS;
    control.tenants.set("t1", { id: "t1", nombreComercio: "K", slug: "k", estado: "activo", plan: "base", moneda: "ARS", ownerGoogleSub: "juan", esDemo: false });
    control.memberships.set("m1", { id: "m1", tenantId: "t1", googleSub: "juan", rol: "dueno", permisos: [], estado: "activo" });
    expect(await callbackSinNext()).toBe("/");
  });

  it("sin next, sin allowlist y sin tenant mantiene /?alta=pendiente", async () => {
    delete process.env.ADMIN_ALLOWLIST_SUBS;
    expect(await callbackSinNext()).toBe("/?alta=pendiente");
  });

  it("next validado gana sobre la allowlist admin", async () => {
    process.env.ADMIN_ALLOWLIST_SUBS = "juan";
    const rLogin = await getLogin(ctx("http://x/api/auth/login?next=/panel"));
    const state = stateDeCookies(setCookies(rLogin));
    const rCb = await getCallback(
      ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
        headers: { cookie: jarDeCookies(setCookies(rLogin)) },
      }),
    );
    expect(rCb.headers.get("Location")).toBe("/panel");
    delete process.env.ADMIN_ALLOWLIST_SUBS;
  });
});
describe("AU-FIX-S6 regresión: redirects siempre con Set-Cookie", () => {
  it("login adjunta state+pkce; reauth adjunta reauth-state+pkce", async () => {
    const { rLogin, rHop } = await loginYHop();
    expect(rLogin.status).toBe(302);
    expect(rHop.headers.get("Location") ?? "").toContain("accounts.google.com");
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
