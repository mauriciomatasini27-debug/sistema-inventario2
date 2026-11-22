// P10-33 [tenant]: AES-256-GCM con clave de entorno separada de la fiscal; el prefijo distingue el ciphertext del texto legacy que otros comercios pudieron dejar en claro.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIJO = "enc:v1";
const CLAVE_ENV = "EMAIL_OUTBOX_CIPHER_KEY_B64";
export type CampoOutbox = "html" | "texto";

function claveDesdeEnv(env: Record<string, string | undefined>): Buffer | null {
  const b64 = env[CLAVE_ENV] ?? "";
  if (!b64) return null;
  const clave = Buffer.from(b64, "base64");
  return clave.length === 32 ? clave : null;
}

// P10-33 [plataforma]: sin clave válida falla cerrado, para que una mala config del runtime no deje el cuerpo en claro.
function claveObligatoria(): Buffer {
  const clave = claveDesdeEnv(process.env);
  if (!clave) throw new Error(`${CLAVE_ENV}: falta clave AES-256 de 32 bytes en base64 para el outbox de email`);
  return clave;
}

// El AAD ata el ciphertext al comercio y al campo: moverlo de fila o de
// columna (html <-> texto) invalidate el tag aunque se tenga la misma clave.
function aad(tenantId: string, campo: CampoOutbox): string {
  return `email_outbox:${PREFIJO}:${tenantId}:${campo}`;
}

export function esCifradoOutbox(valor: string): boolean {
  return valor.startsWith(`${PREFIJO}:`);
}

export function cifrarCampoOutbox(plano: string, tenantId: string, campo: CampoOutbox): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", claveObligatoria(), iv);
  c.setAAD(Buffer.from(aad(tenantId, campo), "utf8"));
  const cifrado = Buffer.concat([c.update(plano, "utf8"), c.final()]);
  return [PREFIJO, iv.toString("base64"), c.getAuthTag().toString("base64"), cifrado.toString("base64")].join(":");
}

export function descifrarCampoOutbox(valor: string, tenantId: string, campo: CampoOutbox): string {
  if (!esCifradoOutbox(valor)) return valor;
  const partes = valor.split(":");
  if (partes.length !== 5) throw new Error("email_outbox: ciphertext malformado");
  const [, , ivB64, tagB64, cuerpoB64] = partes as [string, string, string, string, string];
  const d = createDecipheriv("aes-256-gcm", claveObligatoria(), Buffer.from(ivB64, "base64"));
  d.setAAD(Buffer.from(aad(tenantId, campo), "utf8"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(cuerpoB64, "base64")), d.final()]).toString("utf8");
}
