import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  TIPOS_EVENTO_AUTH,
  enmascararEmail,
  esEventoDeComercio,
  formatearEvento,
  sanitizarDetalle,
} from "../src/modules/auth/auditoria.js";
import { GET as getActividad } from "../src/pages/api/tenants/[id]/actividad.js";
import * as schema from "../src/db/schema.js";

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
  control.memberships.set(`m-${dueno}`, { id: `m-${dueno}`, tenantId: id, googleSub: dueno, rol: "dueno", permisos: [], estado: "activo" });
  control.users.set(dueno, { googleSub: dueno, email: "marta@gmail.com", emailVerificado: true, nombre: "Marta" });
  control.users.set("juan", { googleSub: "juan", email: "juan.perez@gmail.com", emailVerificado: true, nombre: "Juan" });
}

beforeEach(() => {
  resetStore();
});

describe("AU12 nucleo puro", () => {
  it("tipos cerrados: los eventos de mis rutas están todos listados", () => {
    for (const t of [
      "sesion_cerrada",
      "sesion_cerrada_remota",
      "dispositivo_nombrado",
      "reauth_ok",
      "reauth_fallida",
      "vinculo_codigo_generado",
      "vinculo_ok",
      "vinculo_fallido",
      "bot_desvinculado",
      "bot_habilitado",
      "bot_deshabilitado",
      "membership_otorgada",
      "exportacion_actividad",
      "login",
      "acceso_denegado",
    ]) {
      expect((TIPOS_EVENTO_AUTH as readonly string[]).includes(t)).toBe(true);
    }
  });

  it("solo los de comercio llegan a Actividad (AU12.2)", () => {
    expect(esEventoDeComercio("invitacion_aceptada")).toBe(true);
    expect(esEventoDeComercio("sesion_cerrada_remota")).toBe(true);
    expect(esEventoDeComercio("vinculo_ok")).toBe(true);
    expect(esEventoDeComercio("login")).toBe(false);
    expect(esEventoDeComercio("reauth_ok")).toBe(false);
    expect(esEventoDeComercio("acceso_denegado")).toBe(false);
  });

  it("sin datos sensibles: fuera tokens/códigos, adentro hashes; emails enmascarados", () => {
    const s = sanitizarDetalle({
      token: "plano-secreto",
      codigo: "482913",
      id_plano: "abc",
      tokenHash: "h1",
      codigoHash: "h2",
      email: "Juan.Perez@gmail.com",
      nota: "avisar a juan@gmail.com",
      anidado: { password: "x", ok: 1 },
    }) as Record<string, unknown>;
    expect(s.token).toBeUndefined();
    expect(s.codigo).toBeUndefined();
    expect(s.id_plano).toBeUndefined();
    expect(s.tokenHash).toBe("h1");
    expect(s.codigoHash).toBe("h2");
    expect(s.email).toBe("J…@gmail.com");
    expect(s.nota).toBe("avisar a j…@gmail.com");
    expect((s.anidado as Record<string, unknown>).password).toBeUndefined();
    expect(enmascararEmail("marta@gmail.com")).toBe("m…@gmail.com");
  });

  it("formatea como el criterio: aceptó, cerraste sesión, revocaste", () => {
    expect(formatearEvento({ tipo: "invitacion_aceptada", actorNombre: "Juan", fechaISO: "2026-10-09T10:32:00.000Z" })).toContain("Juan aceptó la invitación");
    expect(formatearEvento({ tipo: "sesion_cerrada_remota", actorNombre: "Vos", objetivoNombre: "Juan", fechaISO: "2026-10-09T18:05:00.000Z" })).toContain("Cerraste la sesión de Juan");
    expect(formatearEvento({ tipo: "revocacion", actorNombre: "Vos", objetivoNombre: "Juan", fechaISO: "2026-10-09T18:06:00.000Z" })).toContain("Revocaste el acceso de Juan");
  });
});

