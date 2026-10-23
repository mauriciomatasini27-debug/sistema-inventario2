import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { filaVisible } from "../src/modules/bot/historial.js";
import { GET } from "../src/pages/api/whatsapp/historial.js";

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
    ownerGoogleSub: sub,
    esDemo: false,
  });
  control.memberships.set(`m-${sub}`, { id: `m-${sub}`, tenantId, googleSub: sub, rol, permisos: [], estado: "activo" });
  return c.idPlano;
}

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
});

describe("GET /api/whatsapp/historial", () => {
  it("sin sesión responde 403", async () => {
    const r = (await GET(ctx("http://x/api/whatsapp/historial"))) as Response;
    expect(r.status).toBe(403);
  });

  it("sin base del comercio responde 503", async () => {
    const cookie = sesion("duena", "t-hist", "dueno");
    const r = (await GET(ctx("http://x/api/whatsapp/historial", { headers: { cookie: `__Host-sesion=${cookie}` } }))) as Response;
    expect(r.status).toBe(503);
  });

  it("el JSON de filas no expone teléfono crudo ni wamid", () => {
    const fila = filaVisible({
      id: "uuid-1",
      creadoEnMs: 1,
      numeroE164: "+5491155551234",
      pregunta: "stock milka",
      respuesta: "quedan 3",
      fuente: "db",
    });
    const body = JSON.stringify({ filas: [fila], cursor: null, personas: null });
    expect(body).not.toContain("55551234");
    expect(body).not.toContain("numero_e164");
    expect(body).not.toContain("wamid");
  });
});
