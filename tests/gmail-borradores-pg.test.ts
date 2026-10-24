import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { guardarBorradorIngesta, registrarLogIngesta } from "../src/lib/repos/gmail-ingesta.js";
import {
  confirmarBorradorGmail,
  descartarBorradorGmail,
  listarBorradoresPendientes,
} from "../src/lib/repos/gmail-borradores.js";
import { borradorDeCuerpo } from "../src/modules/utilities/cuerpo-factura.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);

describe.skipIf(!hayPG)("borradores Gmail: confirmar y descartar", () => {
  let sql: ReturnType<typeof postgres> | null = null;
  let tenantId = "";
  let accountId = "";
  const ahora = Date.UTC(2026, 9, 19);
  const venceEn = new Date(Date.UTC(2026, 9, 26));
  const recordatorioEn = new Date(Date.UTC(2026, 9, 20));

  const cliente = (): ReturnType<typeof postgres> => {
    if (!sql) throw new Error("sin cliente de prueba");
    return sql;
  };

  beforeAll(async () => {
    const url = await asegurarBasePrivada("gmail_borradores_pg", URL_A!);
    process.env.CONTROL_DATABASE_URL = url;
    process.env.TENANT_DATABASE_URL = url;
    delete process.env.TENANT_MODE;

    sql = postgres(url, { max: 1 });
    const [tenant] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, plan)
      values ('Gmail borradores', ${`gmail-borradores-${randomUUID().slice(0, 8)}`}, 'demo')
      returning id
    `;
    if (!tenant) throw new Error("no se creó el tenant");
    tenantId = tenant.id;
    const [cuenta] = await sql<{ id: string }[]>`
      insert into service_accounts (servicio, proveedor, titular, activa)
      values ('luz', 'Edenor', 'Titular', true)
      returning id
    `;
    if (!cuenta) throw new Error("no se creó la cuenta");
    accountId = cuenta.id;
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_DATABASE_URL;
  });

  it("lista el borrador pendiente y confirma la factura una sola vez", async () => {
    const messageId = `msg-confirmar-${randomUUID()}`;
    const { id: draftId } = await guardarBorradorIngesta({
      tenantId,
      connectionId: randomUUID(),
      messageId,
      gmailAttachmentId: "att-1",
      accountId,
      periodo: "2026-10",
      vencimiento: "2026-10-20",
      montoCentavos: 123450n,
      origen: "pdf_digital",
      confianzaMonto: "alta",
      confianzaVencimiento: "alta",
      venceEn,
      recordatorioEn,
    });
    await registrarLogIngesta({
      tenantId,
      messageId,
      historyId: "100",
      remitenteDominio: "edenor.com",
      decision: "para_procesar",
      motivo: "prueba",
      filtroId: null,
      accountId,
    });

    const pendientes = await listarBorradoresPendientes(tenantId, new Date(ahora));
    const borrador = pendientes.find((b) => b.id === draftId);
    expect(borrador?.remitenteDominio).toBe("edenor.com");
    expect(borrador?.montoCentavos).toBe(123450n);
    expect(borrador?.vencido).toBe(false);

    const r = await confirmarBorradorGmail({ tenantId, draftId, ahora: new Date(ahora) });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("no se confirmó");
    expect(r.creado).toBe(true);
    expect(r.billId).toBeTruthy();

    const q = cliente();
    const [factura] = await q<
      {
        account_id: string;
        message_id: string;
        periodo: string;
        vencimiento: string;
        monto_centavos: string;
        canal: string;
        gmail_attachment_id: string | null;
        origen: string;
      }[]
    >`
      select account_id, message_id, periodo, vencimiento, monto_centavos, canal, gmail_attachment_id, origen
      from utility_bills
      where message_id = ${messageId}
    `;
    expect(factura).toMatchObject({
      account_id: accountId,
      message_id: messageId,
      periodo: "2026-10",
      vencimiento: "2026-10-20",
      canal: "gmail",
      gmail_attachment_id: "att-1",
      origen: "pdf_digital",
    });
    expect(String(factura?.monto_centavos)).toBe("123450");

    const [guardado] = await q<{ estado: string }[]>`
      select estado from email_ingestion_drafts where id = ${draftId}
    `;
    expect(guardado?.estado).toBe("confirmado");

    const otra = await confirmarBorradorGmail({ tenantId, draftId, ahora: new Date(ahora) });
    expect(otra).toMatchObject({ ok: false, codigo: "YA_RESUELTO", status: 409 });
  });

  it("sin cuenta falla y con cuenta elegida confirma", async () => {
    const messageId = `msg-sin-cuenta-${randomUUID()}`;
    const { id: draftId } = await guardarBorradorIngesta({
      tenantId,
      connectionId: randomUUID(),
      messageId,
      gmailAttachmentId: null,
      accountId: null,
      periodo: "2026-10",
      vencimiento: "2026-10-21",
      montoCentavos: 500000n,
      origen: "ocr",
      confianzaMonto: "media",
      confianzaVencimiento: "media",
      venceEn,
      recordatorioEn,
    });

    const sinCuenta = await confirmarBorradorGmail({ tenantId, draftId, ahora: new Date(ahora) });
    expect(sinCuenta).toMatchObject({ ok: false, codigo: "SIN_CUENTA", status: 422 });

    const conCuenta = await confirmarBorradorGmail({
      tenantId,
      draftId,
      accountId,
      ahora: new Date(ahora),
    });
    expect(conCuenta).toMatchObject({ ok: true, creado: true });

    const q = cliente();
    const [factura] = await q<{ account_id: string }[]>`
      select account_id from utility_bills where message_id = ${messageId}
    `;
    expect(factura?.account_id).toBe(accountId);
  });

  it("usa los overrides de monto, vencimiento y período", async () => {
    const messageId = `msg-overrides-${randomUUID()}`;
    const { id: draftId } = await guardarBorradorIngesta({
      tenantId,
      connectionId: randomUUID(),
      messageId,
      gmailAttachmentId: null,
      accountId,
      periodo: null,
      vencimiento: null,
      montoCentavos: null,
      origen: "email_respaldo",
      confianzaMonto: "baja",
      confianzaVencimiento: "baja",
      venceEn,
      recordatorioEn,
    });

    const r = await confirmarBorradorGmail({
      tenantId,
      draftId,
      montoCentavos: 999900n,
      vencimiento: "2026-11-05",
      periodo: "2026-11",
      ahora: new Date(ahora),
    });
    expect(r).toMatchObject({ ok: true, creado: true });

    const q = cliente();
    const [factura] = await q<
      { monto_centavos: string; vencimiento: string; periodo: string }[]
    >`
      select monto_centavos, vencimiento, periodo from utility_bills where message_id = ${messageId}
    `;
    expect(String(factura?.monto_centavos)).toBe("999900");
    expect(factura?.vencimiento).toBe("2026-11-05");
    expect(factura?.periodo).toBe("2026-11");
  });

  it("un borrador vencido no confirma, queda vencido y no se descarta", async () => {
    const messageId = `msg-vencido-${randomUUID()}`;
    const { id: draftId } = await guardarBorradorIngesta({
      tenantId,
      connectionId: randomUUID(),
      messageId,
      gmailAttachmentId: null,
      accountId,
      periodo: "2026-09",
      vencimiento: "2026-09-30",
      montoCentavos: 700000n,
      origen: "pdf_digital",
      confianzaMonto: "alta",
      confianzaVencimiento: "alta",
      venceEn: new Date(Date.UTC(2026, 9, 20)),
      recordatorioEn,
    });

    const r = await confirmarBorradorGmail({
      tenantId,
      draftId,
      ahora: new Date(Date.UTC(2026, 10, 1)),
    });
    expect(r).toMatchObject({ ok: false, codigo: "VENCIDO", status: 410 });

    const q = cliente();
    const [guardado] = await q<{ estado: string }[]>`
      select estado from email_ingestion_drafts where id = ${draftId}
    `;
    expect(guardado?.estado).toBe("vencido");

    const descarte = await descartarBorradorGmail({ tenantId, draftId });
    expect(descarte).toMatchObject({ ok: false, codigo: "YA_RESUELTO", status: 409 });
  });

  it("descarta una vez y luego responde sin crear otra vez", async () => {
    const messageId = `msg-descartar-${randomUUID()}`;
    const { id: draftId } = await guardarBorradorIngesta({
      tenantId,
      connectionId: randomUUID(),
      messageId,
      gmailAttachmentId: null,
      accountId,
      periodo: "2026-10",
      vencimiento: "2026-10-25",
      montoCentavos: 800000n,
      origen: "ocr",
      confianzaMonto: "media",
      confianzaVencimiento: "media",
      venceEn,
      recordatorioEn,
    });

    const primero = await descartarBorradorGmail({ tenantId, draftId });
    expect(primero).toEqual({ ok: true, creado: true });
    const segundo = await descartarBorradorGmail({ tenantId, draftId });
    expect(segundo).toEqual({ ok: true, creado: false });

    const r = await confirmarBorradorGmail({ tenantId, draftId, ahora: new Date(ahora) });
    expect(r).toMatchObject({ ok: false, codigo: "YA_RESUELTO", status: 409 });
  });

  it("persiste la imagen del cuerpo y la devuelve pidiendo revisión", async () => {
    const deCuerpo = borradorDeCuerpo("Total $ 2.500,00 21/10/2026");
    if (!deCuerpo) throw new Error("sin borrador de cuerpo");
    const messageId = `msg-cuerpo-${randomUUID()}`;
    const { id: draftId } = await guardarBorradorIngesta({
      tenantId,
      connectionId: randomUUID(),
      messageId,
      gmailAttachmentId: null,
      accountId,
      periodo: "2026-10",
      vencimiento: deCuerpo.vencimientoIso,
      montoCentavos: deCuerpo.montoCentavos,
      origen: deCuerpo.origen,
      confianzaMonto: deCuerpo.confianzaMonto,
      confianzaVencimiento: deCuerpo.confianzaVencimiento,
      venceEn,
      recordatorioEn,
      pideRevision: true,
      comprobanteCuerpo: deCuerpo.comprobante,
    });
    const pendientes = await listarBorradoresPendientes(tenantId, new Date(ahora));
    const borrador = pendientes.find((b) => b.id === draftId);
    expect(borrador?.pideRevision).toBe(true);
    expect(borrador?.confianzaMonto).toBe("baja");
    expect(borrador?.confianzaVencimiento).toBe("baja");
    expect(borrador?.comprobanteCuerpo?.bytes.equals(deCuerpo.comprobante.bytes)).toBe(true);
  });
});
