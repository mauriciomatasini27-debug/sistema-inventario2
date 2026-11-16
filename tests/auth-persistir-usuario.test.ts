import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { getControlDb } from "../src/lib/db.js";
import { users, sessions } from "../src/db/schema.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { GET as getCallback } from "../src/pages/api/auth/callback.js";

const SUB = "sup-fk-user";
const EMAIL = "sup-fk@gmail.com";

// OIDC mockeado solo en el borde; PKCE, state, cookies y el write-through del
// usuario corren de verdad.
vi.mock("../src/modules/auth/oidc.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/modules/auth/oidc.js")>();
  return {
    ...mod,
    intercambiarCodigo: async () => ({ idToken: "fake-id-token" }),
    verificarIdToken: async () => ({ sub: SUB, email: EMAIL, emailVerificado: true, nombre: "Sup FK" }),
  };
});

function setCookies(r: Response): string[] {
  const h = r.headers as Headers & { getSetCookie?: () => string[] };
  return typeof h.getSetCookie === "function" ? h.getSetCookie() : [];
}

function fijarLogin() {
  process.env.GOOGLE_LOGIN_CLIENT_ID = "login-client";
  process.env.GOOGLE_LOGIN_CLIENT_SECRET = "shh";
  process.env.GOOGLE_LOGIN_REDIRECT = "http://x/api/auth/callback";
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

async function loginYCallback(): Promise<Response> {
  // P1-55: state viene de la cookie, no del Location (login salta al hop).
  const rLogin = await getLogin(ctx("http://x/api/auth/login"));
  const cookies = setCookies(rLogin);
  const state = stateDeCookies(cookies);
  return (await getCallback(
    ctx(`http://x/api/auth/callback?code=CODE&state=${state}`, {
      headers: { cookie: jarDeCookies(cookies) },
    }),
  )) as Response;
}

describe("login sin DB: la sesion sigue en memoria (best-effort no rompe)", () => {
  beforeEach(() => {
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_MODE;
    resetStore();
    fijarLogin();
  });

  it("callback 302 y usuario en memoria", async () => {
    const rCb = await loginYCallback();
    expect(rCb.status).toBe(302);
    expect(control.users.get(SUB)?.email).toBe(EMAIL);
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A && process.env.PG_TEST_URL_B);

describe.skipIf(!hayPG)("login persiste el usuario en control (FK de tenants)", () => {
  afterAll(async () => {
    if (!process.env.CONTROL_DATABASE_URL) return;
    // sessions referencia users(google_sub): sin borrar la sesión el delete
    // de users choca con el FK.
    await getControlDb().delete(sessions).where(eq(sessions.googleSub, SUB));
    await getControlDb().delete(users).where(eq(users.googleSub, SUB));
    delete process.env.CONTROL_DATABASE_URL;
  });

  it("el callback deja la fila users antes de que corra el alta", async () => {
    const url = await asegurarBasePrivada("sup_usuario", process.env.PG_TEST_URL_A ?? "");
    delete process.env.TENANT_MODE;
    process.env.CONTROL_DATABASE_URL = url;
    resetStore();
    fijarLogin();
    await getControlDb().delete(sessions).where(eq(sessions.googleSub, SUB));
    await getControlDb().delete(users).where(eq(users.googleSub, SUB));

    const antes = await getControlDb().select().from(users).where(eq(users.googleSub, SUB));
    expect(antes).toHaveLength(0);

    const rCb = await loginYCallback();
    expect(rCb.status).toBe(302);

    const filas = await getControlDb().select().from(users).where(eq(users.googleSub, SUB));
    expect(filas).toHaveLength(1);
    expect(filas[0]?.email).toBe(EMAIL);
    expect(filas[0]?.emailVerificado).toBe(true);
  }, 30000);
});
