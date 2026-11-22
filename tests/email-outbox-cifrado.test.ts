import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryStatus, emailOutbox } from "../src/db/schema-email.js";
import { getTenantDb } from "../src/lib/db.js";
import { encolarEnvio } from "../src/lib/repos/email.js";
import { resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant-mode.js";
import { ejecutarEnvioEmails } from "../src/jobs/enviar-emails.js";
import {
  cifrarCampoOutbox,
  descifrarCampoOutbox,
  esCifradoOutbox,
} from "../src/modules/email/outbox-cifrado.js";
import type { EmailEnvio, EmailProvider, EnvioResultado } from "../src/modules/email/proveedor.js";

// #295 / P10-33: el html/texto del outbox se guarda cifrado. Clave de test
// fija (32 bytes): en producción la ausencia de clave falla cerrado.
const CLAVE_TEST_B64 = Buffer.from("0123456789abcdef0123456789abcdef", "utf8").toString("base64");
const CLAVE_KEY = "EMAIL_OUTBOX_CIPHER_KEY_B64";

class ProveedorGuion implements EmailProvider {
  readonly enviados: EmailEnvio[] = [];
  async send(envio: EmailEnvio): Promise<EnvioResultado> {
    this.enviados.push(envio);
    return { ok: true, providerMessageId: `fake-${this.enviados.length}` };
  }
}

function conClave<T>(fn: () => T): T {
  const prev = process.env[CLAVE_KEY];
  process.env[CLAVE_KEY] = CLAVE_TEST_B64;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[CLAVE_KEY];
    else process.env[CLAVE_KEY] = prev;
  }
}

function sinClave<T>(fn: () => T): T {
  const prev = process.env[CLAVE_KEY];
  delete process.env[CLAVE_KEY];
  try {
    return fn();
  } finally {
    if (prev !== undefined) process.env[CLAVE_KEY] = prev;
  }
}

describe("#295 cifrado del cuerpo del outbox (unitario)", () => {
  it("ida y vuelta AES-GCM: el plano no aparece en el ciphertext y el IV es fresco", () => {
    conClave(() => {
      const tenant = "11111111-1111-4111-8111-111111111111";
      const plano = "<p>hola, experiencia de pago</p>";
      const a = cifrarCampoOutbox(plano, tenant, "html");
      const b = cifrarCampoOutbox(plano, tenant, "html");
      expect(a).not.toContain(plano);
      expect(a).not.toContain("hola");
      expect(esCifradoOutbox(a)).toBe(true);
      expect(a).not.toBe(b);
      expect(descifrarCampoOutbox(a, tenant, "html")).toBe(plano);
      expect(descifrarCampoOutbox(b, tenant, "html")).toBe(plano);
    });
  });

  it("lectura dual: el plaintext legacy se devuelve tal cual sin necesitar clave", () => {
    sinClave(() => {
      const tenant = "11111111-1111-4111-8111-111111111111";
      const legacy = "<p>viejo</p> ñandú";
      expect(esCifradoOutbox(legacy)).toBe(false);
      expect(descifrarCampoOutbox(legacy, tenant, "html")).toBe(legacy);
    });
  });

  it("falla cerrado sin clave y con ciphertext alterado", () => {
    const tenant = "11111111-1111-4111-8111-111111111111";
    const c = conClave(() => cifrarCampoOutbox("<p>secreto</p>", tenant, "html"));
    sinClave(() => {
      expect(() => cifrarCampoOutbox("<p>secreto</p>", tenant, "html")).toThrow(/EMAIL_OUTBOX_CIPHER_KEY_B64/);
      expect(() => descifrarCampoOutbox(c, tenant, "html")).toThrow(/EMAIL_OUTBOX_CIPHER_KEY_B64/);
    });
    conClave(() => {
      const partes = c.split(":");
      expect(partes).toHaveLength(5);
      const cuerpo = Buffer.from(partes[4]!, "base64");
      cuerpo[0] = cuerpo[0]! ^ 0x01;
      partes[4] = cuerpo.toString("base64");
      expect(() => descifrarCampoOutbox(partes.join(":"), tenant, "html")).toThrow();
    });
  });

  it("el AAD liga el ciphertext al tenant y al campo", () => {
    conClave(() => {
      const t1 = "11111111-1111-4111-8111-111111111111";
      const t2 = "22222222-2222-4222-8222-222222222222";
      const c = cifrarCampoOutbox("texto", t1, "html");
      expect(() => descifrarCampoOutbox(c, t2, "html")).toThrow();
      expect(() => descifrarCampoOutbox(c, t1, "texto")).toThrow();
    });
  });
});