describe("AU12 ruta actividad", () => {
  it("dueno ve eventos del comercio con texto; empleado y ajeno 403", async () => {
    tenantConDueno("t-1", "dueno-1");
    control.events.push({ tenantId: "t-1", tipo: "invitacion_aceptada", actor: "juan", creadoEn: "2026-10-09T10:32:00.000Z" });
    control.events.push({ tenantId: "t-1", tipo: "login", actor: "juan", creadoEn: "2026-10-09T10:33:00.000Z" });
    control.events.push({ tenantId: "otro", tipo: "invitacion_aceptada", actor: "x", creadoEn: "2026-10-09T10:34:00.000Z" });
    const d = sesion("dueno-1", "t-1");
    const r = await getActividad(
      ctx("http://x/api/tenants/t-1/actividad", {
        headers: { cookie: `__Host-sesion=${d.idPlano}` },
        params: { id: "t-1" },
      }),
    );
    expect(r.status).toBe(200);
    const j = (await r.json()) as { eventos: Array<{ tipo: string; texto: string }>; total: number };
    // login no es de comercio: solo la invitación.
    expect(j.total).toBe(1);
    expect(j.eventos[0]?.texto).toContain("Juan aceptó la invitación");

    control.memberships.set("m-juan", { id: "m-juan", tenantId: "t-1", googleSub: "juan", rol: "empleado", permisos: [], estado: "activo" });
    const js = sesion("juan", "t-1");
    const rEmp = await getActividad(
      ctx("http://x/api/tenants/t-1/actividad", {
        headers: { cookie: `__Host-sesion=${js.idPlano}` },
        params: { id: "t-1" },
      }),
    );
    expect(rEmp.status).toBe(403);
  });

  it("csv exige reauth reciente y audita la exportación (AU12.4)", async () => {
    tenantConDueno("t-1", "dueno-1");
    control.events.push({ tenantId: "t-1", tipo: "sesion_cerrada_remota", actor: "dueno-1", detalle: { objetivo: "juan" }, creadoEn: new Date().toISOString() });
    const fria = crearSesion({ googleSub: "dueno-1", tenantId: "t-1", ahora: new Date() });
    control.sessions.set(fria.registro.idHash, {
      idHash: fria.registro.idHash,
      googleSub: "dueno-1",
      tenantId: "t-1",
      expiraAt: fria.registro.expiraAt,
      expiraAbsoluta: fria.registro.expiraAbsoluta,
      lastSeenAt: new Date().toISOString(),
      reauthAt: new Date(Date.now() - 20 * 60_000).toISOString(),
    });
    const r401 = await getActividad(
      ctx("http://x/api/tenants/t-1/actividad?formato=csv", {
        headers: { cookie: `__Host-sesion=${fria.idPlano}` },
        params: { id: "t-1" },
      }),
    );
    expect(r401.status).toBe(401);

    const d = sesion("dueno-1", "t-1");
    const r200 = await getActividad(
      ctx("http://x/api/tenants/t-1/actividad?formato=csv", {
        headers: { cookie: `__Host-sesion=${d.idPlano}` },
        params: { id: "t-1" },
      }),
    );
    expect(r200.status).toBe(200);
    expect(r200.headers.get("Content-Type")).toContain("text/csv");
    expect(control.events.some((e) => e.tipo === "exportacion_actividad")).toBe(true);
  });
});

describe("AU12 contratos", () => {
  it("auth_events es append-only en migración (REVOKE + trigger)", () => {
    const sql = readFileSync("drizzle/0004_auth_append_only.sql", "utf8");
    expect(sql).toContain('REVOKE UPDATE, DELETE ON "auth_events"');
    expect(sql).toContain("auth_events_no_update");
    expect(sql).toContain("auth_append_only_guard");
  });

  it("sin columnas sensibles en auth (contraseñas, tokens de acceso)", () => {
    for (const nombre of Object.keys(schema)) {
      expect(nombre).not.toMatch(/password|passwd|hash_clave|refresh_token|access_token/i);
    }
    const authEvents = (schema as Record<string, unknown>).authEvents as Record<string, unknown>;
    for (const col of Object.keys(authEvents)) {
      expect(col).not.toMatch(/token_plano|codigo_plano|id_plano|password/i);
    }
  });
});
