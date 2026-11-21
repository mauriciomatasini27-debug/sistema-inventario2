import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { adminStore, resetAdmin } from "../src/lib/admin-store.js";
import { tenantPorDefecto } from "../src/lib/tenant-mode.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { cerrarCuenta, type DepsCierre } from "../src/lib/cierre-cuenta.js";
import { cancelarPreaprobacionMercadoPago } from "../src/modules/planes/cancelar-mp.js";
import { decidir_cierre, decidir_reapertura, normalizar_nombre } from "../src/modules/tenants/cierre-cuenta.js";
import { POST as postCerrar } from "../src/pages/api/plan/cerrar-cuenta.js";
import { POST as postAdminTenants } from "../src/pages/api/admin/tenants.js";

const TENANT = tenantPorDefecto();
const DUENO = "cierre-dueno";
const EMPLEADA = "cierre-empleada";
const AHORA = new Date("2026-11-21T12:00:00.000Z");
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

function sembrar() {
  control.tenants.set(TENANT, {
    id: TENANT,
    nombreComercio: "Almacén Doña Rosa",
    slug: "almacen-rosa",
    estado: "activo",
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: DUENO,
    esDemo: false,
  });
  control.users.set(DUENO, { googleSub: DUENO, email: "rosa@ejemplo.com", emailVerificado: true });
  for (const [sub, rol] of [
    [DUENO, "dueno"],
    [EMPLEADA, "empleado"],
  ] as const) {
    control.memberships.set(`m-${sub}`, { id: `m-${sub}`, tenantId: TENANT, googleSub: sub, rol, permisos: [], estado: "activo" });
  }
}

function sesion(sub: string, tenantId: string | null = TENANT, reauthAt: string | undefined = new Date().toISOString()): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt,
  });
  return c.idPlano;
}

function cerrar(plano: string, nombre: string) {
  return postCerrar(
    ctx("http://x/api/plan/cerrar-cuenta", {
      method: "POST",
      body: { nombre_comercio: nombre },
      headers: { cookie: `__Host-sesion=${plano}` },
    }),
  ) as Promise<Response>;
}

beforeEach(() => {
  delete process.env.TENANT_MODE;
  delete process.env.TENANT_DATABASE_URL;
  delete process.env.CONTROL_DATABASE_URL;
  resetStore();
  resetAdmin();
  sembrar();
});

describe("P10-91 núcleo del cierre de cuenta", () => {
  it("solo el dueño, con el nombre del comercio (sin importar tildes ni mayúsculas)", () => {
    const base = { esDueno: true, estado: "activo", nombreComercio: "Almacén Doña Rosa" };
    expect(normalizar_nombre("  ALMACEN   doña rosa ")).toBe("almacen dona rosa");
    expect(decidir_cierre({ ...base, nombreEscrito: "almacen dona rosa" })).toEqual({ ok: true });
    expect(decidir_cierre({ ...base, esDueno: false, nombreEscrito: "Almacén Doña Rosa" })).toEqual({ ok: false, motivo: "no_dueno" });
    expect(decidir_cierre({ ...base, nombreEscrito: "Almacén" })).toEqual({ ok: false, motivo: "nombre_no_coincide" });
    expect(decidir_cierre({ ...base, nombreEscrito: "" })).toEqual({ ok: false, motivo: "nombre_no_coincide" });
    expect(decidir_cierre({ ...base, estado: "baja", nombreEscrito: "Almacén Doña Rosa" })).toEqual({ ok: false, motivo: "ya_cerrada" });
    expect(decidir_cierre({ ...base, estado: "suspendido", nombreEscrito: "Almacén Doña Rosa" })).toEqual({ ok: true });
  });

  it("soporte reabre dentro de los 90 días del último cierre y no después", () => {
    expect(decidir_reapertura({ estado: "baja", bajaEn: haceDias(89), ahora: AHORA }).ok).toBe(true);
    expect(decidir_reapertura({ estado: "baja", bajaEn: haceDias(90), ahora: AHORA })).toEqual({ ok: false, motivo: "vencida" });
    expect(decidir_reapertura({ estado: "activo", bajaEn: haceDias(1), ahora: AHORA })).toEqual({ ok: false, motivo: "no_cerrada" });
    expect(decidir_reapertura({ estado: "baja", bajaEn: null, ahora: AHORA })).toEqual({ ok: false, motivo: "sin_fecha" });
  });
});

