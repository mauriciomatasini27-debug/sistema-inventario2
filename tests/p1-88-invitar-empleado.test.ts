import { ctx } from "./helpers/ctx.js";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { control, resetStore } from "../src/lib/store.js";
import { tenantPorDefecto } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { PERMISOS_EMPLEADO_DEFAULT } from "../src/modules/auth/modelo.js";
import { hashToken, type RegistroInvitacion } from "../src/modules/tenants/invitaciones.js";
import {
  invitarEmpleado,
  parseEmailInvitacion,
  type FotoInvitar,
  type MiembroFoto,
  type PedidoInvitar,
} from "../src/modules/tenants/invitar-empleado.js";
import * as controlDb from "../src/lib/control-db.js";
import { GET as getInv, POST as postInv } from "../src/pages/api/invitations/index.js";
import { POST as postAccept } from "../src/pages/api/invitations/accept.js";

const TENANT = tenantPorDefecto();
const DUENO = "p188-dueno";
const EMPLEADO = "p188-empleado";
const AHORA = new Date("2026-11-15T15:00:00.000Z");

function pedido(email: string, intencion: PedidoInvitar["intencion"] = "crear", ahora = AHORA): PedidoInvitar {
  const parsed = parseEmailInvitacion(email);
  if (!parsed) throw new Error(`email de prueba inválido: ${email}`);
  return {
    tenantId: "comercio-1",
    email: parsed,
    creadaPor: DUENO,
    intencion,
    origen: "http://localhost:4321",
    ahora,
  };
}

function foto(miembros: readonly MiembroFoto[], extra: Partial<FotoInvitar> = {}): FotoInvitar {
  return {
    plan: "base",
    miembrosActivos: extra.miembrosActivos ?? miembros.length,
    miembros,
    pendientes: extra.pendientes ?? [],
    ...(extra.plan ? { plan: extra.plan } : {}),
  };
}

function pendiente(email: string, expiraAt: string, estado: RegistroInvitacion["estado"] = "pendiente"): RegistroInvitacion {
  return {
    tokenHash: `hash-${email}-${estado}`,
    tenantId: "comercio-1",
    email,
    rol: "empleado",
    permisos: [...PERMISOS_EMPLEADO_DEFAULT],
    estado,
    expiraAt,
  };
}

function sembrarTenant(id: string, dueno: string, email: string, plan = "base") {
  control.tenants.set(id, {
    id,
    nombreComercio: "Kiosco",
    slug: `kiosco-${id}`,
    estado: "activo",
    plan,
    moneda: "ARS",
    ownerGoogleSub: dueno,
    esDemo: false,
  });
  control.users.set(dueno, { googleSub: dueno, email, emailVerificado: true });
  control.memberships.set(`m-${id}-${dueno}`, {
    id: `m-${id}-${dueno}`,
    tenantId: id,
    googleSub: dueno,
    rol: "dueno",
    permisos: [],
    estado: "activo",
  });
}

function sumarEmpleado(id: string, sub: string, email: string) {
  control.users.set(sub, { googleSub: sub, email, emailVerificado: true });
  control.memberships.set(`m-${id}-${sub}`, {
    id: `m-${id}-${sub}`,
    tenantId: id,
    googleSub: sub,
    rol: "empleado",
    permisos: [...PERMISOS_EMPLEADO_DEFAULT],
    estado: "activo",
  });
}

function sesion(sub: string, tenantId: string | null, reauthAt?: string | null): string {
  const ahora = new Date();
  const creada = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(creada.registro.idHash, {
    idHash: creada.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: creada.registro.expiraAt,
    expiraAbsoluta: creada.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    ...(reauthAt === null ? {} : { reauthAt: reauthAt ?? ahora.toISOString() }),
  });
  return creada.idPlano;
}

function postDueno(plano: string, body: Record<string, unknown>) {
  return postInv(ctx("http://localhost/api/invitations", { headers: { cookie: `__Host-sesion=${plano}` }, body }));
}

function getDueno(plano: string, headers: Record<string, string> = {}) {
  return getInv(ctx("http://localhost/api/invitations", { method: "GET", headers: { cookie: `__Host-sesion=${plano}`, ...headers } }));
}

function tokenDe(link: string): string {
  const token = new URL(link).searchParams.get("invitation_token");
  if (!token) throw new Error("el enlace no trae invitation_token");
  return token;
}

async function aceptar(token: string, sub: string, email: string) {
  control.users.set(sub, { googleSub: sub, email, emailVerificado: true });
  const plano = sesion(sub, null);
  return postAccept(ctx("http://localhost/api/invitations/accept", { headers: { cookie: `__Host-sesion=${plano}` }, body: { token } }));
}

