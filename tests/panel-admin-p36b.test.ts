import { describe, expect, it, beforeEach } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { resetAdmin, adminStore } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { esAdminAllowlist, leerAllowlist, exigeReauth, VENTANA_REAUTH_MIN } from "../src/modules/admin/guard.js";
import { exigirConfirmacion, exigirAdmin } from "../src/pages/api/admin/_guard.js";
import { registrar_acto, verificar_acto, hash_acto } from "../src/modules/admin/actos.js";
import { SENALES_PERMITIDAS, es_senal_permitida } from "../src/modules/admin/boundary.js";
import { consumir_senal } from "../src/modules/admin/senales.js";
import { asentar_cobro } from "../src/modules/admin/ledger.js";
import { evaluar_mora, aplicar_evento_vida, POLITICA_DEFECTO } from "../src/modules/admin/mora.js";
import { resolver_flag } from "../src/modules/admin/flags.js";
import { GET as GETActos } from "../src/pages/api/admin/actos.js";
import { GET as GETAudit } from "../src/pages/api/admin/audit.js";
import { GET as GETTenants } from "../src/pages/api/admin/tenants.js";
import { POST as POSTLedger } from "../src/pages/api/admin/ledger/asentar.js";
import { POST as POSTFlags } from "../src/pages/api/admin/flags/index.js";

function adminSesion(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, { idHash: c.registro.idHash, googleSub: sub, tenantId: null, expiraAt: c.registro.expiraAt, expiraAbsoluta: c.registro.expiraAbsoluta, lastSeenAt: ahora.toISOString(), reauthAt: ahora.toISOString() });
  return c.idPlano;
}

function req(url: string, plano: string, body?: unknown) {
  return ctx(url, {
    method: body ? "POST" : "GET",
    ...(body !== undefined ? { body: body as Record<string, unknown> } : {}),
    headers: { cookie: `__Host-sesion=${plano}` },
  });
}

beforeEach(() => { resetStore(); resetAdmin(); process.env.ADMIN_ALLOWLIST_SUBS = "admin-1"; });

describe("P3-6b PA1 acceso", () => {
  it("decide por google_sub y nunca por email", () => {
    expect(esAdminAllowlist("admin-1", ["admin-1"])).toBe(true);
    expect(esAdminAllowlist("admin@x.com", ["admin-1"])).toBe(false);
    expect(esAdminAllowlist("", ["admin-1"])).toBe(false);
    expect(leerAllowlist({ ADMIN_ALLOWLIST_SUBS: " a " } as NodeJS.ProcessEnv)).toEqual(["a"]);
  });
  it("reauth exige ventana de 5 minutos", () => {
    expect(VENTANA_REAUTH_MIN).toBe(5);
    const ahora = new Date("2026-10-16T12:06:00Z");
    expect(exigeReauth({ lastReauthEn: "2026-10-16T12:00:00Z", ahora }).ok).toBe(false);
    expect(exigeReauth({ lastReauthEn: "2026-10-16T12:04:00Z", ahora }).ok).toBe(true);
    expect(exigeReauth({ lastReauthEn: null, ahora }).ok).toBe(false);
  });
  it("tolera un salto hacia atrás del reloj del servidor", () => {
    const ahora = new Date("2026-10-16T12:00:00Z");
    // #448: NTP puede atrasar el reloj unos segundos justo después del
    // reauth; ese `reauthAt` "en el futuro" es fresco, no una sesión vieja.
    expect(exigeReauth({ lastReauthEn: "2026-10-16T12:00:03Z", ahora }).ok).toBe(true);
    // La tolerancia es acotada: un futuro de 90 s no se acepta.
    expect(exigeReauth({ lastReauthEn: "2026-10-16T12:01:30Z", ahora }).ok).toBe(false);
  });
  it("confirmación destructiva exige motivo e ID escrito", () => {
    expect(exigirConfirmacion({ motivo: "", confirmo_id: "t1" }, "t1")).toBeInstanceOf(Response);
    expect(exigirConfirmacion({ motivo: "mora", confirmo_id: "otro" }, "t1")).toBeInstanceOf(Response);
    const ok = exigirConfirmacion({ motivo: "mora impaga", confirmo_id: "t1" }, "t1");
    expect(ok).toMatchObject({ motivo: "mora impaga" });
  });
  it("fuera de allowlist recibe 403", () => {
    const plano = adminSesion("visitante");
    const r = exigirAdmin(ctx("http://x/", { headers: { cookie: `__Host-sesion=${plano}` } }).request);
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(403);
  });
});