describe("P10-91 cancelar la suscripción de Mercado Pago", () => {
  it("cancela con PUT status cancelled, sin tocar MP en ejemplos ni sin credenciales", async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const fetchOk = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    expect(await cancelarPreaprobacionMercadoPago({ preapprovalId: "sim-1", fetchImpl: fetchOk })).toMatchObject({ ok: true, modo: "simulado" });
    expect(await cancelarPreaprobacionMercadoPago({ preapprovalId: "pre-1", accessToken: "", fetchImpl: fetchOk })).toMatchObject({
      ok: false,
      motivo: "sin_credenciales",
    });
    expect(llamadas).toHaveLength(0);
    expect(await cancelarPreaprobacionMercadoPago({ preapprovalId: "pre-1", accessToken: "tok", fetchImpl: fetchOk })).toMatchObject({
      ok: true,
      modo: "mercadopago",
    });
    expect(llamadas[0]?.url).toBe("https://api.mercadopago.com/preapproval/pre-1");
    expect(llamadas[0]?.init.method).toBe("PUT");
    expect(JSON.parse(String(llamadas[0]?.init.body))).toEqual({ status: "cancelled" });
    const fetch500 = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await cancelarPreaprobacionMercadoPago({ preapprovalId: "pre-1", accessToken: "tok", fetchImpl: fetch500 })).toMatchObject({
      ok: false,
      motivo: "http",
    });
  });

  it("si MP falla la cuenta igual se cierra y la preaprobación queda pendiente", async () => {
    const deps: DepsCierre = {
      listarPreaprobaciones: async () => ["pre-bien", "pre-mal"],
      cancelarMp: async (id) =>
        id === "pre-bien" ? { ok: true, modo: "mercadopago", preapprovalId: id } : { ok: false, motivo: "red", preapprovalId: id },
    };
    const r = await cerrarCuenta({ tenantId: TENANT, googleSub: DUENO, ahora: AHORA, deps });
    expect(r).toMatchObject({ estadoAnterior: "activo", mpCanceladas: ["pre-bien"], mpPendientes: ["pre-mal"] });
    expect(control.tenants.get(TENANT)?.estado).toBe("baja");
  });
});

describe("P10-91 POST /api/plan/cerrar-cuenta", () => {
  it("una empleada no puede cerrar la cuenta", async () => {
    const res = await cerrar(sesion(EMPLEADA), "Almacén Doña Rosa");
    expect(res.status).toBe(403);
    expect(control.tenants.get(TENANT)?.estado).toBe("activo");
  });

  it("sin reauth reciente con Google pide confirmar", async () => {
    const res = await cerrar(sesion(DUENO, TENANT, new Date(Date.now() - 60 * 60 * 1000).toISOString()), "Almacén Doña Rosa");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ codigo: "reauth_requerida" });
    expect(control.tenants.get(TENANT)?.estado).toBe("activo");
  });

  it("con otro nombre no cierra", async () => {
    const res = await cerrar(sesion(DUENO), "Otro comercio");
    expect(res.status).toBe(422);
    expect(control.tenants.get(TENANT)?.estado).toBe("activo");
  });

  it("el dueño cierra: baja al instante, sesiones revocadas, evento de vida, registro y mail", async () => {
    const plano = sesion(DUENO);
    sesion(EMPLEADA);
    const res = await cerrar(plano, "almacen dona rosa");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mp_pendiente: false, email_encolado: true });
    expect(control.tenants.get(TENANT)?.estado).toBe("baja");
    const delTenant = [...control.sessions.values()].filter((s) => s.tenantId === TENANT);
    expect(delTenant.length).toBe(2);
    expect(delTenant.every((s) => s.revocadaAt && s.motivo === "cuenta_cerrada")).toBe(true);
    expect(adminStore.eventosVida.at(-1)).toMatchObject({ tenantId: TENANT, deEstado: "activo", aEstado: "baja", motivo: "cierre_por_dueno", actor: DUENO });
    expect(control.events.some((e) => e.tipo === "cuenta_cerrada" && e.tenantId === TENANT)).toBe(true);
    // P10-91: la sesión del dueño ya no sirve: otro intento no llega a cerrar nada.
    expect((await cerrar(plano, "Almacén Doña Rosa")).status).toBe(403);
  });
});

describe("P10-91 soporte reabre desde /admin", () => {
  function admin(body: Record<string, unknown>) {
    process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
    const plano = sesion("admin-1", null);
    return postAdminTenants(
      ctx("http://x/api/admin/tenants", { method: "POST", body, headers: { cookie: `__Host-sesion=${plano}` } }),
    ) as Promise<Response>;
  }

  function cerrado(hace: number) {
    const t = control.tenants.get(TENANT)!;
    t.estado = "baja";
    adminStore.eventosVida.push({
      id: "ev-1",
      tenantId: TENANT,
      deEstado: "activo",
      aEstado: "baja",
      motivo: "cierre_por_dueno",
      actor: DUENO,
      idempotencyKey: "ev-1",
      creadoEn: new Date(Date.now() - hace * 86_400_000).toISOString(),
    });
  }

  it("reabre dentro de los 90 días y deja el acto auditado", async () => {
    cerrado(30);
    const res = await admin({ tenant_id: TENANT, accion: "reabrir", confirmo_id: TENANT, motivo: "la dueña se arrepintió" });
    expect(res.status).toBe(200);
    expect(control.tenants.get(TENANT)?.estado).toBe("activo");
    expect(adminStore.actos.some((a) => a.actoKind === "tenant_reabierto" && a.tenantId === TENANT)).toBe(true);
    expect(adminStore.eventosVida.at(-1)).toMatchObject({ deEstado: "baja", aEstado: "activo" });
  });

  it("pasados los 90 días no reabre, y reactivar no saca una cuenta de baja", async () => {
    cerrado(91);
    const res = await admin({ tenant_id: TENANT, accion: "reabrir", confirmo_id: TENANT, motivo: "pidió volver" });
    expect(res.status).toBe(409);
    const re = await admin({ tenant_id: TENANT, accion: "reactivar", confirmo_id: TENANT, motivo: "pidió volver" });
    expect(re.status).toBe(409);
    expect(control.tenants.get(TENANT)?.estado).toBe("baja");
  });
});