describe("invitarEmpleado", () => {
  const dueno: MiembroFoto = { email: "dueno@kiosco.test", rol: "dueno" };
  const ana: MiembroFoto = { email: "ana@kiosco.test", rol: "empleado" };

  it("el cupo lleno mira solo miembros activos", () => {
    const lleno = invitarEmpleado(pedido("nueva@kiosco.test"), foto([dueno, ana]));
    expect(lleno.tipo).toBe("cupo_lleno");
    if (lleno.tipo !== "cupo_lleno") return;
    expect(lleno).toMatchObject({ limite: 2, ocupados: 2 });

    const conPendiente = invitarEmpleado(
      pedido("nueva@kiosco.test"),
      foto([dueno], {
        miembrosActivos: 1,
        pendientes: [pendiente("otra@kiosco.test", "2026-11-20T00:00:00.000Z")],
      }),
    );
    expect(conPendiente.tipo).toBe("lista");
  });

  it("un segundo crear no rota el token y reenviar sí cancela el hash vigente", () => {
    const primero = invitarEmpleado(pedido("ana@kiosco.test"), foto([dueno]));
    expect(primero.tipo).toBe("lista");
    if (primero.tipo !== "lista") return;
    const repetido = invitarEmpleado(
      pedido("ANA@kiosco.test"),
      foto([dueno], { miembrosActivos: 1, pendientes: [primero.efecto.insertar] }),
    );
    expect(repetido).toMatchObject({ tipo: "ya_pendiente", expiraAt: primero.expiraAt });

    const reenvio = invitarEmpleado(
      pedido("ana@kiosco.test", "reenviar"),
      foto([dueno], { miembrosActivos: 1, pendientes: [primero.efecto.insertar] }),
    );
    expect(reenvio.tipo).toBe("lista");
    if (reenvio.tipo !== "lista") return;
    expect(reenvio.efecto.cancelarHashes).toEqual([primero.efecto.insertar.tokenHash]);
    expect(reenvio.efecto.insertar.tokenHash).not.toBe(primero.efecto.insertar.tokenHash);
    expect(hashToken(tokenDe(reenvio.efecto.link))).toBe(reenvio.efecto.insertar.tokenHash);
    expect(reenvio.efecto).not.toHaveProperty("tokenPlano");
  });
});

