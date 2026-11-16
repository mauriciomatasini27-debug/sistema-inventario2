import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { GET as GETConsult } from "../src/pages/api/whatsapp/consult.js";
import { POST as POSTClose } from "../src/pages/api/email/close-summary.js";

// La sesión se valida contra el reloj real de la ruta (inactividad 30 días):
// una fecha fija deja de servir en cuanto pasa la ventana.
const AHORA = new Date();

function sesion(sub: string): string {
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora: AHORA });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: AHORA.toISOString(),
  });
  return c.idPlano;
}

beforeEach(() => {
  resetStore();
  delete process.env.TENANT_DATABASE_URL;
});

describe("whatsapp/email PERS-S4 (sin DB no rompe)", () => {
  it("consult exige sesión y responde desde memoria con fuente", async () => {
    const anon = (await GETConsult(ctx("http://x/api/whatsapp/consult?term=stock"))) as Response;
    expect(anon.status).toBe(403);
    const plano = sesion("u-1");
    const r = (await GETConsult(
      ctx("http://x/api/whatsapp/consult?term=stock", {
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    )) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as Record<string, unknown>)["fuente"]).toBe("memoria");
  });

  it("close-summary 201 + replay 409 misma jornada", async () => {
    const body = {
      tenant_id: "t-1",
      cierre_id: "c-1",
      fecha_jornada: "2026-10-12",
      destinatario: "dueno@kiosco.example",
      nombre_comercio: "Kiosco",
      tipo: "manual",
    };
    const r1 = (await POSTClose(
      ctx("http://x/api/email/close-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    )) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTClose(
      ctx("http://x/api/email/close-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    )) as Response;
    expect(r2.status).toBe(409);
  });
});
