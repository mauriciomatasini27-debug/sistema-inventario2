import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { reclamarIdBaseLibre, idsConBasePropia } from "../src/lib/db.js";
import { POST as postAlta } from "../src/pages/api/onboarding/alta.js";
import { GET as getHealth } from "../src/pages/api/health.js";

function sesionEnStore(sub: string, tenantId: string | null = null) {
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
  return c.idPlano;
}

function req(plano: string, cuerpo: unknown) {
  return ctx("http://x/api/onboarding/alta", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `__Host-sesion=${plano}` },
    body: cuerpo as Record<string, unknown>,
  });
}

const ENV_KEYS = [
  "TENANT_MODE",
  "CONTROL_DATABASE_URL",
  "TENANT_DATABASE_URL",
  "TENANT_DATABASE_URL_piloto1",
  "TENANT_DATABASE_URL_piloto2",
  "GOOGLE_LOGIN_CLIENT_ID",
  "GOOGLE_LOGIN_CLIENT_SECRET",
  "GOOGLE_LOGIN_REDIRECT",
  "JOBS_SECRET",
] as const;

const prev: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  resetStore();
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  delete process.env.CONTROL_DATABASE_URL;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env.TENANT_DATABASE_URL_piloto1;
  delete process.env.TENANT_DATABASE_URL_piloto2;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    const v = prev[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetStore();
});

describe("P1-68 piloto multi: alta reclama base pre-cargada", () => {
  it("reclamarIdBaseLibre salta ids ya ocupados", () => {
    process.env.TENANT_DATABASE_URL_piloto1 = "postgres://a";
    process.env.TENANT_DATABASE_URL_piloto2 = "postgres://b";
    expect(idsConBasePropia()).toEqual(["piloto1", "piloto2"]);
    expect(reclamarIdBaseLibre(new Set(["piloto1"]))).toBe("piloto2");
    expect(reclamarIdBaseLibre(new Set(["piloto1", "piloto2"]))).toBeNull();
  });

  it("multi sin TENANT_DATABASE_URL_<id> responde 503 sin crear tenant", async () => {
    process.env.TENANT_MODE = "multi";
    const plano = sesionEnStore("dueno-sin-cupo");
    const r = await postAlta(
      req(plano, { nombre_comercio: "Kiosco Sin Base", rubro: "kiosco", request_key: "p168-sin" }),
    );
    expect(r.status).toBe(503);
    const j = (await r.json()) as { codigo?: string };
    expect(j.codigo).toBe("sin_base_libre");
    expect(control.tenants.size).toBe(0);
  });

  it("multi con URL pre-cargada reclama el id y deja tenant en la sesión", async () => {
    process.env.TENANT_MODE = "multi";
    process.env.TENANT_DATABASE_URL_piloto1 = "postgres://piloto1-fake";
    const plano = sesionEnStore("dueno-con-cupo");
    const r = await postAlta(
      req(plano, { nombre_comercio: "Kiosco Piloto Uno", rubro: "kiosco", request_key: "p168-ok" }),
    );
    expect(r.status).toBe(201);
    const j = (await r.json()) as { tenant_id: string; estado: string };
    expect(j.tenant_id).toBe("piloto1");
    expect(j.estado).toBe("activo");
    const hash = [...control.sessions.keys()][0]!;
    expect(control.sessions.get(hash)?.tenantId).toBe("piloto1");
    expect(control.tenants.get("piloto1")?.ownerGoogleSub).toBe("dueno-con-cupo");
  });

  it("segundo alta multi sin cupo libre responde 503", async () => {
    process.env.TENANT_MODE = "multi";
    process.env.TENANT_DATABASE_URL_piloto1 = "postgres://piloto1-fake";
    const plano1 = sesionEnStore("dueno-a");
    const r1 = await postAlta(
      req(plano1, { nombre_comercio: "Local A", rubro: "kiosco", request_key: "p168-a" }),
    );
    expect(r1.status).toBe(201);
    const plano2 = sesionEnStore("dueno-b");
    const r2 = await postAlta(
      req(plano2, { nombre_comercio: "Local B", rubro: "almacen", request_key: "p168-b" }),
    );
    expect(r2.status).toBe(503);
    expect(((await r2.json()) as { codigo?: string }).codigo).toBe("sin_base_libre");
  });

  it("health en multi marca tieneDb con control + TENANT_DATABASE_URL_<id>", async () => {
    process.env.TENANT_MODE = "multi";
    process.env.CONTROL_DATABASE_URL = "postgres://control";
    process.env.TENANT_DATABASE_URL_piloto1 = "postgres://piloto1";
    process.env.GOOGLE_LOGIN_CLIENT_ID = "id";
    process.env.GOOGLE_LOGIN_CLIENT_SECRET = "secret";
    process.env.GOOGLE_LOGIN_REDIRECT = "https://x/api/auth/callback";
    process.env.JOBS_SECRET = "jobs";
    const r = (await getHealth(ctx("http://x/api/health"))) as Response;
    const j = (await r.json()) as { tieneDb: boolean; tieneGoogle: boolean; tieneJobs: boolean };
    expect(j.tieneDb).toBe(true);
    expect(j.tieneGoogle).toBe(true);
    expect(j.tieneJobs).toBe(true);
  });
});