describe("P3-6b PA2 auditoría", () => {
  it("encadena hashes y detecta alteración", () => {
    const a1 = registrar_acto({ acto: { kind: "mora_evaluada", tenantId: "t1", resultado: "1" }, actorGoogleSub: "admin-1", prevHash: null, origen: "panel" });
    const a2 = registrar_acto({ acto: { kind: "mora_evaluada", tenantId: "t1", resultado: "2" }, actorGoogleSub: "admin-1", prevHash: a1.hash, origen: "panel" });
    expect(a2.prevHash).toBe(a1.hash);
    expect(verificar_acto(a2)).toEqual({ ok: true });
    const roto = { ...a2, hash: "00" };
    expect(verificar_acto(roto).ok).toBe(false);
    expect(hash_acto({ acto: a1.acto, actorGoogleSub: "admin-1", prevHash: null, creadoEn: a1.creadoEn })).toBe(a1.hash);
  });
  it("denegado queda auditado en adminStore", async () => {
    const plano = adminSesion("visitante");
    const r = (await GETTenants(req("http://x/api/admin/tenants", plano))) as Response;
    expect(r.status).toBe(403);
    expect(adminStore.actos.length).toBeGreaterThan(0);
  });
});

describe("P3-6b PA3 solo gestión", () => {
  it("allowlist cerrada sin tipos de negocio", () => {
    for (const prohibido of ["venta", "ventas", "caja", "stock", "precio", "precios", "fiado", "ticket_detalle", "sales", "cash_movements", "products"]) {
      expect(es_senal_permitida(prohibido)).toBe(false);
    }
    for (const s of SENALES_PERMITIDAS) expect(es_senal_permitida(s)).toBe(true);
  });
});

describe("P3-6b PA4 señales", () => {
  it("consume permitida y audita descarte", () => {
    const ok = consumir_senal({ id: "s1", tipo: "tenant_aprovisionado", payload: { tenant_id: "t1" } }, null);
    expect(ok.consumida).toBe(true);
    if (ok.consumida) expect(ok.salud.tenantsActivos).toBe(1);
    const no = consumir_senal({ id: "s2", tipo: "venta_creada", payload: {} }, null);
    expect(no.consumida).toBe(false);
    expect(no.acto).toMatchObject({ kind: "senal_descartada" });
  });
});

describe("P3-6b PA6 ledger bigint", () => {
  it("monto cero o negativo es 422 y duplicado es 409", () => {
    const base = { tenantId: "t1", medio: "transferencia", referenciaExterna: "op-1", idempotencyKey: "k1" };
    expect(asentar_cobro({ input: { ...base, montoCentavos: 0n }, creadoPor: "admin-1", vistos: new Set() })).toMatchObject({ ok: false, status: 422 });
    const r1 = asentar_cobro({ input: { ...base, montoCentavos: 5390000n }, creadoPor: "admin-1", vistos: new Set() });
    expect(r1.ok).toBe(true);
    const r2 = asentar_cobro({ input: { ...base, montoCentavos: 5390000n }, creadoPor: "admin-1", vistos: new Set(["k1"]) });
    expect(r2).toMatchObject({ ok: false, status: 409 });
  });
  it("compensatorio apunta al original", () => {
    const r = asentar_cobro({ input: { tenantId: "t1", montoCentavos: 100n, medio: "efectivo", referenciaExterna: "op-2", idempotencyKey: "k2", asientoCompensatorioDe: "orig-1" }, creadoPor: "admin-1", vistos: new Set() });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.asiento.asientoCompensatorioDe).toBe("orig-1");
  });
  it("POST ledger duplica con 409", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", { id: "t1", nombreComercio: "K", slug: "k", estado: "activo", plan: "base", moneda: "ARS", ownerGoogleSub: "d1", esDemo: false });
    const body = { tenant_id: "t1", monto_centavos: "5390000", medio: "transferencia", referencia_externa: "op-9", idempotency_key: "dup-1" };
    const r1 = (await POSTLedger(req("http://x/api/admin/ledger/asentar", plano, body))) as Response;
    expect(r1.status).toBe(201);
    const r2 = (await POSTLedger(req("http://x/api/admin/ledger/asentar", plano, body))) as Response;
    expect(r2.status).toBe(409);
  });
});

