import { describe, expect, it, beforeEach, vi } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion, sha256Hex } from "../src/modules/auth/sesiones.js";
import { POST as postLogout } from "../src/pages/api/auth/logout.js";
import { rehidratarSesion } from "../src/lib/rehidratar-sesion.js";
import { resolverSesion } from "../src/lib/control.js";

// P1-97: Postgres simulado para cruzar instancias de Vercel sin base real.
const filasDb = vi.hoisted(
  () =>
    new Map<
      string,
      {
        idHash: string;
        googleSub: string;
        tenantId: string | null;
        expiraAt: string;
        expiraAbsoluta?: string;
        lastSeenAt?: string;
        revocadaAt?: string;
        motivo?: string;
      }
    >(),
);

vi.mock("../src/lib/control-db.js", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../src/lib/control-db.js")>();
  return {
    ...mod,
    leerSesionDb: async (idHash: string) => filasDb.get(idHash) ?? null,
    revocarSesionDb: async (idHash: string, motivo: string) => {
      const fila = filasDb.get(idHash);
      if (!fila) return false;
      fila.revocadaAt = new Date().toISOString();
      fila.motivo = motivo;
      return true;
    },
  };
});

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
  filasDb.clear();
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

  it("P1-97: la sesión no revive en otra instancia después del logout", async () => {
    const plano = sesionEnStore("dueno-logout");
    const idHash = sha256Hex(plano);
    const previa = control.sessions.get(idHash)!;
    filasDb.set(idHash, {
      idHash,
      googleSub: previa.googleSub,
      tenantId: previa.tenantId,
      expiraAt: previa.expiraAt,
      ...(previa.expiraAbsoluta ? { expiraAbsoluta: previa.expiraAbsoluta } : {}),
      ...(previa.lastSeenAt ? { lastSeenAt: previa.lastSeenAt } : {}),
    });
    const pedido = () =>
      new Request("http://x/api/auth/sesion-actual", {
        headers: { cookie: `__Host-sesion=${plano}` },
      });
    await postLogout(
      ctx("http://x/api/auth/logout", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    );
    // Otra instancia de Vercel: memoria vacía, solo queda la fila durable.
    control.sessions.clear();
    await rehidratarSesion(pedido());
    expect(filasDb.get(idHash)?.revocadaAt).toBeTruthy();
    expect(resolverSesion(pedido())).toBeNull();
  });
});
