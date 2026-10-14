import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { etiquetaAtendiendo, TEXTO_AYUDA_CUENTAS, TIPOS_EVENTO_AUTH } from "../src/modules/auth/auditoria.js";
import { resolverSesionPorPlano } from "../src/lib/control.js";
import { GET as getLogin } from "../src/pages/api/auth/login.js";
import { POST as postCambiarUsuario } from "../src/pages/api/auth/cambiar-usuario.js";
import { GET as getSesionActual } from "../src/pages/api/auth/sesion-actual.js";

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

describe("AU13 login con selector de cuenta", () => {
  it("prompt=select_account viaja a Google; otros valores se ignoran", async () => {
    const redirect = (destino: string, status: number) =>
      new Response(null, { status, headers: { Location: destino } });
    const r = await getLogin({
      request: new Request("http://x/api/auth/login?prompt=select_account"),
      redirect,
    } as never);
    expect(r.status).toBe(302);
    const loc = r.headers.get("Location") ?? "";
    expect(loc).toContain("prompt=select_account");
    const r2 = await getLogin({
      request: new Request("http://x/api/auth/login?prompt=consent"),
      redirect,
    } as never);
    expect(r2.headers.get("Location") ?? "").not.toContain("prompt=");
  });
});

describe("AU13 cambiar de usuario", () => {
  it("revoca la actual, borra la cookie, audita y devuelve login con selector", async () => {
    control.users.set("juan", { googleSub: "juan", email: "juan@gmail.com", emailVerificado: true, nombre: "Juan" });
    const c = sesion("juan", "t-1");
    const r = await postCambiarUsuario({
      request: new Request("http://x/api/auth/cambiar-usuario", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${c.idPlano}` },
      }),
    } as never);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { login_url: string }).login_url).toBe("/api/auth/login?prompt=select_account");
    expect(r.headers.get("Set-Cookie") ?? "").toContain("Max-Age=0");
    // La sesión vieja ya no resuelve: la PWA pide login.
    expect(resolverSesionPorPlano(c.idPlano)).toBeNull();
    expect(control.events.some((e) => e.tipo === "cambio_usuario" && e.actor === "juan")).toBe(true);
    expect((TIPOS_EVENTO_AUTH as readonly string[]).includes("cambio_usuario")).toBe(true);
  });

  it("sin sesión da 403", async () => {
    const r = await postCambiarUsuario(ctx("http://x/api/auth/cambiar-usuario", { method: "POST" }));
    expect(r.status).toBe(403);
  });
});

describe("AU13 barra Atendiendo", () => {
  it("etiqueta y ayuda (AU13.1/AU13.2)", async () => {
    expect(etiquetaAtendiendo("Juan")).toBe("Atendiendo: Juan");
    expect(TEXTO_AYUDA_CUENTAS).toContain("propia cuenta de Google");
    control.users.set("juan", { googleSub: "juan", email: "juan@gmail.com", emailVerificado: true, nombre: "Juan" });
    const c = sesion("juan", "t-1");
    const r = await getSesionActual({
      request: new Request("http://x/api/auth/sesion-actual", { headers: { cookie: `__Host-sesion=${c.idPlano}` } }),
    } as never);
    const j = (await r.json()) as { logueado: boolean; etiqueta: string; cambiar_usuario_url: string; ayuda: string };
    expect(j.logueado).toBe(true);
    expect(j.etiqueta).toBe("Atendiendo: Juan");
    expect(j.cambiar_usuario_url).toContain("prompt=select_account");
    expect(j.ayuda).toBe(TEXTO_AYUDA_CUENTAS);
    const anon = await getSesionActual(ctx("http://x/api/auth/sesion-actual"));
    expect(((await anon.json()) as { logueado: boolean }).logueado).toBe(false);
  });
});
