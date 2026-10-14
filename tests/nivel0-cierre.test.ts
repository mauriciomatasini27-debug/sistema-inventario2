import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { ctx } from "./helpers/ctx.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { elegir_demos_a_purgar } from "../src/modules/tenants/purga-demos.js";
import { ejecutarPurgaDemos } from "../src/jobs/purga-demos.js";
import { POST as postVincularCode } from "../src/pages/api/whatsapp/vincular-code.js";
import { POST as postWebhook } from "../src/pages/api/whatsapp/webhook.js";
import { POST as postPurgar } from "../src/pages/api/jobs/purgar-demos.js";
import { POST as postAdjust } from "../src/pages/api/prices/adjustments.js";

const AHORA = new Date("2026-10-10T12:00:00.000Z");

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

function duenoDe(tenantId: string, sub: string) {
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
  control.memberships.set(`m-${sub}`, { id: `m-${sub}`, tenantId, googleSub: sub, rol: "dueno", permisos: [], estado: "activo" });
}

function reqJson(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return ctx(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });
}

function firma(secret: string, raw: string): string {
  return "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");
}

function webhookBody(wamid: string, from: string, texto: string): string {
  return JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: wamid, from, timestamp: "1729000000", text: { body: texto } }] } }] }] });
}

const AJUSTE = {
  direccion: "suba",
  porcentaje: 10,
  vigencia_tipo: "ahora",
  aplica_en: null,
  confirmado: true,
  creado_por: "dueno-1",
  items: [{ sku: "demo-sku-1", vigente_centavos: 15000 }],
};

beforeEach(() => {
  resetStore();
  process.env.WHATSAPP_APP_SECRET = "test-secret";
  process.env.JOBS_SECRET = "job-secret";
});

describe("nivel-0 cierre: vincular", () => {
  it("generar código exige sesión y membership; verifica por webhook", async () => {
    const anon = await postVincularCode(reqJson("http://x/api/whatsapp/vincular-code", { tenant_id: "t1", numero: "11 5555-1234" }));
    expect((anon as Response).status).toBe(403);

    duenoDe("t1", "dueno-1");
    const plano = sesion("dueno-1");
    const gen = (await postVincularCode(
      reqJson("http://x/api/whatsapp/vincular-code", { tenant_id: "t1", numero: "11 5555-1234" }, { cookie: `__Host-sesion=${plano}` }),
    )) as Response;
    expect(gen.status).toBe(201);
    const { codigo } = (await gen.json()) as { codigo: string };
    expect(codigo).toMatch(/^\d{6}$/);

    const raw = webhookBody("w-1", "5491155551234", `VINCULAR ${codigo}`);
    const ok = (await postWebhook(
      ctx("http://x/api/whatsapp/webhook", {
        method: "POST",
        headers: { "X-Hub-Signature-256": firma("test-secret", raw) },
        body: raw,
      }),
    )) as Response;
    expect((await ok.json()) as Record<string, unknown>).toMatchObject({ ok: true, accion: "vincular_ok" });
    expect(control.botLinks.get("+5491155551234")?.estado).toBe("verificado");

    // Reuso del mismo código falla (un solo uso).
    const raw2 = webhookBody("w-2", "5491155551234", `VINCULAR ${codigo}`);
    const reuse = (await postWebhook(
      ctx("http://x/api/whatsapp/webhook", {
        method: "POST",
        headers: { "X-Hub-Signature-256": firma("test-secret", raw2) },
        body: raw2,
      }),
    )) as Response;
    expect(((await reuse.json()) as Record<string, unknown>)["accion"]).toBe("vincular_error");
  });
});

describe("nivel-0 cierre: purga demos 14d", () => {
  it("elige solo demos vencidas con trial_hasta pasado", () => {
    const ids = elegir_demos_a_purgar(
      [
        { id: "d1", esDemo: true, estado: "activo", trialHasta: "2026-09-01T00:00:00.000Z" },
        { id: "d2", esDemo: true, estado: "activo", trialHasta: "2026-12-01T00:00:00.000Z" },
        { id: "d3", esDemo: false, estado: "activo", trialHasta: "2026-09-01T00:00:00.000Z" },
        { id: "d4", esDemo: true, estado: "baja", trialHasta: "2026-09-01T00:00:00.000Z" },
        { id: "d5", esDemo: true, estado: "activo", trialHasta: null },
      ],
      AHORA,
    );
    expect(ids).toEqual(["d1"]);
  });

  it("job da de baja + revoca + evento; ruta exige secret", async () => {
    control.tenants.set("demo-1", {
      id: "demo-1",
      nombreComercio: "Demo",
      slug: "demo",
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: "d",
      esDemo: true,
      trialHasta: "2026-09-01T00:00:00.000Z",
    });
    control.memberships.set("m-d", { id: "m-d", tenantId: "demo-1", googleSub: "d", rol: "dueno", permisos: [], estado: "activo" });
    control.botLinks.set("+5491100000000", { tenantId: "demo-1", googleSub: "d", estado: "verificado" });

    const sinSecret = (await postPurgar(reqJson("http://x/api/jobs/purgar-demos", {}))) as Response;
    expect(sinSecret.status).toBe(403);

    const r = ejecutarPurgaDemos(AHORA);
    expect(r.purgados).toEqual(["demo-1"]);
    expect(control.tenants.get("demo-1")?.estado).toBe("baja");
    expect(control.memberships.get("m-d")?.estado).toBe("revocado");
    expect(control.botLinks.get("+5491100000000")?.estado).toBe("revocado");
    expect(control.events.some((e) => e.tipo === "demo_purgada")).toBe(true);
    // Idempotente: segunda corrida no purga nada.
    expect(ejecutarPurgaDemos(AHORA).purgados).toEqual([]);
  });
});

describe("nivel-0 cierre: precios exige sesión y dueño", () => {
  it("anónimo 403; miembro no dueño con tenant 403; dueño 201", async () => {
    const anon = (await postAdjust(reqJson("http://x/api/prices/adjustments", AJUSTE, { "Idempotency-Key": "k1" }))) as Response;
    expect(anon.status).toBe(403);

    duenoDe("t1", "dueno-1");
    control.memberships.set("m-emp", { id: "m-emp", tenantId: "t1", googleSub: "emp-1", rol: "empleado", permisos: [], estado: "activo" });
    const emp = sesion("emp-1");
    const noDueno = (await postAdjust(
      reqJson("http://x/api/prices/adjustments", { ...AJUSTE, tenant_id: "t1" }, { "Idempotency-Key": "k2", cookie: `__Host-sesion=${emp}` }),
    )) as Response;
    expect(noDueno.status).toBe(403);

    const due = sesion("dueno-1");
    const ok = (await postAdjust(
      reqJson("http://x/api/prices/adjustments", { ...AJUSTE, tenant_id: "t1" }, { "Idempotency-Key": "k3", cookie: `__Host-sesion=${due}` }),
    )) as Response;
    expect(ok.status).toBe(201);
  });
});
