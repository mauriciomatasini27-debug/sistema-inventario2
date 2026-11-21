import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryStatus, emailOutbox, emailSuppressions } from "../src/db/schema-email.js";
import { getTenantDb } from "../src/lib/db.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { ejecutarEnvioEmails } from "../src/jobs/enviar-emails.js";
import { ProveedorResend } from "../src/lib/email-resend.js";
import { hash_email } from "../src/modules/email/entregabilidad.js";
import { ctx } from "./helpers/ctx.js";
import { POST } from "../src/pages/api/jobs/enviar-emails.js";
import type { EmailEnvio, EmailProvider, EnvioResultado } from "../src/modules/email/proveedor.js";

// P10-92: job que manda email_outbox con un proveedor falso sobre Postgres.

const hayPG = Boolean(process.env.PG_TEST_URL_A);
const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;

class ProveedorGuion implements EmailProvider {
  readonly enviados: EmailEnvio[] = [];
  constructor(private readonly guion: Array<EnvioResultado> = []) {}
  async send(envio: EmailEnvio): Promise<EnvioResultado> {
    this.enviados.push(envio);
    return this.guion.shift() ?? { ok: true, providerMessageId: `fake-${this.enviados.length}` };
  }
}

describe("P10-92 ProveedorResend", () => {
  it("manda Idempotency-Key, html y texto; mapea HTTP y timeout a motivo", async () => {
    const llamadas: Array<{ url: string; init: RequestInit }> = [];
    const ok = new ProveedorResend("re_x", "Inventario <a@b.com>", async (url, init) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    });
    const envio = { para: "x@y.com", asunto: "A", html: "<p>h</p>", texto: "t", idempotencyKey: "k1", categoria: "c", plantilla: "p" };
    expect(await ok.send(envio)).toEqual({ ok: true, providerMessageId: "msg_1" });
    const h = llamadas[0]!.init.headers as Record<string, string>;
    expect(h["Idempotency-Key"]).toBe("k1");
    expect(JSON.parse(String(llamadas[0]!.init.body))).toMatchObject({ to: ["x@y.com"], html: "<p>h</p>", text: "t" });
    const r429 = new ProveedorResend("re_x", "a@b.com", async () => new Response("{}", { status: 429 }));
    expect(await r429.send(envio)).toEqual({ ok: false, motivo: "429" });
    const caido = new ProveedorResend("re_x", "a@b.com", async () => {
      throw new Error("red");
    });
    expect(await caido.send(envio)).toEqual({ ok: false, motivo: "timeout" });
  });
});

