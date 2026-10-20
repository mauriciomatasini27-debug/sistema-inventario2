import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import {
  encolarIngesta,
  encolarPolling,
  marcarJobGmailError,
  marcarJobGmailHecho,
  reclamarJobsGmail,
} from "../src/lib/repos/gmail-cola.js";
import {
  CasillaEnOtroComercio,
  desactivarRutaWatch,
  guardarRutaWatch,
  hmacCasilla,
  resolverRutaWatch,
} from "../src/lib/repos/gmail-watch.js";
import {
  existeLogIngesta,
  guardarBorradorIngesta,
  leerCatalogoCuentas,
  leerFiltrosIngesta,
  registrarLogIngesta,
} from "../src/lib/repos/gmail-ingesta.js";
import { guardarConexionGmail } from "../src/lib/repos/google-conexiones.js";
import { ejecutarJobGmail } from "../src/jobs/gmail.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("ingesta Gmail durable", () => {
  let sql: ReturnType<typeof postgres> | null = null;
  let tenantId = "";
  let otroTenantId = "";
  const connectionId = randomUUID();
  const env = {
    ...process.env,
    GMAIL_ROUTE_PEPPER: "pepper-de-test",
    GOOGLE_INTEGRATIONS_CLIENT_ID: "cliente-gmail",
    GOOGLE_INTEGRATIONS_CLIENT_SECRET: "secreto-gmail",
    GOOGLE_INTEGRATIONS_REDIRECT: "http://localhost/api/integrations/callback",
    INTEGRATIONS_KMS_KEY_B64: Buffer.alloc(32, 7).toString("base64"),
    INTEGRATIONS_KMS_KEY_ID: "kms-gmail-test",
  };

  beforeAll(async () => {
    const url = await asegurarBasePrivada("gmail_ingesta_pg", URL_A!);
    process.env.CONTROL_DATABASE_URL = url;
    process.env.TENANT_DATABASE_URL = url;
    process.env.GMAIL_ROUTE_PEPPER = env.GMAIL_ROUTE_PEPPER;
    process.env.GOOGLE_INTEGRATIONS_CLIENT_ID = env.GOOGLE_INTEGRATIONS_CLIENT_ID;
    process.env.GOOGLE_INTEGRATIONS_CLIENT_SECRET = env.GOOGLE_INTEGRATIONS_CLIENT_SECRET;
    process.env.GOOGLE_INTEGRATIONS_REDIRECT = env.GOOGLE_INTEGRATIONS_REDIRECT;
    process.env.INTEGRATIONS_KMS_KEY_B64 = env.INTEGRATIONS_KMS_KEY_B64;
    process.env.INTEGRATIONS_KMS_KEY_ID = env.INTEGRATIONS_KMS_KEY_ID;
    delete process.env.TENANT_MODE;

    sql = postgres(url, { max: 1 });
    const [t1] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('Gmail ingesta', ${`gmail-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    const [t2] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('Gmail otro', ${`gmail-otro-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    if (!t1 || !t2) throw new Error("no se crearon los tenants");
    tenantId = t1.id;
    otroTenantId = t2.id;
    await sql`
      insert into email_ingestion_filters (remitente, keywords, activo)
      values ('edenor.com', ${sql.json(["factura"])}, true)
    `;
    await sql`
      insert into service_accounts (servicio, proveedor, titular, email_origen)
      values ('luz', 'Edenor', 'Titular', 'facturas@edenor.com')
    `;
    await sql`delete from gmail_ingestion_jobs`;
    await sql`delete from email_ingestion_drafts`;
    await sql`delete from email_ingestion_log`;
    await sql`delete from gmail_watch_routes`;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.GMAIL_ROUTE_PEPPER;
    delete process.env.GOOGLE_INTEGRATIONS_CLIENT_ID;
    delete process.env.GOOGLE_INTEGRATIONS_CLIENT_SECRET;
    delete process.env.GOOGLE_INTEGRATIONS_REDIRECT;
    delete process.env.INTEGRATIONS_KMS_KEY_B64;
    delete process.env.INTEGRATIONS_KMS_KEY_ID;
  });

  it("resuelve la casilla por HMAC y la libera al desactivar", async () => {
    const email = "Dueno@Ejemplo.com";
    const hmac = hmacCasilla(email, env);
    expect(hmac).not.toContain("ejemplo");
    expect(hmacCasilla("dueno@ejemplo.com", env)).toBe(hmac);
    await guardarRutaWatch({ email, tenantId, connectionId, env });
    expect(await resolverRutaWatch(email, env)).toEqual({ tenantId, connectionId });
    await expect(
      guardarRutaWatch({ email, tenantId: otroTenantId, connectionId: randomUUID(), env }),
    ).rejects.toBeInstanceOf(CasillaEnOtroComercio);
    await desactivarRutaWatch({ tenantId, connectionId });
    expect(await resolverRutaWatch(email, env)).toBeNull();
  });

  it("encola una vez por push, reclama con lock y reintenta con backoff", async () => {
    const connection = randomUUID();
    const j1 = await encolarIngesta({
      tenantId,
      connectionId: connection,
      historyId: "100",
      motivo: "push",
    });
    const j2 = await encolarIngesta({
      tenantId,
      connectionId: connection,
      historyId: "100",
      motivo: "push",
    });
    expect(j1?.id).toBe(j2?.id);

    const reclamados = await reclamarJobsGmail({ tenantId, limite: 10 });
    expect(reclamados.map((j) => j.id)).toContain(j1?.id);
    const otraVez = await reclamarJobsGmail({ tenantId, limite: 10 });
    expect(otraVez.map((j) => j.id)).not.toContain(j1?.id);

    const job = reclamados.find((j) => j.id === j1?.id);
    if (!job) throw new Error("no se reclamó el job");
    await marcarJobGmailError({
      id: job.id,
      error: "red",
      reintentar: true,
      runAt: new Date(Date.now() + 60_000),
    });
    expect(await reclamarJobsGmail({ tenantId, limite: 10 })).toHaveLength(0);
    const despues = await reclamarJobsGmail({
      tenantId,
      limite: 10,
      ahora: new Date(Date.now() + 120_000),
    });
    expect(despues.map((j) => j.id)).toContain(job.id);
    await marcarJobGmailHecho(job.id);
  });

  it("el polling usa una clave distinta y no choca con el push", async () => {
    const connection = randomUUID();
    await encolarIngesta({
      tenantId,
      connectionId: connection,
      historyId: "100",
      motivo: "push",
    });
    const poll1 = await encolarPolling({ tenantId, connectionId: connection, cursor: "100" });
    const poll2 = await encolarPolling({ tenantId, connectionId: connection, cursor: "100" });
    expect(poll1.id).not.toBe(poll2.id);
  });

  it("lee filtros/catálogo y guarda borrador y log de forma idempotente", async () => {
    const filtros = await leerFiltrosIngesta(tenantId);
    expect(filtros.some((f) => f.remitente === "edenor.com")).toBe(true);
    const catalogo = await leerCatalogoCuentas(tenantId);
    const cuenta = catalogo.find((c) => c.emails.includes("facturas@edenor.com"));
    expect(cuenta?.proveedor).toBe("Edenor");

    const ahora = Date.UTC(2026, 9, 19);
    const input = {
      tenantId,
      connectionId,
      messageId: "msg-repo-1",
      gmailAttachmentId: "att-1",
      accountId: cuenta?.accountId ?? null,
      periodo: "2026-10",
      vencimiento: "2026-10-20",
      montoCentavos: 1234500n,
      origen: "pdf_digital" as const,
      confianzaMonto: "alta" as const,
      confianzaVencimiento: "alta" as const,
      venceEn: new Date(ahora + 7 * 86_400_000),
      recordatorioEn: new Date(ahora + 86_400_000),
    };
    const b1 = await guardarBorradorIngesta(input);
    const b2 = await guardarBorradorIngesta(input);
    expect(b1.nuevo).toBe(true);
    expect(b2).toEqual({ id: b1.id, nuevo: false });

    await registrarLogIngesta({
      tenantId,
      messageId: "msg-repo-1",
      historyId: "100",
      remitenteDominio: "edenor.com",
      decision: "para_procesar",
      motivo: "prueba",
      filtroId: null,
      accountId: input.accountId,
    });
    await registrarLogIngesta({
      tenantId,
      messageId: "msg-repo-1",
      historyId: "100",
      remitenteDominio: "edenor.com",
      decision: "para_procesar",
      motivo: "prueba",
      filtroId: null,
      accountId: input.accountId,
    });
    expect(await existeLogIngesta(tenantId, "msg-repo-1")).toBe(true);
  });

  it("ejecuta el job de punta a punta con Gmail falso y no duplica el borrador", async () => {
    const conexion = await guardarConexionGmail({
      tenantId,
      cuentaEmail: "casilla@ejemplo.com",
      scopes: ["openid", "email", "gmail.readonly"],
      refreshToken: "refresh-1",
      consentimientoVersion: "v1",
      consentidoPor: "sub-test",
      env,
    });
    const pdf = Buffer.from("%PDF-1.7 factura");
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        expect(String(init?.body)).toContain("grant_type=refresh_token");
        return Response.json({ access_token: "access-1", expires_in: 3600 });
      }
      if (url.includes("/users/me/profile")) {
        return Response.json({ emailAddress: "casilla@ejemplo.com", historyId: "100" });
      }
      if (url.includes("/users/me/messages?") && url.includes("after")) {
        return Response.json({ messages: [{ id: "m-1" }] });
      }
      if (url.includes("/users/me/messages/m-1?format=metadata")) {
        return Response.json({
          id: "m-1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [
              { name: "From", value: "Edenor <facturas@edenor.com>" },
              { name: "Subject", value: "Factura de luz" },
            ],
            parts: [
              {
                partId: "1",
                mimeType: "application/pdf",
                filename: "factura.pdf",
                body: { attachmentId: "att-1", size: pdf.length },
              },
            ],
          },
        });
      }
      if (url.includes("/users/me/messages/m-1?format=full")) {
        return Response.json({
          id: "m-1",
          payload: {
            mimeType: "multipart/mixed",
            headers: [
              { name: "From", value: "Edenor <facturas@edenor.com>" },
              { name: "Subject", value: "Factura de luz" },
            ],
            parts: [
              {
                partId: "1",
                mimeType: "application/pdf",
                filename: "factura.pdf",
                body: { attachmentId: "att-1", size: pdf.length },
              },
            ],
          },
        });
      }
      if (url.includes("/attachments/att-1")) {
        return Response.json({ data: pdf.toString("base64url") });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;

    const job = await encolarIngesta({
      tenantId,
      connectionId: conexion.id,
      historyId: "100",
      motivo: "push",
    });
    if (!job) throw new Error("no se encoló el job");
    const estado = await ejecutarJobGmail(job, {
      env,
      fetchImpl,
      ahoraMs: Date.UTC(2026, 9, 19),
      extraerPdfTexto: () => "Total $ 12.345,00 vence 20/10/2026",
    });
    expect(estado).toBe("hecho");

    const cliente = sql;
    if (!cliente) throw new Error("sin cliente de prueba");
    const [draft] = await cliente<
      { message_id: string; gmail_attachment_id: string | null; monto_centavos: string; account_id: string | null }[]
    >`
      select message_id, gmail_attachment_id, monto_centavos, account_id
      from email_ingestion_drafts
      where message_id = 'm-1'
    `;
    expect(draft?.gmail_attachment_id).toBe("att-1");
    expect(String(draft?.monto_centavos)).toBe("1234500");
    expect(draft?.account_id).toBeTruthy();

    const [conn] = await cliente<{ gmail_history_cursor: string | null }[]>`
      select gmail_history_cursor from google_connections where id = ${conexion.id}
    `;
    expect(conn?.gmail_history_cursor).toBe("100");
    const [j] = await cliente<{ estado: string }[]>`
      select estado from gmail_ingestion_jobs where id = ${job.id}
    `;
    expect(j?.estado).toBe("hecho");

    const poll = await encolarPolling({
      tenantId,
      connectionId: conexion.id,
      cursor: "100",
    });
    const fetchHistory = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "access-1", expires_in: 3600 });
      }
      if (url.includes("/users/me/history")) {
        return Response.json({
          historyId: "101",
          history: [{ messagesAdded: [{ message: { id: "m-1" } }] }],
        });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }) as typeof fetch;
    await ejecutarJobGmail(poll, { env, fetchImpl: fetchHistory, ahoraMs: Date.UTC(2026, 9, 19) });
    const [total] = await cliente<{ n: number }[]>`
      select count(*)::int as n from email_ingestion_drafts where message_id = 'm-1'
    `;
    expect(total?.n).toBe(1);
  });
});
