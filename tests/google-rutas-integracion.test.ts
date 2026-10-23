import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import { descifrarRefreshTokenGmail } from "../src/lib/repos/google-conexiones.js";
import { extraerCookie } from "../src/modules/integraciones/google-oauth.js";
import { POST as postStart } from "../src/pages/api/integrations/start.js";
import { GET as getCallback } from "../src/pages/api/integrations/callback.js";
import { POST as postDisconnect } from "../src/pages/api/integrations/disconnect.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("rutas de integración Google", () => {
  const tenantId = randomUUID();
  const googleSub = "g-rutas-integracion";
  const clientId = "cliente-integracion";
  const secretoKms = Buffer.alloc(32, 9).toString("base64");
  let sql: ReturnType<typeof postgres> | null = null;
  let plano = "";
  let stateCookie = "";
  let stateQuery = "";
  let nonce = "";
  let fetchOriginal: typeof fetch;

  beforeAll(async () => {
    const url = await asegurarBasePrivada("google_rutas_integracion", URL_A!);
    process.env.TENANT_DATABASE_URL = url;
    process.env.DEFAULT_TENANT_ID = tenantId;
    delete process.env.TENANT_MODE;
    process.env.GOOGLE_INTEGRATIONS_CLIENT_ID = clientId;
    process.env.GOOGLE_INTEGRATIONS_CLIENT_SECRET = "secreto-integracion";
    process.env.GOOGLE_INTEGRATIONS_REDIRECT =
      "http://localhost:4321/api/integrations/callback";
    process.env.INTEGRATIONS_STATE_SECRET = "state-secreto-de-test";
    process.env.INTEGRATIONS_KMS_KEY_B64 = secretoKms;
    process.env.INTEGRATIONS_KMS_KEY_ID = "kms-integracion-test";

    sql = postgres(url, { max: 1 });
    await sql`
      insert into users (google_sub, email, email_verificado, estado)
      values (${googleSub}, 'rutas@ejemplo.com', true, 'activo')
      on conflict (google_sub) do nothing
    `;
    await sql`
      insert into tenants (id, nombre_comercio, slug, plan, estado, owner_google_sub)
      values (
        ${tenantId},
        'Integraciones',
        ${`integraciones-${randomUUID().slice(0, 8)}`},
        'demo',
        'activo',
        ${googleSub}
      )
    `;

    resetStore();
    control.tenants.set(tenantId, {
      id: tenantId,
      nombreComercio: "Integraciones",
      slug: "integraciones",
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: googleSub,
      esDemo: false,
    });
    control.memberships.set("m-integ", {
      id: "m-integ",
      tenantId,
      googleSub,
      rol: "dueno",
      permisos: [],
      estado: "activo",
    });
    const sesion = crearSesion({ googleSub, tenantId });
    plano = sesion.idPlano;
    control.sessions.set(sesion.registro.idHash, {
      idHash: sesion.registro.idHash,
      googleSub,
      tenantId,
      expiraAt: sesion.registro.expiraAt,
      expiraAbsoluta: sesion.registro.expiraAbsoluta,
      lastSeenAt: new Date().toISOString(),
    });

    fetchOriginal = globalThis.fetch;
  });

  afterAll(async () => {
    globalThis.fetch = fetchOriginal;
    await sql?.end();
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
    delete process.env.GOOGLE_INTEGRATIONS_CLIENT_ID;
    delete process.env.GOOGLE_INTEGRATIONS_CLIENT_SECRET;
    delete process.env.GOOGLE_INTEGRATIONS_REDIRECT;
    delete process.env.INTEGRATIONS_STATE_SECRET;
    delete process.env.INTEGRATIONS_KMS_KEY_B64;
    delete process.env.INTEGRATIONS_KMS_KEY_ID;
  });

  function conSesion(cookieExtra = ""): HeadersInit {
    const cookie = `__Host-sesion=${plano}${cookieExtra ? `; ${cookieExtra}` : ""}`;
    return { cookie };
  }

  it("inicia el flujo con consentimiento versionado, PKCE y state firmado", async () => {
    const r = await postStart(
      ctx("http://x/api/integrations/start", {
        body: { tipo: "gmail", consentimiento_version: "2026-10-19-v1" },
        headers: conSesion(),
      }),
    );
    expect(r.status).toBe(303);
    const location = new URL(r.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("scope")).not.toContain("gmail.modify");
    stateQuery = location.searchParams.get("state") ?? "";
    nonce = location.searchParams.get("nonce") ?? "";
    const setCookie = r.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("__Host-integrations-state=");
    expect(setCookie).toContain("HttpOnly");
    stateCookie = extraerCookie(setCookie, "__Host-integrations-state") ?? "";
    expect(stateCookie).not.toBe("");
  });

  it("el empleado no inicia el flujo", async () => {
    const subEmpleado = "g-rutas-empleado";
    control.memberships.set("m-integ-empleado", {
      id: "m-integ-empleado",
      tenantId,
      googleSub: subEmpleado,
      rol: "empleado",
      permisos: [],
      estado: "activo",
    });
    const sesion = crearSesion({ googleSub: subEmpleado, tenantId });
    control.sessions.set(sesion.registro.idHash, {
      idHash: sesion.registro.idHash,
      googleSub: subEmpleado,
      tenantId,
      expiraAt: sesion.registro.expiraAt,
      expiraAbsoluta: sesion.registro.expiraAbsoluta,
      lastSeenAt: new Date().toISOString(),
    });
    const r = await postStart(
      ctx("http://x/api/integrations/start", {
        body: { tipo: "gmail", consentimiento_version: "2026-10-19-v1" },
        headers: { cookie: `__Host-sesion=${sesion.idPlano}` },
      }),
    );
    expect(r.status).toBe(403);
  });

  it("inicia el flujo desde el formulario de consentimiento", async () => {
    const r = await postStart(
      ctx("http://x/api/integrations/start", {
        method: "POST",
        body: new URLSearchParams({
          tipo: "gmail",
          consentimiento_version: "2026-10-19-v1",
        }).toString(),
        headers: {
          ...conSesion(),
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
    );
    expect(r.status).toBe(303);
    expect(new URL(r.headers.get("location") ?? "").origin).toBe("https://accounts.google.com");
    expect(r.headers.get("set-cookie") ?? "").toContain("__Host-integrations-state=");
  });

  it("rechaza el formulario si la versión del consentimiento no es la vigente", async () => {
    const r = await postStart(
      ctx("http://x/api/integrations/start", {
        method: "POST",
        body: new URLSearchParams({
          tipo: "gmail",
          consentimiento_version: "v0",
        }).toString(),
        headers: {
          ...conSesion(),
          "content-type": "application/x-www-form-urlencoded",
        },
      }),
    );
    expect(r.status).toBe(422);
    expect(r.headers.get("content-type") ?? "").toContain("text/html");
    expect(await r.text()).toContain("El consentimiento no es la versión vigente.");
  });

  it("rechaza iniciar sin aceptar la versión vigente del consentimiento", async () => {
    const r = await postStart(
      ctx("http://x/api/integrations/start", {
        body: { tipo: "gmail", consentimiento_version: "v0" },
        headers: conSesion(),
      }),
    );
    expect(r.status).toBe(422);
  });

  it("canjea el código, valida el id token y guarda la conexión cifrada", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("tokeninfo")) {
        return Response.json({
          aud: clientId,
          iss: "https://accounts.google.com",
          sub: "sub-casilla",
          email: "casilla@ejemplo.com",
          email_verified: "true",
          nonce,
        });
      }
      if (url.includes("oauth2.googleapis.com/token")) {
        return Response.json({
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
          id_token: "id-token-1",
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;

    const r = await getCallback(
      ctx(
        `http://x/api/integrations/callback?code=code-1&state=${encodeURIComponent(stateQuery)}`,
        {
          headers: conSesion(
            `__Host-integrations-state=${stateCookie}`,
          ),
        },
      ),
    );
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/panel?google=conectado");
    expect(await descifrarRefreshTokenGmail(tenantId)).toBe("refresh-1");

    const cliente = sql;
    if (!cliente) throw new Error("sin cliente de prueba");
    const [fila] = await cliente<
      { cuenta_email: string; refresh_token_cifrado: string | null }[]
    >`
      select cuenta_email, refresh_token_cifrado
      from google_connections
      where tenant_id = ${tenantId}
    `;
    expect(fila?.cuenta_email).toBe("casilla@ejemplo.com");
    expect(fila?.refresh_token_cifrado).toBeTruthy();
    expect(fila?.refresh_token_cifrado).not.toBe("refresh-1");
  });

  it("rechaza un callback sin state o con state de otro par", async () => {
    const sinState = await getCallback(
      ctx("http://x/api/integrations/callback?code=code-1&state=x", {
        headers: conSesion(),
      }),
    );
    expect(sinState.status).toBe(303);
    expect(sinState.headers.get("location")).toContain("motivo=sin_state");

    const otroState = await getCallback(
      ctx("http://x/api/integrations/callback?code=code-1&state=otro", {
        headers: conSesion(`__Host-integrations-state=${stateCookie}`),
      }),
    );
    expect(otroState.status).toBe(303);
    expect(otroState.headers.get("location")).toContain("motivo=state_no_coincide");
  });

  it("desconecta: revoca en Google, borra el token y deja la fila revocada", async () => {
    let revocado = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("oauth2.googleapis.com/revoke")) {
        revocado = true;
        return new Response("", { status: 200 });
      }
      throw new Error(`fetch inesperado: ${String(input)}`);
    }) as typeof fetch;

    const r = await postDisconnect(
      ctx("http://x/api/integrations/disconnect", {
        method: "POST",
        headers: conSesion(),
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, revocado_en_google: true });
    expect(revocado).toBe(true);
    expect(await descifrarRefreshTokenGmail(tenantId)).toBeNull();

    const cliente = sql;
    if (!cliente) throw new Error("sin cliente de prueba");
    const [fila] = await cliente<{ estado: string }[]>`
      select estado from google_connections where tenant_id = ${tenantId}
    `;
    expect(fila?.estado).toBe("revocada");
  });
});
