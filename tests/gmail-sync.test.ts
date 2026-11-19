import { describe, expect, it } from "vitest";
import {
  ErrorGmail,
  type GmailAdjuntoRef,
  type GmailApi,
  type GmailMensaje,
} from "../src/modules/integraciones/gmail-cliente.js";
import {
  sincronizarGmail,
  type BorradorSync,
  type PersistenciaGmail,
} from "../src/modules/integraciones/gmail-sync.js";
import type { CuentaCatalogo, FiltroIngesta, LogIngesta } from "../src/modules/utilities/ingesta_gmail.js";

const FILTRO: FiltroIngesta = {
  id: "f-1",
  remitente: "edenor.com",
  keywords: ["factura"],
  activo: true,
};

const CATALOGO: CuentaCatalogo = {
  accountId: "cuenta-1",
  servicio: "luz",
  proveedor: "Edenor",
  emails: ["facturas@edenor.com"],
};

function mensaje(input: {
  id: string;
  from?: string;
  subject?: string;
  bodyText?: string | null;
  adjuntos?: ReadonlyArray<GmailAdjuntoRef>;
}): GmailMensaje {
  return {
    id: input.id,
    from: input.from ?? "Edenor <facturas@edenor.com>",
    subject: input.subject ?? "Factura de luz",
    bodyText: input.bodyText ?? null,
    adjuntos: input.adjuntos ?? [],
  };
}

function adjunto(id: string, mime = "application/pdf"): GmailAdjuntoRef {
  return {
    partId: id,
    attachmentId: id,
    filename: `${id}.pdf`,
    mimeType: mime,
    size: 20,
  };
}

function persistencia(seed: ReadonlyArray<string> = []) {
  const logs = new Set(seed);
  const drafts: BorradorSync[] = [];
  const registros: LogIngesta[] = [];
  let cursor: string | null = null;
  const p: PersistenciaGmail = {
    existeLog: async (messageId) => logs.has(messageId),
    registrarLog: async (log) => {
      if (logs.has(log.messageId)) return;
      logs.add(log.messageId);
      registros.push(log);
    },
    guardarBorrador: async (borrador) => {
      const existente = drafts.find((d) => d.messageId === borrador.messageId);
      if (existente) return { id: existente.messageId, nuevo: false };
      drafts.push(borrador);
      return { id: borrador.messageId, nuevo: true };
    },
    avanzarCursor: async (nuevo) => {
      cursor = nuevo;
    },
  };
  return {
    persistencia: p,
    drafts,
    registros,
    get cursor() {
      return cursor;
    },
  };
}

function fakeGmail(input: {
  profile?: string;
  initial?: ReadonlyArray<string>;
  history?: ReadonlyArray<string>;
  historyCursor?: string;
  expired?: boolean;
  messages?: Record<string, GmailMensaje>;
  attachments?: Record<string, Buffer>;
  calls?: { listMessages: number; listHistory: number; getAttachment: number; formatos?: string[] };
}): GmailApi {
  const calls = input.calls ?? { listMessages: 0, listHistory: 0, getAttachment: 0 };
  return {
    async getProfile() {
      return { emailAddress: "casilla@ejemplo.com", historyId: input.profile ?? "100" };
    },
    async watch() {
      return { historyId: "100", expiration: "1792000000000" };
    },
    async stop() {},
    async listMessages() {
      calls.listMessages++;
      return { ids: input.initial ?? [], nextPageToken: null };
    },
    async listHistory() {
      calls.listHistory++;
      if (input.expired) throw new ErrorGmail("historial_vencido", "vencido");
      return {
        historyId: input.historyCursor ?? "101",
        ids: input.history ?? [],
        nextPageToken: null,
      };
    },
    async getMessage({ id, format }) {
      calls.formatos?.push(format);
      const m = input.messages?.[id];
      if (!m) throw new ErrorGmail("no_encontrado", "sin mensaje");
      return m;
    },
    async getAttachment({ attachmentId }) {
      calls.getAttachment++;
      const bytes = input.attachments?.[attachmentId];
      if (!bytes) throw new ErrorGmail("no_encontrado", "sin adjunto");
      return { bytes, filename: "", mimeType: "application/octet-stream", size: bytes.length };
    },
  };
}

const PDF = Buffer.from("%PDF-1.7 factura");