describe("POST y GET /api/invitations", () => {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.RESEND_API_KEY;
    resetStore();
  });

  afterAll(() => {
    if (controlUrl === undefined) delete process.env.CONTROL_DATABASE_URL;
    else process.env.CONTROL_DATABASE_URL = controlUrl;
    if (resendKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = resendKey;
    delete process.env.TENANT_MODE;
  });

  it("un empleado recibe 403 y el mapa no cambia", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    sumarEmpleado(TENANT, EMPLEADO, "empleado@kiosco.test");
    const plano = sesion(EMPLEADO, TENANT);
    const antes = control.invitations.size;
    const post = await postDueno(plano, { email: "ana@kiosco.test" });
    const get = await getDueno(plano);
    expect(post.status).toBe(403);
    expect(get.status).toBe(403);
    expect(control.invitations.size).toBe(antes);
  });

  it("sin reauth reciente el POST responde 401 y no escribe", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const plano = sesion(DUENO, TENANT, null);
    const post = await postDueno(plano, { email: "ana@kiosco.test" });
    const cuerpo = await post.json();
    expect(post.status).toBe(401);
    expect(cuerpo.codigo).toBe("reauth_requerida");
    expect(control.invitations.size).toBe(0);
    const listado = await getDueno(plano);
    expect(listado.status).toBe(200);
  });

  it("un email inválido responde 422 y no escribe", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const plano = sesion(DUENO, TENANT);
    for (const email of ["sin-arroba", "a b@c.com", "a@", ""]) {
      const res = await postDueno(plano, { email });
      expect(res.status, email).toBe(422);
    }
    expect(control.invitations.size).toBe(0);
  });

  it("con dos miembros activos el plan base responde cupo_lleno", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    sumarEmpleado(TENANT, EMPLEADO, "empleado@kiosco.test");
    const plano = sesion(DUENO, TENANT);
    const res = await postDueno(plano, { email: "ana@kiosco.test" });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ resultado: "cupo_lleno", limite: 2, ocupados: 2 });
    expect(control.invitations.size).toBe(0);
  });

  it("un pendiente no ocupa asiento", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const plano = sesion(DUENO, TENANT);
    const primera = await postDueno(plano, { email: "una@kiosco.test" });
    expect(primera.status).toBe(201);
    const segunda = await postDueno(plano, { email: "otra@kiosco.test" });
    expect(segunda.status).toBe(201);
    const vista = await (await getDueno(plano)).json();
    expect(vista.ocupados).toBe(1);
    expect(vista.limite).toBe(2);
  });

  it("el segundo crear avisa ya_pendiente y el primer enlace sigue aceptando", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const plano = sesion(DUENO, TENANT);
    const alta = await postDueno(plano, { email: "ana@kiosco.test" });
    const creada = await alta.json();
    const repetido = await postDueno(plano, { email: "ANA@kiosco.test" });
    const cuerpo = await repetido.json();
    expect(alta.status).toBe(201);
    expect(repetido.status).toBe(200);
    expect(cuerpo).toEqual({ resultado: "ya_pendiente", expira_at: creada.expira_at });
    expect(cuerpo.link).toBeUndefined();
    const vigentes = [...control.invitations.values()].filter((inv) => inv.estado === "pendiente");
    expect(vigentes).toHaveLength(1);
    const aceptada = await aceptar(tokenDe(creada.link), "ana-sub", "ana@kiosco.test");
    expect(aceptada.status).toBe(201);
  });

  it("reenviar invalida el token anterior y el hash nuevo acepta", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const plano = sesion(DUENO, TENANT);
    const alta = await (await postDueno(plano, { email: "ana@kiosco.test" })).json();
    const reenvio = await postDueno(plano, { email: "ana@kiosco.test", intencion: "reenviar" });
    const cuerpo = await reenvio.json();
    expect(reenvio.status).toBe(200);
    expect(cuerpo.resultado).toBe("reenviada");
    const viejo = await aceptar(tokenDe(alta.link), "ana-vieja", "ana@kiosco.test");
    expect(viejo.status).toBe(410);
    const nuevo = await aceptar(tokenDe(cuerpo.link), "ana-nueva", "ana@kiosco.test");
    expect(nuevo.status).toBe(201);
  });

  it("guarda el hash del enlace y no el texto plano", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const plano = sesion(DUENO, TENANT);
    const res = await postDueno(plano, { email: "ana@kiosco.test", rol: "dueno", permisos: ["ver_saldos_caja"] });
    const cuerpo = await res.json();
    const token = tokenDe(cuerpo.link);
    const hash = hashToken(token);
    const fila = control.invitations.get(hash);
    expect(res.status).toBe(201);
    expect(cuerpo.aviso).toBe("omitido");
    expect(cuerpo.token).toBeUndefined();
    expect(Object.keys(cuerpo)).not.toContain("token");
    expect(fila?.tokenHash).toBe(hash);
    expect(fila?.rol).toBe("empleado");
    expect(fila?.permisos).toEqual([...PERMISOS_EMPLEADO_DEFAULT]);
    expect(JSON.stringify(fila)).not.toContain(token);
    expect(JSON.stringify(cuerpo).includes(`"token"`)).toBe(false);
  });

  it("el listado de otro comercio no muestra este email", async () => {
    process.env.TENANT_MODE = "multi";
    try {
      sembrarTenant("comercio-a", DUENO, "dueno-a@kiosco.test");
      sembrarTenant("comercio-b", "dueno-b", "dueno-b@kiosco.test");
      const planoA = sesion(DUENO, "comercio-a");
      const alta = await postDueno(planoA, { email: "ana@kiosco.test" });
      expect(alta.status).toBe(201);
      const planoB = sesion("dueno-b", "comercio-b");
      const vista = await (await getDueno(planoB)).json();
      expect(JSON.stringify(vista)).not.toContain("ana@kiosco.test");
      expect(vista.ocupados).toBe(1);
    } finally {
      delete process.env.TENANT_MODE;
    }
  });

  it("un comercio vacío lista al dueño y ocupados igual a los miembros activos", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const vista = await (await getDueno(sesion(DUENO, TENANT))).json();
    expect(vista.ocupados).toBe(1);
    expect(vista.miembros).toEqual([{ email: "dueno@kiosco.test", rol: "dueno" }]);
    expect(vista.invitaciones).toEqual([]);
  });

  it("el accept usa la fila de control cuando el mapa no la tiene", async () => {
    sembrarTenant(TENANT, DUENO, "dueno@kiosco.test");
    const token = "plano-desde-control";
    const hash = hashToken(token);
    const fila = {
      tokenHash: hash,
      tenantId: TENANT,
      email: "ana@kiosco.test",
      rol: "empleado" as const,
      permisos: [...PERMISOS_EMPLEADO_DEFAULT],
      estado: "pendiente" as const,
      expiraAt: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const spy = vi.spyOn(controlDb, "leerInvitacionPorHash").mockImplementation(async (pedidoHash) => {
      if (pedidoHash !== hash) return null;
      control.invitations.set(hash, fila);
      return fila;
    });
    expect(control.invitations.has(hash)).toBe(false);
    const res = await aceptar(token, "ana-db", "ana@kiosco.test");
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalledWith(hash);
    spy.mockRestore();
  });
});
