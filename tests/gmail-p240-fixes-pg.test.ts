import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { encolarIngesta } from "../src/lib/repos/gmail-cola.js";
import {
  actualizarActivoRemitenteIngesta,
  leerFiltrosIngesta,
} from "../src/lib/repos/gmail-ingesta.js";
import { guardarConexionGmail } from "../src/lib/repos/google-conexiones.js";
import { ejecutarJobGmail } from "../src/jobs/gmail.js";
import { renovarWatchGmail } from "../src/jobs/gmail.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("GGL-P240-FIX regresiones ingesta Gmail", () => {
  let sql: ReturnType<typeof postgres> | null = null;
  let tenantId = "";
  let otroTenantId = "";
  let filtroId = "";
  const env = {
    GMAIL_ROUTE_PEPPER: "pepper-p240",
    GOOGLE_INTEGRATIONS_CLIENT_ID: "cliente-p240",
    GOOGLE_INTEGRATIONS_CLIENT_SECRET: "secreto-p240",
    GOOGLE_INTEGRATIONS_REDIRECT: "http://localhost/api/integrations/callback",
    INTEGRATIONS_KMS_KEY_B64: Buffer.alloc(32, 40).toString("base64"),
    INTEGRATIONS_KMS_KEY_ID: "kms-p240",
    GMAIL_PUBSUB_TOPIC: "projects/p/topics/gmail",
    GMAIL_PUBSUB_AUDIENCE: "https://mi-app/api/gmail/webhook",
    GMAIL_PUBSUB_EMAIL: "pubsub@ejemplo.iam.gserviceaccount.com",
  } as const;

  beforeAll(async () => {
    const url = await asegurarBasePrivada("gmail_p240_fixes", URL_A!);
    process.env.CONTROL_DATABASE_URL = url;
    process.env.TENANT_DATABASE_URL = url;
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    delete process.env.TENANT_MODE;

    sql = postgres(url, { max: 1 });
    const [t1] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('P240 A', ${`p240a-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    const [t2] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('P240 B', ${`p240b-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    if (!t1 || !t2) throw new Error("sin tenants");
    tenantId = t1.id;
    otroTenantId = t2.id;

    const [f] = await sql<{ id: string }[]>`
      insert into email_ingestion_filters (remitente, keywords, activo)
      values ('proveedor.com', '[]'::jsonb, true)
      returning id
    `;
    if (!f) throw new Error("sin filtro");
    filtroId = f.id;

    await sql`delete from gmail_ingestion_jobs`;
    await sql`delete from gmail_watch_routes`;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_DATABASE_URL;
    for (const k of Object.keys(env)) delete process.env[k];
  });

  it("dedupe por messageId no cruza comercios", async () => {
    const messageId = `msg-compartido-${randomUUID()}`;
    const connA = randomUUID();
    const connB = randomUUID();
    const jA = await encolarIngesta({
      tenantId,
      connectionId: connA,
      historyId: "hist-a",
      messageId,
      motivo: "push",
    });
    const jB = await encolarIngesta({
      tenantId: otroTenantId,
      connectionId: connB,
      historyId: "hist-b",
      messageId,
      motivo: "push",
    });
    expect(jA?.id).toBeTruthy();
    expect(jB?.id).toBeTruthy();
    expect(jA!.id).not.toBe(jB!.id);
    const filas = await sql!<{ tenant_id: string; message_id: string | null }[]>`
      select tenant_id, message_id from gmail_ingestion_jobs where message_id = ${messageId}
    `;
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => f.message_id === messageId)).toBe(true);
  });

  it("mismo comercio no duplica messageId", async () => {
    const messageId = `msg-mismo-tenant-${randomUUID()}`;
    const conn = randomUUID();
    const j1 = await encolarIngesta({
      tenantId,
      connectionId: conn,
      historyId: "hist-1",
      messageId,
      motivo: "push",
    });
    const j2 = await encolarIngesta({
      tenantId,
      connectionId: conn,
      historyId: "hist-2",
      messageId,
      motivo: "push",
    });
    expect(j1?.id).toBeTruthy();
    expect(j2?.id).toBe(j1!.id);
    const [row] = await sql!<{ n: number }[]>`
      select count(*)::int as n from gmail_ingestion_jobs
      where tenant_id = ${tenantId} and message_id = ${messageId}
    `;
    expect(row?.n).toBe(1);
  });

  it("filtros_actualizados solo al cambiar un remitente, no al ejecutar ingesta", async () => {
    await guardarConexionGmail({
      tenantId,
      cuentaEmail: "filtros@ejemplo.com",
      scopes: ["gmail.readonly"],
      refreshToken: "refresh-filtros",
      consentimientoVersion: "v1",
      consentidoPor: "sub-filtros",
      env: process.env,
    });

    const contarFiltrosEventos = async () => {
      const [row] = await sql!<{ n: number }[]>`
        select count(*)::int as n from gmail_connection_events
        where tenant_id = ${tenantId} and evento = 'filtros_actualizados'
      `;
      return row?.n ?? 0;
    };

    const antes = await contarFiltrosEventos();

    const job = await encolarIngesta({
      tenantId,
      connectionId: (await sql!<{ id: string }[]>`
        select id from google_connections where tenant_id = ${tenantId} limit 1
      `)[0]!.id,
      historyId: "sync-1",
      motivo: "push",
    });
    if (!job) throw new Error("sin job");

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      if (url.includes("/users/me/profile")) {
        return Response.json({ emailAddress: "filtros@ejemplo.com", historyId: "1" });
      }
      if (url.includes("/users/me/messages?")) {
        return Response.json({ messages: [] });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;

    await ejecutarJobGmail(job, { env: process.env, fetchImpl, ahoraMs: Date.UTC(2026, 10, 1) });
    expect(await contarFiltrosEventos()).toBe(antes);

    const ok = await actualizarActivoRemitenteIngesta({
      tenantId,
      filtroId,
      activo: false,
      actor: "dueno-test",
    });
    expect(ok).toBe(true);
    expect(await contarFiltrosEventos()).toBe(antes + 1);

    await actualizarActivoRemitenteIngesta({
      tenantId,
      filtroId,
      activo: false,
      actor: "dueno-test",
    });
    expect(await contarFiltrosEventos()).toBe(antes + 1);

    const filtros = await leerFiltrosIngesta(tenantId);
    expect(filtros.find((f) => f.id === filtroId)?.activo).toBe(false);
  });

  it("persiste labels de la conexión y las envía a users.watch", async () => {
    const labels = ["IMPORTANT", "INBOX"] as const;
    const otroTenant = randomUUID();
    await sql!`
      insert into tenants (id, nombre_comercio, slug, plan)
      values (${otroTenant}, 'Labels', ${`lbl-${randomUUID().slice(0, 6)}`}, 'demo')
    `;

    const conexion = await guardarConexionGmail({
      tenantId: otroTenant,
      cuentaEmail: `labels-${randomUUID().slice(0, 6)}@ejemplo.com`,
      scopes: ["gmail.readonly"],
      labels: [...labels],
      refreshToken: "refresh-labels",
      consentimientoVersion: "v1",
      consentidoPor: "sub-labels",
      env: process.env,
    });

    const [fila] = await sql!<{ labels: string[] }[]>`
      select labels from google_connections where id = ${conexion.id}
    `;
    expect(fila?.labels).toEqual([...labels]);

    let watchBody: { labelIds?: string[] } | undefined;
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "access-lbl", expires_in: 3600 });
      }
      if (url.includes("/users/me/watch")) {
        watchBody = JSON.parse(String(init?.body ?? "{}")) as { labelIds?: string[] };
        return Response.json({ historyId: "900", expiration: String(Date.now() + 86_400_000) });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;

    await renovarWatchGmail({
      tenantId: otroTenant,
      connectionId: conexion.id,
      deps: { env: process.env, fetchImpl },
    });
    expect(watchBody?.labelIds).toEqual([...labels]);
  });
});