const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe.skipIf(!hayPG)("#295 outbox cifrado en Postgres", () => {
  const ids: string[] = [];
  const ENV_KEYS = ["TENANT_MODE", "TENANT_DATABASE_URL", "CONTROL_DATABASE_URL"] as const;
  const snap: Partial<Record<(typeof ENV_KEYS)[number] | typeof CLAVE_KEY, string | undefined>> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) snap[k] = process.env[k];
    snap[CLAVE_KEY] = process.env[CLAVE_KEY];
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    process.env[CLAVE_KEY] = CLAVE_TEST_B64;
    delete process.env.CONTROL_DATABASE_URL;
    resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) {
      const v = snap[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const clave = snap[CLAVE_KEY];
    if (clave === undefined) delete process.env[CLAVE_KEY];
    else process.env[CLAVE_KEY] = clave;
  });

  afterAll(async () => {
    if (!hayPG) return;
    process.env.TENANT_MODE = "shared";
    process.env.TENANT_DATABASE_URL = process.env.PG_TEST_URL_A;
    const tenant = process.env.PG_TEST_TENANT ?? "11111111-1111-4111-8111-111111111111";
    if (ids.length) {
      await conTenant(tenant, () =>
        getTenantDb()
          .delete(deliveryStatus)
          .where(inArray(deliveryStatus.outboxId, ids)),
      );
      await conTenant(tenant, () => getTenantDb().delete(emailOutbox).where(inArray(emailOutbox.id, ids)));
    }
    resetStore();
  });

  const tenant = "11111111-1111-4111-8111-111111111111";

  async function fila(id: string) {
    const [f] = await conTenant(tenant, () => getTenantDb().select().from(emailOutbox).where(eq(emailOutbox.id, id)));
    return f!;
  }

  it("el adaptador guarda ciphertext y el job envía el plano descifrado", async () => {
    const key = `cifrado-${randomUUID()}`;
    const r = await conTenant(tenant, () =>
      encolarEnvio({ key, stream: "avisos", to: "cifrado@ejemplo.com", plantilla: "cierre", vars: { total: "$ 800,00" } }),
    );
    expect(r.ok).toBe(true);
    const [guardada] = await conTenant(tenant, () =>
      getTenantDb().select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, key)),
    );
    expect(guardada).toBeTruthy();
    ids.push(guardada!.id);
    expect(esCifradoOutbox(guardada!.htmlCiphertext)).toBe(true);
    expect(esCifradoOutbox(guardada!.textoCiphertext)).toBe(true);
    expect(guardada!.htmlCiphertext).not.toContain("cierre");
    expect(guardada!.textoCiphertext).not.toContain("800,00");

    const prov = new ProveedorGuion();
    const res = await conTenant(tenant, () => ejecutarEnvioEmails(getTenantDb(), prov, new Date(), 500));
    expect(res.enviados).toBeGreaterThanOrEqual(1);
    const enviado = prov.enviados.find((e) => e.idempotencyKey === `${tenant}:${key}`);
    expect(enviado?.html).toBe("<p>cierre</p>");
    expect(enviado?.texto).toContain("800,00");
  });

  it("una fila legacy en claro se sigue enviando igual (lectura dual)", async () => {
    const id = randomUUID();
    ids.push(id);
    await conTenant(tenant, () =>
      getTenantDb().insert(emailOutbox).values({
        id,
        tenantId: tenant,
        destinatario: `legacy-${randomUUID()}@ejemplo.com`,
        asunto: "Asunto legacy",
        htmlCiphertext: "<p>legacy en claro</p>",
        textoCiphertext: "legacy en claro",
        idempotencyKey: `legacy-${id}`,
        estado: "pendiente",
      }),
    );
    const prov = new ProveedorGuion();
    await conTenant(tenant, () => ejecutarEnvioEmails(getTenantDb(), prov, new Date(), 500));
    const enviado = prov.enviados.find((e) => e.idempotencyKey === `${tenant}:legacy-${id}`);
    expect(enviado?.html).toBe("<p>legacy en claro</p>");
    expect(enviado?.texto).toBe("legacy en claro");
  });

  it("sin clave falla cerrado antes de insertar", async () => {
    const key = `sin-clave-${randomUUID()}`;
    delete process.env[CLAVE_KEY];
    await expect(
      conTenant(tenant, () =>
        encolarEnvio({ key, stream: "avisos", to: "sinclave@ejemplo.com", plantilla: "cierre", vars: {} }),
      ),
    ).rejects.toThrow(/EMAIL_OUTBOX_CIPHER_KEY_B64/);
    const filas = await conTenant(tenant, () =>
      getTenantDb().select({ id: emailOutbox.id }).from(emailOutbox).where(eq(emailOutbox.idempotencyKey, key)),
    );
    expect(filas).toHaveLength(0);
  });
});
