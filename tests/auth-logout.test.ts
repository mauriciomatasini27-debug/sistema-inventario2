import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion, sha256Hex } from "../src/modules/auth/sesiones.js";
import { POST as postLogout } from "../src/pages/api/auth/logout.js";

// P1-34: el botón solo dispara esta ruta; sin cookie sigue 200 y borra cookie.
function sesionEnStore(sub: string) {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

beforeEach(() => {
  resetStore();
});

describe("POST /api/auth/logout", () => {
  it("revoca la sesión y manda Set-Cookie de borrado", async () => {
    const plano = sesionEnStore("dueno-logout");
    const r = (await postLogout(
      ctx("http://x/api/auth/logout", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
    const s = control.sessions.get(sha256Hex(plano));
    expect(s?.revocadaAt).toBeTruthy();
    expect(s?.motivo).toBe("logout");
    const setCookie = r.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/Max-Age=0/);
  });

  it("sin cookie responde 200 igual", async () => {
    const r = (await postLogout(ctx("http://x/api/auth/logout", { method: "POST" }))) as Response;
    expect(r.status).toBe(200);
  });
});
