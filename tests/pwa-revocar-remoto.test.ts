import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { crearTablasVacias, resetDb } from "../src/offline/db.js";
import { encolar, pendientes, resetOutbox } from "../src/offline/outbox-store.js";
import { resetMappings } from "../src/offline/id-mappings.js";
import { resetFotos } from "../src/offline/fotos.js";
import { resetFlagCompartido } from "../src/offline/dispositivo.js";
import { latido, type LatidoPost } from "../src/offline/latido.js";
import { POST as POSTRevocar } from "../src/pages/api/devices/revocar-remoto.js";
import { POST as POSTHeartbeat } from "../src/pages/api/sync/heartbeat.js";

function sesionDuena(sub: string, tenantId: string) {
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
  control.tenants.set(tenantId, {
    id: tenantId,
    nombreComercio: "Kiosco La Esquina",
    slug: "kiosco-la-esquina",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.memberships.set(`m-${sub}`, {
    id: `m-${sub}`,
    tenantId,
    googleSub: sub,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
  return c;
}

function postPorRuta(): LatidoPost {
  return async (url, cuerpo) => {
    const res = (await POSTHeartbeat(
      ctx(url, { method: "POST", body: { ...cuerpo } }),
    )) as Response;
    return { status: res.status, json: (await res.json()) as unknown };
  };
}

beforeEach(async () => {
  resetStore();
  await resetDb();
  await resetOutbox();
  await resetMappings();
  await resetFotos();
  resetFlagCompartido();
});

describe("P1-8 circuito borrado remoto: revocar-remoto → heartbeat wipe → latido borra", () => {
  it("Dueño revoca y el heartbeat del device devuelve wipe:true", async () => {
    const s = sesionDuena("dueno-1", "t1");
    const rev = (await POSTRevocar(
      ctx("http://x/api/devices/revocar-remoto", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${s.idPlano}` },
        body: { tenant_id: "t1", device_code: "caja-01", motivo: "perdido" },
      }),
    )) as Response;
    expect(rev.status).toBe(200);
    expect(((await rev.json()) as { wipe: boolean }).wipe).toBe(true);

    const hb = (await POSTHeartbeat(
      ctx("http://x/api/sync/heartbeat", {
        method: "POST",
        body: { device_code: "caja-01", pendientes: 2 },
      }),
    )) as Response;
    expect(hb.status).toBe(200);
    const j = (await hb.json()) as Record<string, unknown>;
    expect(j["wipe"]).toBe(true);

    const otro = (await POSTHeartbeat(
      ctx("http://x/api/sync/heartbeat", {
        method: "POST",
        body: { device_code: "caja-02", pendientes: 0 },
      }),
    )) as Response;
    expect(((await otro.json()) as Record<string, unknown>)["wipe"]).toBe(false);
  });

  it("latido contra el heartbeat real borra el diario local tras la revocación", async () => {
    const s = sesionDuena("dueno-1", "t1");
    await crearTablasVacias();
    await encolar({ kind: "venta", resumen: "v1" });
    expect(await pendientes(1_000_000)).toHaveLength(1);

    const rev = (await POSTRevocar(
      ctx("http://x/api/devices/revocar-remoto", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${s.idPlano}` },
        body: { tenant_id: "t1", device_code: "caja-01" },
      }),
    )) as Response;
    expect(rev.status).toBe(200);

    const r = await latido({ deviceCode: "caja-01", pendientes: 1, post: postPorRuta() });
    expect(r.wipe).toBe(true);
    expect(r.borrado).toBe(true);
    expect(await pendientes(1_000_000)).toHaveLength(0);
  });
});
