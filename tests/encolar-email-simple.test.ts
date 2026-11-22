import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emailOutbox } from "../src/db/schema-email.js";
import { getTenantDb } from "../src/lib/db.js";
import { ProveedorResend } from "../src/lib/email-resend.js";
import { crearAlmacenEmailOutbox } from "../src/lib/repos/_almacen.js";
import { existeEnvio } from "../src/lib/repos/email.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { encolar_email_simple } from "../src/jobs/whatsapp-adaptador.js";
import type { EmailEnvio, EmailProvider, EnvioResultado } from "../src/modules/email/proveedor.js";
import { ProveedorFake } from "../src/modules/email/proveedor.js";

// Issue #299: el encolar de los jobs WA dejó de simular un envío en el mapa
// del slice-0. Usa el EmailProvider inyectado (con Reply-To del comercio) y
// deja la fila durable en email_outbox, con el id del proveedor.

const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL"] as const;

class ProveedorQueCuenta implements EmailProvider {
  llamadas = 0;
  readonly enviados: EmailEnvio[] = [];

  async send(envio: EmailEnvio): Promise<EnvioResultado> {
    this.llamadas++;
    this.enviados.push(envio);
    return { ok: true, providerMessageId: `msg-${this.llamadas}` };
  }
}

describe("issue #299: encolar_email_simple con proveedor inyectado", () => {
  beforeEach(() => resetStore());
  afterEach(() => resetStore());

  it("manda por el proveedor con Reply-To del comercio y registra el resultado en el outbox", async () => {
    const proveedor = new ProveedorFake();
    const ok = await encolar_email_simple("cupo:t1:80", "duena@mail.com", "Aviso de cupo", "Usaste el 80% del cupo", {
      proveedor,
      replyToComercio: "kiosco@mail.com",
      nombreComercio: "Kiosco Sol",
    });

    expect(ok).toBe(true);
    expect(proveedor.enviados).toHaveLength(1);
    expect(proveedor.enviados[0]).toMatchObject({
      para: "duena@mail.com",
      asunto: "Aviso de cupo",
      texto: "Usaste el 80% del cupo",
      idempotencyKey: "cupo:t1:80",
      replyTo: "kiosco@mail.com",
    });
    expect(crearAlmacenEmailOutbox().obtener("cupo:t1:80")).toMatchObject({
      destinatario: "duena@mail.com",
      asunto: "Aviso de cupo",
      estado: "enviado",
      providerMessageId: "fake-1",
    });
  });

  it("la misma idempotencyKey no vuelve a llamar al proveedor", async () => {
    const proveedor = new ProveedorQueCuenta();
    const deps = { proveedor, replyToComercio: "kiosco@mail.com" };
    const a = await encolar_email_simple("alerta:t1:sku:2026-11-22", "duena@mail.com", "Stock bajo", "Quedan 2", deps);
    const b = await encolar_email_simple("alerta:t1:sku:2026-11-22", "duena@mail.com", "Stock bajo", "Quedan 2", deps);

    expect([a, b]).toEqual([true, true]);
    expect(proveedor.llamadas).toBe(1);
    expect(crearAlmacenEmailOutbox().mapaVivo().size).toBe(1);
  });

  it("si el proveedor falla, queda pendiente en el outbox para que lo reintente el job", async () => {
    const proveedor: EmailProvider = { send: async () => ({ ok: false, motivo: "429" }) };
    const ok = await encolar_email_simple("cupo:t1:100", "duena@mail.com", "Cupo agotado", "No quedan consultas", {
      proveedor,
      replyToComercio: "kiosco@mail.com",
    });

    expect(ok).toBe(false);
    expect(crearAlmacenEmailOutbox().obtener("cupo:t1:100")).toMatchObject({ estado: "pendiente", providerMessageId: null });
  });

  it("sin proveedor devuelve false y queda pendiente para que lo reintente P10-92", async () => {
    const ok = await encolar_email_simple("cupo:t1:sin-key", "duena@mail.com", "Aviso de cupo", "Usaste el 80%", {
      proveedor: null,
      replyToComercio: "kiosco@mail.com",
    });

    expect(ok).toBe(false);
    expect(crearAlmacenEmailOutbox().obtener("cupo:t1:sin-key")).toMatchObject({
      estado: "pendiente",
      providerMessageId: null,
    });
  });

  it("una fila pendiente no se dedupe: el segundo intento confirma con el proveedor", async () => {
    const key = "cupo:t1:reintento";
    const sinProveedor = await encolar_email_simple(key, "duena@mail.com", "Aviso", "Usaste el 80%", {
      proveedor: null,
      replyToComercio: "kiosco@mail.com",
    });
    expect(sinProveedor).toBe(false);
    expect(await existeEnvio(key)).toBe(false);

    const proveedor = new ProveedorQueCuenta();
    const reintentado = await encolar_email_simple(key, "duena@mail.com", "Aviso", "Usaste el 80%", {
      proveedor,
      replyToComercio: "kiosco@mail.com",
    });

    expect(reintentado).toBe(true);
    expect(proveedor.llamadas).toBe(1);
    expect(await existeEnvio(key)).toBe(true);
    expect(crearAlmacenEmailOutbox().obtener(key)).toMatchObject({ estado: "enviado", providerMessageId: "msg-1" });
    expect(crearAlmacenEmailOutbox().mapaVivo().size).toBe(1);
  });

  it("una fila ya enviada sí se dedupe aunque haya proveedor", async () => {
    const key = "cupo:t1:ya-enviado";
    const proveedor = new ProveedorQueCuenta();
    const deps = { proveedor, replyToComercio: "kiosco@mail.com" };
    expect(await encolar_email_simple(key, "duena@mail.com", "Aviso", "texto", deps)).toBe(true);
    expect(await encolar_email_simple(key, "duena@mail.com", "Aviso", "texto", deps)).toBe(true);
    expect(await existeEnvio(key)).toBe(true);
    expect(proveedor.llamadas).toBe(1);
  });

  it("multi sin base falla cerrado: no reporta éxito con memoria ajena", async () => {
    process.env.TENANT_MODE = "multi";
    delete process.env.TENANT_DATABASE_URL;
    const tenantId = `multi-sin-base-${randomUUID()}`;
    try {
      await expect(
        encolar_email_simple(`cupo:${tenantId}:x`, "duena@mail.com", "Aviso", "texto", {
          proveedor: new ProveedorFake(),
          replyToComercio: "kiosco@mail.com",
          tenantId,
        }),
      ).rejects.toThrow("base_no_disponible");
      expect(conTenant(tenantId, () => crearAlmacenEmailOutbox().mapaVivo().size)).toBe(0);
    } finally {
      delete process.env.TENANT_MODE;
      delete process.env.TENANT_DATABASE_URL;
    }
  });

  it("ProveedorResend reenvía reply_to al proveedor transaccional", async () => {
    const llamadas: RequestInit[] = [];
    const proveedor = new ProveedorResend("re_test", "ModoOps <a@b.com>", async (_url, init) => {
      llamadas.push(init);
      return new Response(JSON.stringify({ id: "msg_resend" }), { status: 200 });
    });
    const r = await proveedor.send({
      para: "duena@mail.com",
      asunto: "Aviso",
      html: "<p>h</p>",
      texto: "h",
      idempotencyKey: "k",
      categoria: "aviso",
      plantilla: "aviso_v1",
      replyTo: "kiosco@mail.com",
    });

    expect(r).toEqual({ ok: true, providerMessageId: "msg_resend" });
    expect(JSON.parse(String(llamadas[0]?.body))).toMatchObject({ reply_to: "kiosco@mail.com" });
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);
describe.skipIf(!hayPG)("issue #299: fila durable en email_outbox", () => {
  const tenantId = randomUUID();
  const snap: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) snap[k] = process.env[k];
    resetStore();
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
  });

  afterEach(async () => {
    await conTenant(tenantId, () => getTenantDb().delete(emailOutbox).where(eq(emailOutbox.tenantId, tenantId)));
    for (const k of ENV_KEYS) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStore();
  });

  it("guarda el envío del proveedor en la tabla email_outbox del tenant", async () => {
    const key = `cupo-pg-${randomUUID()}`;
    await conTenant(tenantId, async () => {
      const ok = await encolar_email_simple(key, "duena@mail.com", "Aviso de cupo", "Usaste el 80%", {
        proveedor: new ProveedorFake(),
        replyToComercio: "kiosco@mail.com",
        tenantId,
      });
      expect(ok).toBe(true);
    });

    const filas = await conTenant(tenantId, () =>
      getTenantDb().select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, key)),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ estado: "enviado", providerMessageId: "fake-1", destinatario: "duena@mail.com" });
  });

  it("una fila pendiente en DB se reintenta y pasa a enviado sin duplicar la fila", async () => {
    const key = `reintento-pg-${randomUUID()}`;
    await conTenant(tenantId, async () => {
      expect(await encolar_email_simple(key, "duena@mail.com", "Aviso", "texto", {
        proveedor: null,
        replyToComercio: "kiosco@mail.com",
        tenantId,
      })).toBe(false);
      expect(await existeEnvio(key, tenantId)).toBe(false);

      expect(await encolar_email_simple(key, "duena@mail.com", "Aviso", "texto", {
        proveedor: new ProveedorFake(),
        replyToComercio: "kiosco@mail.com",
        tenantId,
      })).toBe(true);
      expect(await existeEnvio(key, tenantId)).toBe(true);
    });

    const filas = await conTenant(tenantId, () =>
      getTenantDb().select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, key)),
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ estado: "enviado", providerMessageId: "fake-1" });
  });

  it("un espejo viejo en memoria no reenvía cuando la DB ya está enviada", async () => {
    const key = `espejo-viejo-${randomUUID()}`;
    await conTenant(tenantId, async () => {
      expect(await encolar_email_simple(key, "duena@mail.com", "Aviso", "texto", {
        proveedor: null,
        replyToComercio: "kiosco@mail.com",
        tenantId,
      })).toBe(false);

      // P10-92 confirma en DB; el espejo en memoria sigue en pendiente.
      await getTenantDb()
        .update(emailOutbox)
        .set({ estado: "enviado", providerMessageId: "msg-p10-92" })
        .where(eq(emailOutbox.idempotencyKey, key));

      const proveedor = new ProveedorQueCuenta();
      expect(await encolar_email_simple(key, "duena@mail.com", "Aviso", "texto", {
        proveedor,
        replyToComercio: "kiosco@mail.com",
        tenantId,
      })).toBe(true);
      expect(proveedor.llamadas).toBe(0);
    });
  });
});
