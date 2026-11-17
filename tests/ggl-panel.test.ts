import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { ctx } from "./helpers/ctx.js";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { control, resetStore } from "../src/lib/store.js";
import { crearSesion } from "../src/modules/auth/sesiones.js";
import {
  descartarJobsIngestaGmail,
  guardarConexionGmail,
  leerSaludConexionGmail,
} from "../src/lib/repos/google-conexiones.js";
import { encolarIngesta, reclamarJobsGmail } from "../src/lib/repos/gmail-cola.js";
import { ejecutarJobGmail } from "../src/jobs/gmail.js";
import { POST as postDisconnect } from "../src/pages/api/integrations/disconnect.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("GGL-PANEL salud, desconexión e invalid_grant", () => {
  const tenantId = randomUUID();
  const googleSub = "g-panel-dueno";
  const env = {
    INTEGRATIONS_KMS_KEY_B64: Buffer.alloc(32, 11).toString("base64"),
    INTEGRATIONS_KMS_KEY_ID: "kms-panel-test",
    // Hueco 4 (GGL-P0-HUECOS): guardarConexionGmail ahora calcula el HMAC de
    // la casilla para rechazar 409 anticipado, así que el pepper es obligatorio.
    GMAIL_ROUTE_PEPPER: "pepper-panel-test",
    GOOGLE_INTEGRATIONS_CLIENT_ID: "cliente-panel",
    GOOGLE_INTEGRATIONS_CLIENT_SECRET: "secreto-panel",
    GOOGLE_INTEGRATIONS_REDIRECT: "http://localhost/api/integrations/callback",
  };
  let sql: ReturnType<typeof postgres> | null = null;
  let plano = "";
  let connectionId = "";

  beforeAll(async () => {
    const url = await asegurarBasePrivada("ggl_panel", URL_A!);
    process.env.CONTROL_DATABASE_URL = url;
    process.env.TENANT_DATABASE_URL = url;
    process.env.DEFAULT_TENANT_ID = tenantId;
    delete process.env.TENANT_MODE;
    for (const [k, v] of Object.entries(env)) process.env[k] = v;

    sql = postgres(url, { max: 1 });
    await sql`
      insert into users (google_sub, email, email_verificado, estado)
      values (${googleSub}, 'panel@ejemplo.com', true, 'activo')
      on conflict (google_sub) do nothing
    `;
    await sql`
      insert into tenants (id, nombre_comercio, slug, plan, estado, owner_google_sub)
      values (
        ${tenantId},
        'Panel Gmail',
        ${`panel-${randomUUID().slice(0, 8)}`},
        'demo',
        'activo',
        ${googleSub}
      )
    `;

    resetStore();
    control.tenants.set(tenantId, {
      id: tenantId,
      nombreComercio: "Panel Gmail",
      slug: "panel-gmail",
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: googleSub,
      esDemo: false,
    });
    control.memberships.set("m-panel", {
      id: "m-panel",
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

    const conexion = await guardarConexionGmail({
      tenantId,
      cuentaEmail: "facturas@ejemplo.com",
      scopes: ["gmail.readonly"],
      refreshToken: "refresh-panel",
      consentimientoVersion: "v1",
      consentidoPor: googleSub,
      env: process.env,
    });
    connectionId = conexion.id;
    await sql!`
      update google_connections
      set watch_history_id = '99', watch_expira_at = now() + interval '1 day'
      where tenant_id = ${tenantId}
    `;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.DEFAULT_TENANT_ID;
    for (const k of Object.keys(env)) delete process.env[k];
  });

  it("expone salud de conexión activa con watch", async () => {
    const salud = await leerSaludConexionGmail(tenantId);
    expect(salud.estado).toBe("activa");
    expect(salud.cuentaEmail).toBe("facturas@ejemplo.com");
    expect(salud.watchActivo).toBe(true);
    expect(salud.requiereReconexion).toBe(false);
  });

  it("desconectar descarta jobs pendientes de ingesta", async () => {
    await encolarIngesta({
      tenantId,
      connectionId,
      historyId: `hist-${randomUUID()}`,
      motivo: "push",
    });
    await encolarIngesta({
      tenantId,
      connectionId,
      historyId: `hist-${randomUUID()}`,
      motivo: "poll",
    });

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
      if (url.includes("gmail.googleapis.com") && url.includes("stop")) return new Response("");
      throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;

    const r = await postDisconnect(
      ctx("http://x/api/integrations/disconnect", {
        method: "POST",
        headers: { cookie: `__Host-sesion=${plano}` },
      }),
    );
    expect(r.status).toBe(200);

    const pendientes = await reclamarJobsGmail({ tenantId, limite: 10 });
    expect(pendientes).toHaveLength(0);

    const cliente = sql!;
    const filas = await cliente<{ estado: string; ultimo_error: string | null }[]>`
      select estado, ultimo_error from gmail_ingestion_jobs where tenant_id = ${tenantId}
    `;
    expect(filas.every((f) => f.estado === "error" && f.ultimo_error === "descartado_desconexion")).toBe(true);
  });

  it("invalid_grant revoca la conexión, avisa y no reencola el job", async () => {
    const conexion = await guardarConexionGmail({
      tenantId,
      cuentaEmail: "facturas@ejemplo.com",
      scopes: ["gmail.readonly"],
      refreshToken: "refresh-invalid",
      consentimientoVersion: "v1",
      consentidoPor: googleSub,
      env: process.env,
    });
    const job = await encolarIngesta({
      tenantId,
      connectionId: conexion.id,
      historyId: `invalid-${randomUUID()}`,
      motivo: "push",
    });
    if (!job) throw new Error("sin job");

    const fetchImpl = (async (input: RequestInfo | URL) => {
      if (String(input).includes("oauth2.googleapis.com/token")) {
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      }
      throw new Error(`fetch inesperado: ${String(input)}`);
    }) as typeof fetch;

    const resultado = await ejecutarJobGmail(job, { env: process.env, fetchImpl });
    expect(resultado).toBe("error");

    const salud = await leerSaludConexionGmail(tenantId);
    expect(salud.estado).toBe("revocada");
    expect(salud.requiereReconexion).toBe(true);
    expect(salud.avisoDueño).toContain("invalid_grant");

    const reclamados = await reclamarJobsGmail({ tenantId, limite: 5 });
    expect(reclamados.find((j) => j.id === job.id)).toBeUndefined();

    const cliente = sql!;
    const [filaJob] = await cliente<{ estado: string; intentos: number }[]>`
      select estado, intentos from gmail_ingestion_jobs where id = ${job.id}
    `;
    expect(filaJob?.estado).toBe("error");
    expect(filaJob?.intentos).toBe(1);
  });

  it("descartarJobsIngestaGmail solo corta pendientes y procesando", async () => {
    const otroTenant = randomUUID();
    await sql!`
      insert into tenants (id, nombre_comercio, slug, plan, estado, owner_google_sub)
      values (${otroTenant}, 'Otro', ${`otro-${randomUUID().slice(0, 6)}`}, 'demo', 'activo', ${googleSub})
    `;
    const otra = await guardarConexionGmail({
      tenantId: otroTenant,
      cuentaEmail: "otra@ejemplo.com",
      scopes: ["gmail.readonly"],
      refreshToken: "r2",
      consentimientoVersion: "v1",
      consentidoPor: googleSub,
      env: process.env,
    });
    const hecho = await encolarIngesta({
      tenantId: otroTenant,
      connectionId: otra.id,
      historyId: `hecho-${randomUUID()}`,
      motivo: "push",
    });
    if (!hecho) throw new Error("sin job hecho");
    await sql!`update gmail_ingestion_jobs set estado = 'hecho' where id = ${hecho.id}`;

    const pendiente = await encolarIngesta({
      tenantId: otroTenant,
      connectionId: otra.id,
      historyId: `pend-${randomUUID()}`,
      motivo: "push",
    });
    if (!pendiente) throw new Error("sin job pendiente");

    const n = await descartarJobsIngestaGmail({ tenantId: otroTenant, connectionId: otra.id });
    expect(n).toBe(1);

    const [fHecho] = await sql!<{ estado: string }[]>`
      select estado from gmail_ingestion_jobs where id = ${hecho.id}
    `;
    expect(fHecho?.estado).toBe("hecho");
  });
});
