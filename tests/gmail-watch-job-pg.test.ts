import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { guardarConexionGmail } from "../src/lib/repos/google-conexiones.js";
import { resolverRutaWatch } from "../src/lib/repos/gmail-watch.js";
import { renovarWatchGmail } from "../src/jobs/gmail.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("watch de Gmail", () => {
  let sql: ReturnType<typeof postgres> | null = null;
  let tenantId = "";
  let otroTenantId = "";
  const VARS = {
    GMAIL_PUBSUB_TOPIC: "projects/p/topics/gmail",
    GMAIL_PUBSUB_AUDIENCE: "https://mi-app/api/gmail/webhook",
    GMAIL_PUBSUB_EMAIL: "pubsub@ejemplo.iam.gserviceaccount.com",
    GMAIL_ROUTE_PEPPER: "pepper-watch-test",
    GOOGLE_INTEGRATIONS_CLIENT_ID: "cliente-watch",
    GOOGLE_INTEGRATIONS_CLIENT_SECRET: "secreto-watch",
    GOOGLE_INTEGRATIONS_REDIRECT: "http://localhost/api/integrations/callback",
    INTEGRATIONS_KMS_KEY_B64: Buffer.alloc(32, 3).toString("base64"),
    INTEGRATIONS_KMS_KEY_ID: "kms-watch-test",
  } as const;
  const env = { ...process.env, ...VARS };

  beforeAll(async () => {
    const url = await asegurarBasePrivada("gmail_watch_job_pg", URL_A!);
    process.env.CONTROL_DATABASE_URL = url;
    process.env.TENANT_DATABASE_URL = url;
    for (const [k, v] of Object.entries(VARS)) process.env[k] = v;
    delete process.env.TENANT_MODE;
    sql = postgres(url, { max: 1 });
    const [t1] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('Watch uno', ${`watch-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    const [t2] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('Watch dos', ${`watch-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    if (!t1 || !t2) throw new Error("no se crearon los tenants");
    tenantId = t1.id;
    otroTenantId = t2.id;
    await sql`delete from gmail_watch_routes`;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_DATABASE_URL;
    for (const k of Object.keys(VARS)) delete process.env[k];
  });

  it("registra users.watch, guarda expiración y rutea la casilla", async () => {
    const conexion = await guardarConexionGmail({
      tenantId,
      cuentaEmail: "watch@ejemplo.com",
      scopes: ["openid", "email", "gmail.readonly"],
      refreshToken: "refresh-watch",
      consentimientoVersion: "v1",
      consentidoPor: "sub-watch",
      env,
    });
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "access-watch", expires_in: 3600 });
      }
      if (url.includes("/users/me/watch")) {
        return Response.json({ historyId: "555", expiration: "1792000000000" });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;

    const r = await renovarWatchGmail({
      tenantId,
      connectionId: conexion.id,
      deps: { env, fetchImpl },
    });
    expect(r.historyId).toBe("555");
    expect(r.expiraAt.toISOString()).toBe(new Date(1792000000000).toISOString());

    const cliente = sql;
    if (!cliente) throw new Error("sin cliente de prueba");
    const [fila] = await cliente<{ watch_history_id: string | null }[]>`
      select watch_history_id from google_connections where id = ${conexion.id}
    `;
    expect(fila?.watch_history_id).toBe("555");
    expect(await resolverRutaWatch("watch@ejemplo.com", env)).toEqual({
      tenantId,
      connectionId: conexion.id,
    });
  });

  it("rechaza al conectar si la casilla ya está en otro comercio (409 anticipado)", async () => {
    // GGL-P0-HUECOS: el 409 ahora salta en guardarConexionGmail (validación
    // por emailHmac contra gmail_watch_routes) antes de tocar Google, así que
    // ni se crea la fila ni se llama a users/watch.
    await expect(
      guardarConexionGmail({
        tenantId: otroTenantId,
        cuentaEmail: "watch@ejemplo.com",
        scopes: ["openid", "email", "gmail.readonly"],
        refreshToken: "refresh-otro",
        consentimientoVersion: "v1",
        consentidoPor: "sub-otro",
        env,
      }),
    ).rejects.toThrow(/otro comercio/);
  });
});
