import { describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  decodificarPushPubSub,
  verificarPushPubSub,
} from "../src/modules/integraciones/pubsub.js";

const envelope = (data: unknown): unknown => ({
  message: {
    data: Buffer.from(JSON.stringify(data), "utf8").toString("base64"),
    messageId: "push-1",
  },
  subscription: "projects/p/subscriptions/gmail",
});

describe("Pub/Sub de Gmail", () => {
  it("decodifica el envelope con email e historyId", () => {
    expect(
      decodificarPushPubSub(
        envelope({ emailAddress: "casilla@ejemplo.com", historyId: "123" }),
      ),
    ).toEqual({ email: "casilla@ejemplo.com", historyId: "123", messageId: "push-1" });
  });

  it("rechaza envelopes incompletos o con base64 roto", () => {
    expect(decodificarPushPubSub({})).toBeNull();
    expect(decodificarPushPubSub({ message: { data: "%%%" } })).toBeNull();
    expect(
      decodificarPushPubSub({
        message: { data: Buffer.from("no-json").toString("base64") },
      }),
    ).toBeNull();
    expect(
      decodificarPushPubSub(envelope({ emailAddress: "no-email", historyId: "1" })),
    ).toBeNull();
  });

  it("verifica firma, audiencia y cuenta del emisor", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const clave = createLocalJWKSet({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] });
    const token = await new SignJWT({
      email: "pubsub@ejemplo.iam.gserviceaccount.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setAudience("https://mi-app/api/gmail/webhook")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(
      verificarPushPubSub({
        authorization: `Bearer ${token}`,
        audience: "https://mi-app/api/gmail/webhook",
        emailEsperado: "pubsub@ejemplo.iam.gserviceaccount.com",
        clave,
      }),
    ).resolves.toEqual({ email: "pubsub@ejemplo.iam.gserviceaccount.com" });

    await expect(
      verificarPushPubSub({
        authorization: `Bearer ${token}`,
        audience: "https://otra-app/api/gmail/webhook",
        emailEsperado: "pubsub@ejemplo.iam.gserviceaccount.com",
        clave,
      }),
    ).rejects.toMatchObject({ codigo: "oidc_invalido" });

    await expect(
      verificarPushPubSub({
        authorization: `Bearer ${token}`,
        audience: "https://mi-app/api/gmail/webhook",
        emailEsperado: "otra@ejemplo.iam.gserviceaccount.com",
        clave,
      }),
    ).rejects.toMatchObject({ codigo: "oidc_email_invalido" });
  });

  it("rechaza sin Authorization", async () => {
    await expect(
      verificarPushPubSub({
        authorization: null,
        audience: "aud",
        emailEsperado: "a@b.com",
      }),
    ).rejects.toMatchObject({ codigo: "sin_authorization" });
  });
});
