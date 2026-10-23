import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET, PUT } from "../src/pages/api/alertas/destinatarios.js";

function sesion(sub: string, tenantId: string, rol: "dueno" | "empleado"): string {
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
    nombreComercio: "Kiosco",
    slug: "kiosco",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "duena",
    esDemo: false,
  });
  control.memberships.set(`m-${sub}`, { id: `m-${sub}`, tenantId, googleSub: sub, rol, permisos: [], estado: "activo" });
  control.users.set(sub, { googleSub: sub, email: `${sub}@test.com`, emailVerificado: true, nombre: sub });
  return c.idPlano;
}

beforeEach(() => resetStore());

describe("API /api/alertas/destinatarios", () => {
  it("PUT dueño responde 403 destinatario_fijo", async () => {
    const cookie = sesion("duena", "t-d", "dueno");
    const r = (await PUT(
      ctx("http://x/api/alertas/destinatarios", {
        method: "PUT",
        headers: { cookie: `__Host-sesion=${cookie}`, "content-type": "application/json" },
        body: JSON.stringify({ canal: "email", aviso_hora: "08:00", pausado_hasta: null }),
      }),
    )) as Response;
    expect(r.status).toBe(403);
    const j = (await r.json()) as { codigo: string };
    expect(j.codigo).toBe("destinatario_fijo");
  });

  it("PUT repetido converge", async () => {
    const cookie = sesion("emp", "t-d", "empleado");
    const body = { canal: "ambos", aviso_hora: "09:00", pausado_hasta: null };
    const req = () =>
      PUT(
        ctx("http://x/api/alertas/destinatarios", {
          method: "PUT",
          headers: { cookie: `__Host-sesion=${cookie}`, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const r1 = (await req()) as Response;
    const r2 = (await req()) as Response;
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const j1 = (await r1.json()) as { fila: { avisoHora: string } };
    const j2 = (await r2.json()) as { fila: { avisoHora: string } };
    expect(j1.fila.avisoHora).toBe("09:00");
    expect(j2.fila).toEqual(j1.fila);
  });

  it("GET empleado solo ve su fila", async () => {
    sesion("duena", "t-d", "dueno");
    const cookie = sesion("emp", "t-d", "empleado");
    control.memberships.set("m-duena", {
      id: "m-duena",
      tenantId: "t-d",
      googleSub: "duena",
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    control.users.set("duena", { googleSub: "duena", email: "d@test.com", emailVerificado: true });
    const r = (await GET(ctx("http://x/api/alertas/destinatarios", { headers: { cookie: `__Host-sesion=${cookie}` } }))) as Response;
    expect(r.status).toBe(200);
    const j = (await r.json()) as { filas: { googleSub: string }[] };
    expect(j.filas).toHaveLength(1);
    expect(j.filas[0]?.googleSub).toBe("emp");
  });
});