describe("P10-92 ruta /api/jobs/enviar-emails", () => {
  const llamar = (headers: Record<string, string>) =>
    POST(ctx("/api/jobs/enviar-emails", { method: "POST", headers })) as Promise<Response>;

  it("sin X-Job-Secret 403; sin RESEND_API_KEY/EMAIL_FROM no toca la cola", async () => {
    const prev = { s: process.env.JOBS_SECRET, k: process.env.RESEND_API_KEY, f: process.env.EMAIL_FROM, m: process.env.TENANT_MODE };
    process.env.JOBS_SECRET = "secreto-test";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    delete process.env.TENANT_MODE;
    try {
      expect((await llamar({})).status).toBe(403);
      expect((await llamar({ "X-Job-Secret": "otro" })).status).toBe(403);
      const r = await llamar({ "X-Job-Secret": "secreto-test" });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ omitido: "sin_proveedor" });
    } finally {
      for (const [k, v] of [["JOBS_SECRET", prev.s], ["RESEND_API_KEY", prev.k], ["EMAIL_FROM", prev.f], ["TENANT_MODE", prev.m]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe.skipIf(!hayPG)("P10-92 job enviar-emails en Postgres", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const ids: string[] = [];
  const hashes: string[] = [];
  const snap: Partial<Record<string, string | undefined>> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) snap[k] = process.env[k];
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    delete process.env.CONTROL_DATABASE_URL;
    resetStore();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  afterAll(async () => {
    if (!hayPG) return;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    for (const t of [tenantA, tenantB]) {
      await conTenant(t, async () => {
        const db = getTenantDb();
        if (ids.length) {
          await db.delete(deliveryStatus).where(inArray(deliveryStatus.outboxId, ids));
          await db.delete(emailOutbox).where(inArray(emailOutbox.id, ids));
        }
        if (hashes.length) await db.delete(emailSuppressions).where(inArray(emailSuppressions.emailHash, hashes));
      });
    }
    resetStore();
  });

  async function encolar(tenantId: string, para: string): Promise<string> {
    const id = randomUUID();
    ids.push(id);
    await conTenant(tenantId, () =>
      getTenantDb()
        .insert(emailOutbox)
        .values({
          id,
          tenantId,
          destinatario: para,
          asunto: "Asunto privado",
          html: "<p>hola</p>",
          texto: "hola",
          idempotencyKey: `k-${id}`,
        }),
    );
    return id;
  }

  async function fila(tenantId: string, id: string) {
    const [f] = await conTenant(tenantId, () => getTenantDb().select().from(emailOutbox).where(eq(emailOutbox.id, id)));
    return f!;
  }

  async function correr(tenantId: string, prov: EmailProvider, ahora: Date) {
    return conTenant(tenantId, () => ejecutarEnvioEmails(getTenantDb(), prov, ahora, 500));
  }

  it("manda solo lo del comercio, marca enviado y no repite", async () => {
    const a = await encolar(tenantA, `a-${randomUUID()}@ejemplo.com`);
    const b = await encolar(tenantB, `b-${randomUUID()}@ejemplo.com`);
    const log = vi.spyOn(console, "log");
    const err = vi.spyOn(console, "error");
    const prov = new ProveedorGuion();
    const r = await correr(tenantA, prov, new Date());
    expect(r.enviados).toBeGreaterThanOrEqual(1);
    expect(prov.enviados.map((e) => e.idempotencyKey)).toContain(`${tenantA}:k-${a}`);
    expect(prov.enviados.some((e) => e.idempotencyKey.startsWith(tenantB))).toBe(false);
    const fa = await fila(tenantA, a);
    expect(fa).toMatchObject({ estado: "enviado", intentos: 1 });
    expect(fa.providerMessageId).toMatch(/^fake-/);
    expect(await fila(tenantB, b)).toMatchObject({ estado: "pendiente", intentos: 0 });
    // P10-92: idempotente, otra corrida no vuelve a mandar lo enviado.
    const prov2 = new ProveedorGuion();
    await correr(tenantA, prov2, new Date());
    expect(prov2.enviados.some((e) => e.idempotencyKey === `${tenantA}:k-${a}`)).toBe(false);
    // P10-92: sin PII en logs.
    const todo = JSON.stringify([...log.mock.calls, ...err.mock.calls]);
    expect(todo).not.toContain("@ejemplo.com");
    expect(todo).not.toContain("Asunto privado");
  });

  it("transitorio reintenta con backoff y permanente queda fallido", async () => {
    const t = randomUUID();
    const r1 = await encolar(t, `r-${randomUUID()}@ejemplo.com`);
    const ahora = new Date();
    const r = await correr(t, new ProveedorGuion([{ ok: false, motivo: "503" }]), ahora);
    expect(r.reintentar).toBe(1);
    expect(await fila(t, r1)).toMatchObject({ estado: "reintentar", intentos: 1 });
    // P10-92: antes del primer paso (~1 min) espera.
    const espera = await correr(t, new ProveedorGuion(), new Date(ahora.getTime() + 10_000));
    expect(espera.esperando).toBe(1);
    expect(await fila(t, r1)).toMatchObject({ estado: "reintentar", intentos: 1 });
    // P10-92: después del paso sale.
    const sale = await correr(t, new ProveedorGuion(), new Date(ahora.getTime() + 2 * 60_000));
    expect(sale.enviados).toBe(1);
    expect(await fila(t, r1)).toMatchObject({ estado: "enviado", intentos: 2 });

    const p1 = await encolar(t, `p-${randomUUID()}@ejemplo.com`);
    const rp = await correr(t, new ProveedorGuion([{ ok: false, motivo: "422" }]), new Date());
    expect(rp.fallidos).toBe(1);
    expect(await fila(t, p1)).toMatchObject({ estado: "fallido", intentos: 1 });
    const eventos = await conTenant(t, () =>
      getTenantDb().select({ e: deliveryStatus.evento }).from(deliveryStatus).where(eq(deliveryStatus.outboxId, p1)),
    );
    expect(eventos.map((e) => e.e).sort()).toEqual(["fallo_422", "intento"]);
  });

  it("se agotan los pasos y queda fallido; el suprimido no sale", async () => {
    const t = randomUUID();
    const id = await encolar(t, `x-${randomUUID()}@ejemplo.com`);
    let ahora = Date.now();
    for (let i = 0; i < 6; i++) {
      await correr(t, new ProveedorGuion([{ ok: false, motivo: "timeout" }]), new Date(ahora));
      ahora += 8 * 3600_000;
    }
    expect(await fila(t, id)).toMatchObject({ estado: "fallido", intentos: 6 });

    const para = `s-${randomUUID()}@ejemplo.com`;
    const h = hash_email(para);
    hashes.push(h);
    await conTenant(t, () => getTenantDb().insert(emailSuppressions).values({ emailHash: h, motivo: "duro" }));
    const s = await encolar(t, para);
    const prov = new ProveedorGuion();
    const r = await correr(t, prov, new Date());
    expect(r.suprimidos).toBe(1);
    expect(prov.enviados).toHaveLength(0);
    expect(await fila(t, s)).toMatchObject({ estado: "suprimido" });
  });

  it("dos corridas a la vez mandan cada mail una sola vez", async () => {
    const t = randomUUID();
    const id = await encolar(t, `c-${randomUUID()}@ejemplo.com`);
    const p1 = new ProveedorGuion();
    const p2 = new ProveedorGuion();
    await Promise.all([correr(t, p1, new Date()), correr(t, p2, new Date())]);
    const veces = [...p1.enviados, ...p2.enviados].filter((e) => e.idempotencyKey === `${t}:k-${id}`).length;
    expect(veces).toBe(1);
    const f = await fila(t, id);
    expect(f.estado).toBe("enviado");
    expect(f.intentos).toBe(1);
  });
});
