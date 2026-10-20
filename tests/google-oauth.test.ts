import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  construirUrlAutorizacionGmail,
  cookieEstado,
  extraerCookie,
  firmarEstado,
  generarPKCE,
  intercambiarCodigoGmail,
  leerConfigIntegracionGmail,
  leerEstadoFirmado,
  nuevoNonce,
  nuevoState,
  revocarTokenGoogle,
  verificarIdToken,
  type EstadoIntegracion,
} from "../src/modules/integraciones/google-oauth.js";
import {
  kms_desde_clave,
  kms_integraciones_desde_env,
} from "../src/modules/fiscal/kms.js";

const config = {
  clientId: "cliente",
  clientSecret: "secreto",
  redirectUri: "http://localhost:4321/api/integrations/callback",
};

const envEstado = { INTEGRATIONS_STATE_SECRET: "secreto-de-test" };

function respuestaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OAuth de integraciones Google", () => {
  it("pide solo lectura de Gmail, offline y PKCE S256", () => {
    const url = new URL(
      construirUrlAutorizacionGmail({
        config,
        state: "state-1",
        nonce: "nonce-1",
        codeChallenge: "challenge-1",
      }),
    );
    expect(url.searchParams.get("scope")).toBe(
      "openid email https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("nonce")).toBe("nonce-1");
    expect(url.searchParams.get("scope")).not.toContain("gmail.modify");
    expect(url.searchParams.get("scope")).not.toContain("gmail.send");
  });

  it("lee la config de Gmail y falla si falta una variable", () => {
    expect(
      leerConfigIntegracionGmail({
        GOOGLE_INTEGRATIONS_CLIENT_ID: "id",
        GOOGLE_INTEGRATIONS_CLIENT_SECRET: "secreto",
        GOOGLE_INTEGRATIONS_REDIRECT: "http://localhost/callback",
      }),
    ).toEqual({
      clientId: "id",
      clientSecret: "secreto",
      redirectUri: "http://localhost/callback",
    });
    expect(() => leerConfigIntegracionGmail({})).toThrow(/GOOGLE_INTEGRATIONS/);
  });

  it("canjea el código y devuelve refresh token y scopes", async () => {
    const fetchImpl: typeof fetch = async () =>
      respuestaJson({
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3600,
        scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
        id_token: "id-1",
      });
    const tokens = await intercambiarCodigoGmail({
      code: "code-1",
      codeVerifier: "verifier-1",
      config,
      fetchImpl,
    });
    expect(tokens).toEqual({
      refreshToken: "refresh-1",
      accessToken: "access-1",
      expiresIn: 3600,
      scopes: ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly"],
      idToken: "id-1",
    });
  });

  it("distingue invalid_grant de un error de red", async () => {
    const fetchImpl: typeof fetch = async () =>
      respuestaJson({ error: "invalid_grant" }, 400);
    await expect(
      intercambiarCodigoGmail({
        code: "code-1",
        codeVerifier: "verifier-1",
        config,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ codigo: "invalid_grant" });
  });

  it("revoca el token y acepta el 400 de un token ya vencido", async () => {
    let llamado = "";
    const fetchImpl: typeof fetch = async (input) => {
      llamado = String(input);
      return new Response("", { status: 400 });
    };
    await revocarTokenGoogle("refresh-1", fetchImpl);
    expect(llamado).toBe("https://oauth2.googleapis.com/revoke");
  });

  it("firma el state, lo vence y rechaza una firma alterada", () => {
    const estado: EstadoIntegracion = {
      state: "state-1",
      verifier: "verifier-1",
      nonce: "nonce-1",
      tenantId: "tenant-1",
      googleSub: "sub-1",
      tipo: "gmail",
      exp: 2_000,
    };
    const firmado = firmarEstado(estado, envEstado);
    expect(leerEstadoFirmado(firmado, envEstado, 1_000)).toEqual(estado);
    expect(leerEstadoFirmado(firmado, envEstado, 2_001)).toBeNull();
    expect(leerEstadoFirmado(`${firmado}x`, envEstado, 1_000)).toBeNull();
  });

  it("la cookie de state es HttpOnly, Secure, SameSite Lax y corta", () => {
    const cookie = cookieEstado("valor");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=600");
  });

  it("genera PKCE S256 y valores de un solo uso", () => {
    const pkce = generarPKCE();
    expect(pkce.challenge).toBe(
      createHash("sha256").update(pkce.verifier).digest("base64url"),
    );
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    expect(nuevoState()).not.toBe(nuevoState());
    expect(nuevoNonce()).not.toBe(nuevoNonce());
  });

  it("lee la cookie de state del header", () => {
    expect(
      extraerCookie(
        "otra=1; __Host-integrations-state=firmado; sesion=2",
        "__Host-integrations-state",
      ),
    ).toBe("firmado");
    expect(extraerCookie(null, "__Host-integrations-state")).toBeNull();
    expect(extraerCookie("otra=1", "__Host-integrations-state")).toBeNull();
  });

  it("valida el id token y rechaza otro cliente, nonce o correo sin verificar", async () => {
    const base = {
      aud: config.clientId,
      iss: "https://accounts.google.com",
      sub: "sub-1",
      email: "dueno@ejemplo.com",
      email_verified: "true",
      nonce: "nonce-1",
    };
    const respuesta = (over: Record<string, unknown> = {}) =>
      async () => respuestaJson({ ...base, ...over });
    const identidad = await verificarIdToken({
      idToken: "id-1",
      expectedAud: config.clientId,
      nonceEsperado: "nonce-1",
      fetchImpl: respuesta(),
    });
    expect(identidad).toEqual({
      sub: "sub-1",
      email: "dueno@ejemplo.com",
      emailVerificado: true,
      nonce: "nonce-1",
    });
    await expect(
      verificarIdToken({
        idToken: "id-1",
        expectedAud: "otro-cliente",
        nonceEsperado: "nonce-1",
        fetchImpl: respuesta(),
      }),
    ).rejects.toMatchObject({ codigo: "aud_invalida" });
    await expect(
      verificarIdToken({
        idToken: "id-1",
        expectedAud: config.clientId,
        nonceEsperado: "nonce-2",
        fetchImpl: respuesta(),
      }),
    ).rejects.toMatchObject({ codigo: "nonce_invalido" });
    await expect(
      verificarIdToken({
        idToken: "id-1",
        expectedAud: config.clientId,
        nonceEsperado: "nonce-1",
        fetchImpl: respuesta({ email_verified: "false" }),
      }),
    ).rejects.toMatchObject({ codigo: "email_no_verificado" });
  });

  it("KMS de integraciones usa AAD y una clave separada", async () => {
    expect(kms_integraciones_desde_env({})).toBeNull();
    const kms = kms_desde_clave(Buffer.alloc(32, 7), "integraciones-test");
    const envelope = await kms.encrypt("refresh-token", "tenant-1:gmail:conn-1");
    expect(await kms.decrypt(envelope, "tenant-1:gmail:conn-1")).toBe("refresh-token");
    await expect(kms.decrypt(envelope, "tenant-2:gmail:conn-1")).rejects.toThrow();
    expect(kms_integraciones_desde_env({
      INTEGRATIONS_KMS_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
      INTEGRATIONS_KMS_KEY_ID: "clave-1",
    })?.keyId).toBe("clave-1");
  });
});
