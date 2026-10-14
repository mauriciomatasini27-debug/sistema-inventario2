import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  aplicarCierre,
  decidirCierreDeDueno,
  decidirCierrePropio,
  listarSesionesPropias,
  validarNombreDispositivo,
} from "../src/modules/auth/dispositivos.js";
import { GET as getMisSesiones, POST as postCerrarPropia } from "../src/pages/api/auth/sesiones.js";
import { GET as getSesionesTenant, POST as postCerrarRemota } from "../src/pages/api/tenants/[id]/sesiones.js";
import { POST as postNombrar } from "../src/pages/api/devices/nombrar.js";

const AHORA = new Date("2026-10-10T12:00:00.000Z");

function sesion(sub: string, tenantId: string | null, agente = "Chrome en Android") {
  const ahoraReal = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora: ahoraReal });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahoraReal.toISOString(),
    agente,
    reauthAt: ahoraReal.toISOString(),
  });
  return c;
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

describe("AU9 nucleo puro", () => {
  it("lista solo mias y activas, con actual primero", () => {
    const a = sesion("juan", "t-1");
    sesion("otro", "t-1");
    const revocada = sesion("juan", "t-1");
    control.sessions.get(revocada.registro.idHash)!.revocadaAt = AHORA.toISOString();
    const lista = listarSesionesPropias({
      sesiones: [...control.sessions.values()],
      googleSub: "juan",
      idActualHash: a.registro.idHash,
      nombres: new Map(),
      ahora: AHORA,
    });
    expect(lista).toHaveLength(1);
    expect(lista[0]?.esActual).toBe(true);
    expect(lista[0]?.dispositivo).toContain("Chrome");
  });

  it("nombre asignado por el dueno prevalece (AU9.3)", () => {
    const a = sesion("juan", "t-1");
    const s = control.sessions.get(a.registro.idHash)!;
    s.dispositivoCodigo = "pc-mostrador";
    const lista = listarSesionesPropias({
      sesiones: [...control.sessions.values()],
      googleSub: "juan",
      idActualHash: a.registro.idHash,
      nombres: new Map([["pc-mostrador", "PC del mostrador"]]),
      ahora: AHORA,
    });
    expect(lista[0]?.dispositivo).toBe("PC del mostrador");
  });

  it("cierre propio: una o todas menos actual; cierre dueno exige rol", () => {
    const a = sesion("juan", "t-1");
    expect(decidirCierrePropio({ objetivoHash: a.registro.idHash, idActualHash: a.registro.idHash, sesiones: [...control.sessions.values()], googleSub: "juan" }).permite).toBe(true);
    expect(decidirCierrePropio({ objetivoHash: a.registro.idHash, idActualHash: "x", sesiones: [...control.sessions.values()], googleSub: "otro" }).motivo).toBe("no_encontrada");
    expect(decidirCierreDeDueno({ esDueno: false, objetivo: { idHash: "h", googleSub: "j", tenantId: "t", expiraAt: AHORA.toISOString() } }).motivo).toBe("no_permitido");
    const n = aplicarCierre({ sesiones: [...control.sessions.values()], hashes: [a.registro.idHash], ahora: AHORA });
    expect(n).toBe(1);
  });

  it("nombre de dispositivo se valida (1-40, sin control)", () => {
    expect(validarNombreDispositivo("PC del mostrador").ok).toBe(true);
    expect(validarNombreDispositivo("").ok).toBe(false);
    expect(validarNombreDispositivo("x".repeat(41)).ok).toBe(false);
  });
});

describe("AU9 rutas", () => {
  it("GET /api/auth/sesiones lista las mias y POST cierra una sin revocar membership", async () => {
    tenantConDueno("t-1", "dueno-1");
    control.memberships.set("m-juan", { id: "m-juan", tenantId: "t-1", googleSub: "juan", rol: "empleado", permisos: [], estado: "activo" });
    const a = sesion("juan", "t-1");
    const b = sesion("juan", "t-1");
    const r = await getMisSesiones(ctx("http://x/api/auth/sesiones", { headers: { cookie: `__Host-sesion=${a.idPlano}` } }));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { sesiones: unknown[] }).sesiones).toHaveLength(2);
    const c = await postCerrarPropia(
      ctx("http://x/api/auth/sesiones", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${a.idPlano}` },
        body: { id_hash: b.registro.idHash },
      }),
    );
    expect(c.status).toBe(200);
    // Cerrar no revoca el acceso: la membership sigue activa (AU9.2).
    expect(control.memberships.get("m-juan")?.estado).toBe("activo");
    expect(control.sessions.get(b.registro.idHash)?.revocadaAt).toBeDefined();
  });

  it("POST todas_menos_actual deja solo la actual", async () => {
    tenantConDueno("t-1", "dueno-1");
    const a = sesion("juan", "t-1");
    sesion("juan", "t-1");
    const r = await postCerrarPropia(
      ctx("http://x/api/auth/sesiones", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${a.idPlano}` },
        body: { todas_menos_actual: true },
      }),
    );
    expect(r.status).toBe(200);
    expect(((await r.json()) as { cerradas: number }).cerradas).toBe(1);
  });

  it("dueno ve y cierra sesiones del empleado; empleado no ve ajenas", async () => {
    tenantConDueno("t-1", "dueno-1");
    control.memberships.set("m-juan", { id: "m-juan", tenantId: "t-1", googleSub: "juan", rol: "empleado", permisos: [], estado: "activo" });
    const d = sesion("dueno-1", "t-1");
    const j = sesion("juan", "t-1");
    const lista = await getSesionesTenant(
      ctx("http://x/api/tenants/t-1/sesiones?google_sub=juan", {
        headers: { cookie: `__Host-sesion=${d.idPlano}` },
        params: { id: "t-1" },
      }),
    );
    expect(lista.status).toBe(200);
    const cierre = await postCerrarRemota(
      ctx("http://x/api/tenants/t-1/sesiones", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${d.idPlano}` },
        body: { google_sub: "juan", id_hash: j.registro.idHash },
        params: { id: "t-1" },
      }),
    );
    expect(cierre.status).toBe(200);
    // Juan sigue siendo miembro: el cierre remoto no es revocación.
    expect(control.memberships.get("m-juan")?.estado).toBe("activo");

    const j2 = sesion("juan", "t-1");
    const negada = await getSesionesTenant(
      ctx("http://x/api/tenants/t-1/sesiones?google_sub=dueno-1", {
        headers: { cookie: `__Host-sesion=${j2.idPlano}` },
        params: { id: "t-1" },
      }),
    );
    expect(negada.status).toBe(403);
  });

  it("dueno nombra dispositivo y se refleja en la lista", async () => {
    tenantConDueno("t-1", "dueno-1");
    const d = sesion("dueno-1", "t-1");
    const s = control.sessions.get(d.registro.idHash)!;
    s.dispositivoCodigo = "pc-1";
    const r = await postNombrar(
      ctx("http://x/api/devices/nombrar", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${d.idPlano}` },
        body: { tenant_id: "t-1", device_code: "pc-1", nombre: "PC del mostrador" },
      }),
    );
    expect(r.status).toBe(200);
    const lista = await getMisSesiones(ctx("http://x/api/auth/sesiones", { headers: { cookie: `__Host-sesion=${d.idPlano}` } }));
    expect(JSON.stringify(await lista.json())).toContain("PC del mostrador");
  });
});
