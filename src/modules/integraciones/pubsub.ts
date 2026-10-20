import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { ErrorOAuthGoogle } from "./google-oauth.js";

const JWKS_GOOGLE = new URL("https://www.googleapis.com/oauth2/v3/certs");

export interface PushPubSub {
  readonly email: string;
  readonly historyId: string;
  readonly messageId: string | null;
}

export interface ConfigPubSub {
  readonly audience: string;
  readonly email: string;
  readonly topic: string;
}

const dataSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.string().min(1),
});

const envelopeSchema = z.object({
  message: z.object({
    data: z.string().min(1),
    messageId: z.string().optional(),
  }),
  subscription: z.string().optional(),
});

export function leerConfigPubSub(env: NodeJS.ProcessEnv = process.env): ConfigPubSub {
  const audience = env["GMAIL_PUBSUB_AUDIENCE"] ?? "";
  const email = env["GMAIL_PUBSUB_EMAIL"] ?? "";
  const topic = env["GMAIL_PUBSUB_TOPIC"] ?? "";
  if (!audience || !email || !topic) {
    throw new ErrorOAuthGoogle("pubsub_no_configurado", "Falta la configuración de Pub/Sub");
  }
  return { audience, email, topic };
}

export function decodificarPushPubSub(body: unknown): PushPubSub | null {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) return null;
  let bytes: Buffer;
  try {
    bytes = Buffer.from(envelope.data.message.data, "base64");
  } catch {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  const parsed = dataSchema.safeParse(data);
  if (!parsed.success) return null;
  return {
    email: parsed.data.emailAddress,
    historyId: parsed.data.historyId,
    messageId: envelope.data.message.messageId ?? null,
  };
}

export async function verificarPushPubSub(input: {
  readonly authorization: string | null;
  readonly audience: string;
  readonly emailEsperado: string;
  readonly clave?: JWTVerifyGetKey;
}): Promise<{ readonly email: string }> {
  const header = input.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new ErrorOAuthGoogle("sin_authorization", "Falta el token de Pub/Sub");
  let payload;
  try {
    const verificacion = await jwtVerify(token, input.clave ?? createRemoteJWKSet(JWKS_GOOGLE), {
      issuer: "https://accounts.google.com",
      audience: input.audience,
    });
    payload = verificacion.payload;
  } catch {
    throw new ErrorOAuthGoogle("oidc_invalido", "El token de Pub/Sub no es válido");
  }
  const email = typeof payload["email"] === "string" ? payload["email"] : "";
  const verificado = payload["email_verified"] === true || payload["email_verified"] === "true";
  if (!email || !verificado || email.toLowerCase() !== input.emailEsperado.toLowerCase()) {
    throw new ErrorOAuthGoogle("oidc_email_invalido", "El token de Pub/Sub es de otra cuenta");
  }
  return { email };
}
