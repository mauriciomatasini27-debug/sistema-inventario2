// KMS envelope homo (ADR-0018 D8, FE-S26).
// Slice homo: AES-256-GCM local con clave de env (FISCAL_KMS_KEY_B64 32B).
// Prod inyecta AWS KMS sin cambiar callers: misma interfaz Kms.
// Nunca repo/env plano/DB cliente: solo *_ciphertext en DB, plano solo en memoria.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Envelope {
  readonly ciphertextB64: string;
  readonly keyId: string;
  readonly ivB64: string;
  readonly tagB64: string;
}

export interface Kms {
  readonly keyId: string;
  encrypt(plain: string): Promise<Envelope>;
  decrypt(e: Envelope): Promise<string>;
}

function keyDesdeEnv(env: Record<string, string | undefined>): Buffer | null {
  const b64 = env["FISCAL_KMS_KEY_B64"] ?? "";
  if (!b64) return null;
  try {
    const k = Buffer.from(b64, "base64");
    return k.length === 32 ? k : null;
  } catch {
    return null;
  }
}

export function kms_desde_env(env: Record<string, string | undefined>): Kms | null {
  const key = keyDesdeEnv(env);
  const keyId = env["FISCAL_KMS_KEY_ID"] ?? "homo-local-1";
  if (!key) return null;
  return {
    keyId,
    async encrypt(plain: string): Promise<Envelope> {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
      return {
        ciphertextB64: ct.toString("base64"),
        keyId,
        ivB64: iv.toString("base64"),
        tagB64: c.getAuthTag().toString("base64"),
      };
    },
    async decrypt(e: Envelope): Promise<string> {
      const d = createDecipheriv("aes-256-gcm", key, Buffer.from(e.ivB64, "base64"));
      d.setAuthTag(Buffer.from(e.tagB64, "base64"));
      return Buffer.concat([d.update(Buffer.from(e.ciphertextB64, "base64")), d.final()]).toString("utf8");
    },
  };
}

// Fake memoria para tests: sin cripto, marca envelope.
export function crear_kms_fake(keyId = "test-1"): Kms & { store: Map<string, string> } {
  const store = new Map<string, string>();
  let n = 0;
  return {
    keyId,
    store,
    async encrypt(plain: string): Promise<Envelope> {
      n += 1;
      const id = `fake-${n}`;
      store.set(id, plain);
      return { ciphertextB64: Buffer.from(id, "utf8").toString("base64"), keyId, ivB64: "", tagB64: "" };
    },
    async decrypt(e: Envelope): Promise<string> {
      const id = Buffer.from(e.ciphertextB64, "base64").toString("utf8");
      const v = store.get(id);
      if (v === undefined) throw new Error("kms_fake sin dato");
      return v;
    },
  };
}
