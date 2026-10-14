import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  estaBloqueadoReauth,
  necesitaReauth,
  registrarFalloReauth,
  validarReauth,
  VENTANA_REAUTH_MS,
} from "../src/modules/auth/reautenticacion.js";
import { exigirReauthReciente } from "../src/lib/control.js";
import { POST as postMemberships } from "../src/pages/api/tenants/[id]/memberships.js";
import { POST as postCerrarRemota } from "../src/pages/api/tenants/[id]/sesiones.js";

const AHORA = new Date("2026-10-10T12:00:00.000Z");

function sesion(sub: string, tenantId: string | null, reauthAt?: string) {
  const ahoraReal = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora: ahoraReal });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahoraReal.toISOString(),
    // Por defecto fresca (hora real): la ventana de 10min se mide con el
    // reloj real en las rutas. Los casos "fríos" pasan reauthAt viejo.
    reauthAt: reauthAt ?? ahoraReal.toISOString(),
  });
  return c;
}

function reauthVieja(): string {
  return new Date(Date.now() - 20 * 60_000).toISOString();
}

function tenantConDueno(id: string, dueno: string) {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco La Esquina",
    slug: "kiosco-la-esquina",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  const mid = `m-${dueno}`;
  control.memberships.set(mid, { id: mid, tenantId: id, googleSub: dueno, rol: "dueno", permisos: [], estado: "activo" });
}

beforeEach(() => {
  resetStore();
});

describe("AU10 nucleo puro", () => {
  it("ventana 10min: sin reauth o vieja exige confirmar", () => {
    expect(necesitaReauth({ reauthAt: undefined, ahora: AHORA })).toBe(true);
    expect(necesitaReauth({ reauthAt: AHORA.toISOString(), ahora: AHORA })).toBe(false);
    const vieja = new Date(AHORA.getTime() - VENTANA_REAUTH_MS - 1000).toISOString();
    expect(necesitaReauth({ reauthAt: vieja, ahora: AHORA })).toBe(true);
    const limite = new Date(AHORA.getTime() - VENTANA_REAUTH_MS + 60_000).toISOString();
    expect(necesitaReauth({ reauthAt: limite, ahora: AHORA })).toBe(false);
  });

  it("valida mismo sub, nonce e iat<2min", () => {
    const ahoraMs = AHORA.getTime();
    expect(
      validarReauth({ subSesion: "a", subToken: "a", nonceEsperado: "n", nonceToken: "n", iatMs: ahoraMs - 60_000, ahoraMs }).ok,
    ).toBe(true);
    expect(validarReauth({ subSesion: "a", subToken: "b", ahoraMs }).motivo).toBe("sub_distinto");
    expect(validarReauth({ subSesion: "a", subToken: "a", nonceEsperado: "n", nonceToken: "x", ahoraMs }).motivo).toBe("nonce_distinto");
    expect(validarReauth({ subSesion: "a", subToken: "a", iatMs: ahoraMs - 5 * 60_000, ahoraMs }).motivo).toBe("token_viejo");
  });

  it("rate limit: 5 fallos bloquean 5 minutos", () => {
    let e = undefined;
    for (let i = 0; i < 4; i++) {
      e = registrarFalloReauth(e, AHORA.getTime());
      expect(estaBloqueadoReauth(e, AHORA.getTime())).toBe(false);
    }
    e = registrarFalloReauth(e, AHORA.getTime());
    expect(estaBloqueadoReauth(e, AHORA.getTime())).toBe(true);
    expect(estaBloqueadoReauth(e, AHORA.getTime() + 6 * 60_000)).toBe(false);
  });

  it("exigirReauthReciente responde 401 con reauth_url", () => {
    const c = sesion("d", "t");
    const s = control.sessions.get(c.registro.idHash)!;
    delete s.reauthAt;
    const r = exigirReauthReciente({ sesion: s, googleSub: "d", tenantId: "t" }, AHORA);
    expect(r?.status).toBe(401);
    s.reauthAt = AHORA.toISOString();
    expect(exigirReauthReciente({ sesion: s, googleSub: "d", tenantId: "t" }, AHORA)).toBeNull();
  });
});

describe("AU10 rutas sensibles", () => {
  it("invitar sin reauth reciente da 401; con reauth da 201", async () => {
    tenantConDueno("t-1", "dueno-1");
    const fria = sesion("dueno-1", "t-1", reauthVieja());
    const r401 = await postMemberships({
      request: new Request("http://x/api/tenants/t-1/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${fria.idPlano}` },
        body: JSON.stringify({ google_sub: "emp-1", rol: "empleado" }),
      }),
      params: { id: "t-1" },
    } as never);
    expect(r401.status).toBe(401);
    expect(JSON.stringify(await r401.json())).toContain("reauth_requerida");

    const fresca = sesion("dueno-1", "t-1");
    const r201 = await postMemberships({
      request: new Request("http://x/api/tenants/t-1/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${fresca.idPlano}` },
        body: JSON.stringify({ google_sub: "emp-1", rol: "empleado" }),
      }),
      params: { id: "t-1" },
    } as never);
    expect(r201.status).toBe(201);
  });

  it("cerrar sesiones ajenas sin reauth da 401", async () => {
    tenantConDueno("t-1", "dueno-1");
    const fria = sesion("dueno-1", "t-1", reauthVieja());
    const j = sesion("juan", "t-1");
    void j;
    const r = await postCerrarRemota({
      request: new Request("http://x/api/tenants/t-1/sesiones", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${fria.idPlano}` },
        body: JSON.stringify({ google_sub: "juan", todas: true }),
      }),
      params: { id: "t-1" },
    } as never);
    expect(r.status).toBe(401);
  });

  it("durante 10min tras reauth no vuelve a pedir", async () => {
    tenantConDueno("t-1", "dueno-1");
    const fresca = sesion("dueno-1", "t-1");
    const mk = (sub: string) =>
      ctx("http://x/api/tenants/t-1/memberships", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${fresca.idPlano}` },
        body: JSON.stringify({ google_sub: sub, rol: "empleado" }),
        params: { id: "t-1" },
      });
    expect((await postMemberships(mk("e1"))).status).toBe(201);
    expect((await postMemberships(mk("e2"))).status).toBe(201);
  });
});