describe("sincronización de Gmail", () => {
  it("en la primera corrida procesa la ventana y fija el cursor del perfil", async () => {
    const p = persistencia();
    const r = await sincronizarGmail({
      gmail: fakeGmail({
        profile: "100",
        initial: ["m1"],
        messages: {
          m1: mensaje({ id: "m1", adjuntos: [adjunto("att-1")] }),
        },
        attachments: { "att-1": PDF },
      }),
      connectionId: "conn-1",
      cursor: null,
      filtros: [FILTRO],
      catalogo: [CATALOGO],
      ahoraMs: Date.UTC(2026, 9, 19),
      extraerPdfTexto: () => "Total $ 12.345,00 vence 20/10/2026",
      persistencia: p.persistencia,
    });
    expect(r).toMatchObject({ cursor: "100", procesados: 1, borradores: 1, recuperados: false });
    expect(p.drafts).toHaveLength(1);
    expect(p.drafts[0]).toMatchObject({
      connectionId: "conn-1",
      messageId: "m1",
      gmailAttachmentId: "att-1",
      accountId: "cuenta-1",
      periodo: "2026-10",
      vencimiento: "2026-10-20",
      montoCentavos: 1_234_500n,
      origen: "pdf_digital",
    });
    expect(p.cursor).toBe("100");
  });

  it("no reprocesa un mensaje ya logueado y avanza el cursor", async () => {
    const p = persistencia(["m1"]);
    const calls = { listMessages: 0, listHistory: 0, getAttachment: 0 };
    const r = await sincronizarGmail({
      gmail: fakeGmail({ history: ["m1"], historyCursor: "101", calls }),
      connectionId: "conn-1",
      cursor: "100",
      filtros: [FILTRO],
      catalogo: [CATALOGO],
      ahoraMs: Date.UTC(2026, 9, 19),
      persistencia: p.persistencia,
    });
    expect(r).toMatchObject({ procesados: 0, borradores: 0, ignorados: 1 });
    expect(calls.getAttachment).toBe(0);
    expect(p.drafts).toHaveLength(0);
    expect(p.cursor).toBe("101");
  });

  it("si el historial venció recupera 30 días y lo informa", async () => {
    const p = persistencia();
    const r = await sincronizarGmail({
      gmail: fakeGmail({
        expired: true,
        profile: "200",
        initial: ["m2"],
        messages: { m2: mensaje({ id: "m2", adjuntos: [adjunto("att-2")] }) },
        attachments: { "att-2": PDF },
      }),
      connectionId: "conn-1",
      cursor: "100",
      filtros: [FILTRO],
      catalogo: [CATALOGO],
      ahoraMs: Date.UTC(2026, 9, 19),
      extraerPdfTexto: () => "Total $ 1.000,00 vence 20/10/2026",
      persistencia: p.persistencia,
    });
    expect(r).toMatchObject({ recuperados: true, cursor: "200", borradores: 1 });
    expect(p.cursor).toBe("200");
  });

  it("ignora un remitente sin filtro sin descargar adjuntos", async () => {
    const p = persistencia();
    const calls = { listMessages: 0, listHistory: 0, getAttachment: 0 };
    const r = await sincronizarGmail({
      gmail: fakeGmail({
        history: ["m3"],
        messages: { m3: mensaje({ id: "m3", from: "otro@desconocido.com", adjuntos: [adjunto("att-3")] }) },
        calls,
      }),
      connectionId: "conn-1",
      cursor: "100",
      filtros: [FILTRO],
      catalogo: [CATALOGO],
      ahoraMs: Date.UTC(2026, 9, 19),
      persistencia: p.persistencia,
    });
    expect(r).toMatchObject({ borradores: 0, ignorados: 1 });
    expect(calls.getAttachment).toBe(0);
    expect(p.registros[0]).toMatchObject({ decision: "ignorar", motivo: "remitente sin filtro activo" });
  });

  it("usa el cuerpo como respaldo cuando no hay adjunto", async () => {
    const p = persistencia();
    const r = await sincronizarGmail({
      gmail: fakeGmail({
        history: ["m4"],
        messages: {
          m4: mensaje({
            id: "m4",
            bodyText: "Factura Total $ 2.500,00 vence 21/10/2026",
          }),
        },
      }),
      connectionId: "conn-1",
      cursor: "100",
      filtros: [FILTRO],
      catalogo: [CATALOGO],
      ahoraMs: Date.UTC(2026, 9, 19),
      persistencia: p.persistencia,
    });
    expect(r.borradores).toBe(1);
    expect(p.drafts[0]).toMatchObject({
      origen: "email_respaldo",
      montoCentavos: 250_000n,
      vencimiento: "2026-10-21",
      confianzaMonto: "baja",
      confianzaVencimiento: "baja",
      pideRevision: true,
      gmailAttachmentId: null,
    });
    expect(p.drafts[0]?.comprobanteCuerpo?.mime).toBe("image/png");
    expect(p.drafts[0]?.comprobanteCuerpo?.bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(p.drafts[0]?.comprobanteCuerpo?.texto).toContain("2.500,00");
  });

  it("sin adjunto y remitente filtrado arma borrador de cuerpo en revisión", async () => {
    const p = persistencia();
    const formatos: string[] = [];
    const llamadas: string[] = [];
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      llamadas.push(String(input));
      throw new Error("no se debe pedir la red");
    }) as typeof fetch;
    const cuerpo = [
      "<script>Total $ 9.999,00 01/01/2020</script>",
      "<form action=\"https://micuenta.edenor.com/login\">",
      "<input type=\"password\" value=\"clave-secreta-ggl-s10b\">",
      "clave-visible-login",
      "</form>",
      "Total $ 2.500,00 21/10/2026",
      "https://micuenta.edenor.com/login?monto=2500,00&vence=21/10/2026",
    ].join(" ");
    try {
      const r = await sincronizarGmail({
        gmail: fakeGmail({
          history: ["m-cuerpo"],
          messages: {
            "m-cuerpo": mensaje({
              id: "m-cuerpo",
              subject: "Aviso de servicio",
              bodyText: cuerpo,
            }),
          },
          calls: { listMessages: 0, listHistory: 0, getAttachment: 0, formatos },
        }),
        connectionId: "conn-1",
        cursor: "100",
        filtros: [FILTRO],
        catalogo: [CATALOGO],
        ahoraMs: Date.UTC(2026, 9, 19),
        persistencia: p.persistencia,
      });
      expect(r.borradores).toBe(1);
      expect(llamadas).toEqual([]);
      expect(formatos).toEqual(["metadata", "full"]);
      expect(p.drafts[0]).toMatchObject({
        origen: "email_respaldo",
        montoCentavos: 250_000n,
        vencimiento: "2026-10-21",
        confianzaMonto: "baja",
        confianzaVencimiento: "baja",
        pideRevision: true,
        gmailAttachmentId: null,
      });
      const png = p.drafts[0]?.comprobanteCuerpo;
      expect(png?.mime).toBe("image/png");
      expect(png?.texto).toContain("2.500,00");
      expect(png?.texto).not.toContain("micuenta.edenor.com");
      expect(png?.texto).not.toContain("clave-secreta-ggl-s10b");
      expect(png?.texto).not.toContain("clave-visible-login");
      expect(png?.texto).not.toContain("9.999,00");
      expect(png?.bytes.toString("latin1")).not.toContain("micuenta.edenor.com");
      expect(png?.bytes.toString("latin1")).not.toContain("clave-secreta-ggl-s10b");
      expect(p.registros[0]?.motivo).not.toContain("micuenta.edenor.com");
      expect(p.registros[0]?.motivo).not.toContain("2.500");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("un remitente no filtrado no procesa el cuerpo", async () => {
    const p = persistencia();
    const formatos: string[] = [];
    const calls = { listMessages: 0, listHistory: 0, getAttachment: 0, formatos };
    const r = await sincronizarGmail({
      gmail: fakeGmail({
        history: ["m-otro"],
        messages: {
          "m-otro": mensaje({
            id: "m-otro",
            from: "otro@desconocido.com",
            subject: "Factura Total $ 2.500,00 vence 21/10/2026",
            bodyText: "Factura Total $ 2.500,00 vence 21/10/2026 https://micuenta.edenor.com/login",
          }),
        },
        calls,
      }),
      connectionId: "conn-1",
      cursor: "100",
      filtros: [FILTRO],
      catalogo: [CATALOGO],
      ahoraMs: Date.UTC(2026, 9, 19),
      persistencia: p.persistencia,
    });
    expect(r).toMatchObject({ borradores: 0, ignorados: 1 });
    expect(p.drafts).toHaveLength(0);
    expect(formatos).toEqual(["metadata"]);
    expect(calls.getAttachment).toBe(0);
    expect(p.registros[0]).toMatchObject({ decision: "ignorar", motivo: "remitente sin filtro activo" });
  });

  it("con varios adjuntos usa el primero válido", async () => {
    const p = persistencia();
    const calls = { listMessages: 0, listHistory: 0, getAttachment: 0 };
    await sincronizarGmail({
      gmail: fakeGmail({
        history: ["m5"],
        messages: {
          m5: mensaje({
            id: "m5",
            adjuntos: [adjunto("roto", "text/plain"), adjunto("valido")],
          }),
        },
        attachments: { roto: Buffer.from("no"), valido: PDF },
        calls,
      }),
      connectionId: "conn-1",
      cursor: "100",
      filtros: [FILTRO],
      catalogo: [CATALOGO],
      ahoraMs: Date.UTC(2026, 9, 19),
      extraerPdfTexto: () => "Total $ 3.000,00 vence 22/10/2026",
      persistencia: p.persistencia,
    });
    expect(calls.getAttachment).toBe(2);
    expect(p.drafts[0]?.gmailAttachmentId).toBe("valido");
  });
});
