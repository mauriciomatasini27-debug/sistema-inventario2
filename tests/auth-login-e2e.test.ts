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

// P1-24: login responde 200 HTML (cookies) + link a Google, no 302 cross-site.
async function urlGoogle(r: Response): Promise<string> {
  const loc = r.headers.get("Location");
  if (loc) return loc;
  const html = await r.clone().text();
  const m = html.match(/https:\/\/accounts\.google\.com[^"'\s<]+/);
  return m ? m[0].replace(/&amp;/g, "&") : "";
}

function stateDeCookies(cookies: string[]): string {
  const jar = cookies.join("; ");
  const m = jar.match(/__Host-oauth-state=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
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
    expect(rLogin.status).toBe(200);
    const loc = await urlGoogle(rLogin);
    expect(loc).toContain("accounts.google.com");
    const cookies = setCookies(rLogin);
    const state = stateDeCookies(cookies);
    expect(state).not.toBe("");
    expect(new URL(loc).searchParams.get("state")).toBe(state);
    const jar = cookies.join("; ");
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
        headers: { cookie: setCookies(rLogin).join("; ") },
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

describe("P1-25 login no navega en el mismo tick que Set-Cookie", () => {
  it("el HTML demora el salto a Google (setTimeout) para persistir cookies", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    const html = await rLogin.clone().text();
    expect(html).toContain("setTimeout");
    expect(html).not.toMatch(/<script>location\.replace/);
    expect(html).toMatch(/content="1;url=/);
  });
});

describe("P1-23 cookies OAuth durables (state+pkce+nonce)", () => {
  it("las 3 cookies traen HttpOnly, Secure, SameSite=Lax, Path=/ y Max-Age=600", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    expect(rLogin.status).toBe(200);
    const cookies = setCookies(rLogin);
    expect(cookies).toHaveLength(3);
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
        headers: { cookie: setCookies(rLogin).join("; ") },
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
        headers: { cookie: setCookies(rLogin).join("; ") },
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
        headers: { cookie: setCookies(rLogin).join("; ") },
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
        headers: { cookie: setCookies(rLogin).join("; ") },
      }),
    );
    expect(rCb.headers.get("Location")).toBe("/panel");
    delete process.env.ADMIN_ALLOWLIST_SUBS;
  });
});
describe("AU-FIX-S6 regresión: redirects siempre con Set-Cookie", () => {
  it("login adjunta state+pkce; reauth adjunta reauth-state+pkce", async () => {
    const rLogin = await getLogin(ctx("http://x/api/auth/login"));
    expect(rLogin.status).toBe(200);
    expect(await urlGoogle(rLogin)).toContain("accounts.google.com");
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