describe("P3-6b PA7 mora 14/15/45", () => {
  it("bordes al_dia, gracia, suspender, baja", () => {
    const p = POLITICA_DEFECTO;
    expect(p.diasGracia).toBe(14);
    expect(p.diasASuspension).toBe(15);
    expect(evaluar_mora({ tenantId: "t", diasAtraso: 0, saldoDeudorCentavos: 100n, ultimaEvaluacionEn: null }, p, false).decision).toBe("al_dia");
    expect(evaluar_mora({ tenantId: "t", diasAtraso: 3, saldoDeudorCentavos: 100n, ultimaEvaluacionEn: null }, p, false).decision).toBe("en_gracia");
    expect(evaluar_mora({ tenantId: "t", diasAtraso: 15, saldoDeudorCentavos: 100n, ultimaEvaluacionEn: null }, p, false)).toMatchObject({ decision: "suspender", debeEmitirEvento: true });
    expect(evaluar_mora({ tenantId: "t", diasAtraso: 15, saldoDeudorCentavos: 100n, ultimaEvaluacionEn: null }, p, true).decision).toBe("mantener_suspension");
    expect(evaluar_mora({ tenantId: "t", diasAtraso: 45, saldoDeudorCentavos: 100n, ultimaEvaluacionEn: null }, p, false).decision).toBe("baja");
  });
  it("destino inválido lanza", () => {
    expect(() => aplicar_evento_vida("activo", "inexistente")).toThrow();
    expect(aplicar_evento_vida("activo", "activo")).toBe("activo");
  });
});

describe("P3-6b PA12 flags", () => {
  it("override vence y vuelve al plan", () => {
    expect(resolver_flag({ defaultPlan: false, override: null })).toMatchObject({ valor: false, fuente: "plan" });
    expect(resolver_flag({ defaultPlan: false, override: { valor: true, motivo: "beta", expiraEn: null } })).toMatchObject({ valor: true, fuente: "override" });
    expect(resolver_flag({ defaultPlan: false, override: { valor: true, motivo: "beta", expiraEn: "2000-01-01T00:00:00.000Z" }, ahora: new Date("2026-10-16T00:00:00Z") })).toMatchObject({ valor: false, fuente: "plan", expirado: true });
  });
  it("POST flags exige motivo", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", { id: "t1", nombreComercio: "K", slug: "k", estado: "activo", plan: "base", moneda: "ARS", ownerGoogleSub: "d1", esDemo: false });
    const r = (await POSTFlags(req("http://x/api/admin/flags", plano, { tenant_id: "t1", flag: "pagos", valor: true, motivo: "" }))) as Response;
    expect(r.status).toBe(422);
  });
});

describe("P3-6b OP-S1 alias audit", () => {
  it("GET /api/admin/audit responde igual que /api/admin/actos", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", { id: "t1", nombreComercio: "K", slug: "k", estado: "activo", plan: "base", moneda: "ARS", ownerGoogleSub: "d1", esDemo: false });
    const a1 = (await GETActos(req("http://x/api/admin/actos?tenant_id=t1&desde=2000-01-01&hasta=2100-01-01", plano))) as Response;
    const a2 = (await GETAudit(req("http://x/api/admin/audit?tenant=t1&desde=2000-01-01&hasta=2100-01-01", plano))) as Response;
    expect(a1.status).toBe(200);
    expect(a2.status).toBe(200);
    const j1 = (await a1.json()) as { actos: unknown[] };
    const j2 = (await a2.json()) as { actos: unknown[] };
    expect(j2.actos).toEqual(j1.actos);
  });
});
