import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { adminStore, resetAdmin } from "../src/lib/admin-store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { POST as evaluarMora } from "../src/pages/api/admin/mora/evaluar.js";
import { POST as suspenderMora } from "../src/pages/api/admin/mora/suspender.js";
import { POST as regularizarMora } from "../src/pages/api/admin/mora/regularizar.js";

function adminSesion(sub: string): string {
  const ahora = new Date();
  const c = crearSesion({ googleSub: sub, tenantId: null, ahora });
  control.sessions.set(c.registro.idHash, {
    idHash: c.registro.idHash,
    googleSub: sub,
    tenantId: null,
    expiraAt: c.registro.expiraAt,
    expiraAbsoluta: c.registro.expiraAbsoluta,
    lastSeenAt: ahora.toISOString(),
    reauthAt: ahora.toISOString(),
  });
  return c.idPlano;
}

function req(url: string, plano: string, body: unknown) {
  return ctx(url, {
    method: "POST",
    body: body as Record<string, unknown>,
    headers: { cookie: `__Host-sesion=${plano}` },
  });
}

function tenant(id: string, estado: string) {
  return {
    id,
    nombreComercio: "Kiosco " + id,
    slug: id,
    estado,
    plan: "base",
    moneda: "ARS",
    ownerGoogleSub: "d-" + id,
    esDemo: false,
  };
}

function cobro(idempotencyKey: string, tenantId = "t1") {
  return {
    tenant_id: tenantId,
    motivo: "pagó",
    confirmo_id: tenantId,
    cobro: {
      monto_centavos: "5000",
      medio: "transferencia",
      referencia_externa: "op-1",
      idempotency_key: idempotencyKey,
    },
  };
}

beforeEach(() => {
  resetStore();
  resetAdmin();
  delete process.env.CONTROL_DATABASE_URL;
  process.env.ADMIN_ALLOWLIST_SUBS = "admin-1";
});

describe("rutas de mora cableadas", () => {
  it("suspender deja el estado en la fila y no duplica el evento el mismo día", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", tenant("t1", "activo"));
    const body = { tenant_id: "t1", motivo: "sin pago", confirmo_id: "t1" };

    const primera = (await suspenderMora(req("http://x/api/admin/mora/suspender", plano, body))) as Response;
    expect(primera.status).toBe(200);
    expect(control.tenants.get("t1")?.estado).toBe("suspendido");
    expect(adminStore.eventosVida).toHaveLength(1);

    const reintento = (await suspenderMora(req("http://x/api/admin/mora/suspender", plano, body))) as Response;
    expect(reintento.status).toBe(200);
    expect(await reintento.json()).toMatchObject({ estado: "suspendido", ya: true });
    expect(adminStore.eventosVida).toHaveLength(1);
  });

  it("regularizar asienta una sola vez y el reintento vuelve a dejar el tenant activo", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", tenant("t1", "suspendido"));

    const primera = (await regularizarMora(
      req("http://x/api/admin/mora/regularizar", plano, cobro("k1")),
    )) as Response;
    expect(primera.status).toBe(200);
    expect(control.tenants.get("t1")?.estado).toBe("activo");
    expect(adminStore.asientos.size).toBe(1);
    expect(adminStore.eventosVida).toHaveLength(1);

    const reintento = (await regularizarMora(
      req("http://x/api/admin/mora/regularizar", plano, cobro("k1")),
    )) as Response;
    expect(reintento.status).toBe(200);
    expect(await reintento.json()).toMatchObject({ estado: "activo", ya: true });
    expect(adminStore.asientos.size).toBe(1);
    expect(adminStore.eventosVida).toHaveLength(1);
  });

  it("la misma idempotency-key no se asienta en otro tenant", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", tenant("t1", "suspendido"));
    control.tenants.set("t2", tenant("t2", "suspendido"));

    await regularizarMora(req("http://x/api/admin/mora/regularizar", plano, cobro("k1")));
    const otro = (await regularizarMora(
      req("http://x/api/admin/mora/regularizar", plano, cobro("k1", "t2")),
    )) as Response;

    expect(otro.status).toBe(409);
    expect(control.tenants.get("t2")?.estado).toBe("suspendido");
    expect(adminStore.asientos.size).toBe(1);
  });

  it("el dry-run devuelve la decisión sin mutar estado ni emitir eventos", async () => {
    const plano = adminSesion("admin-1");
    control.tenants.set("t1", tenant("t1", "activo"));
    const evaluar = async (dias: number, saldo: string) =>
      (await evaluarMora(
        req("http://x/api/admin/mora/evaluar", plano, {
          tenant_id: "t1",
          dias_atraso: dias,
          saldo_deudor_centavos: saldo,
        }),
      )) as Response;

    const dia14 = await evaluar(14, "1000");
    const dia15 = await evaluar(15, "1000");
    const dia45 = await evaluar(45, "1000");
    const sinSaldo = await evaluar(30, "0");

    expect(await dia14.json()).toMatchObject({ decisiones: [{ decision: "en_gracia" }] });
    expect(await dia15.json()).toMatchObject({ decisiones: [{ decision: "suspender" }] });
    expect(await dia45.json()).toMatchObject({ decisiones: [{ decision: "baja" }] });
    expect(await sinSaldo.json()).toMatchObject({ decisiones: [{ decision: "al_dia" }] });
    expect(control.tenants.get("t1")?.estado).toBe("activo");
    expect(adminStore.eventosVida).toHaveLength(0);
  });

  it("sin allowlist no evalúa ni muta", async () => {
    const plano = adminSesion("nadie");
    control.tenants.set("t1", tenant("t1", "activo"));
    const r = (await suspenderMora(
      req("http://x/api/admin/mora/suspender", plano, {
        tenant_id: "t1",
        motivo: "x",
        confirmo_id: "t1",
      }),
    )) as Response;

    expect(r.status).toBe(403);
    expect(control.tenants.get("t1")?.estado).toBe("activo");
    expect(adminStore.eventosVida).toHaveLength(0);
  });
});
