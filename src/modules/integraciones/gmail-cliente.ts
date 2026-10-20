const GMAIL_BASE = "https://gmail.googleapis.com";

export const MAX_ADJUNTO_BYTES = 10 * 1024 * 1024;

export const MIMES_COMPROBANTE = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type MimeComprobante = (typeof MIMES_COMPROBANTE)[number];

export class ErrorGmail extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorGmail";
  }
}

export class ErrorGmailTransitorio extends ErrorGmail {
  constructor(codigo: string, mensaje: string) {
    super(codigo, mensaje);
    this.name = "ErrorGmailTransitorio";
  }
}

export interface GmailPerfil {
  readonly emailAddress: string;
  readonly historyId: string;
}

export interface GmailWatch {
  readonly historyId: string;
  readonly expiration: string;
}

export interface GmailListaMensajes {
  readonly ids: ReadonlyArray<string>;
  readonly nextPageToken: string | null;
}

export interface GmailListaHistorial {
  readonly historyId: string | null;
  readonly ids: ReadonlyArray<string>;
  readonly nextPageToken: string | null;
}

export interface GmailAdjuntoRef {
  readonly partId: string;
  readonly attachmentId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface GmailMensaje {
  readonly id: string;
  readonly from: string;
  readonly subject: string;
  readonly bodyText: string | null;
  readonly adjuntos: ReadonlyArray<GmailAdjuntoRef>;
}

export interface GmailAdjunto {
  readonly bytes: Buffer;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface GmailApi {
  getProfile(): Promise<GmailPerfil>;
  watch(input: { readonly topicName: string; readonly labelIds?: ReadonlyArray<string> }): Promise<GmailWatch>;
  stop(): Promise<void>;
  listMessages(input: {
    readonly query?: string;
    readonly labelIds?: ReadonlyArray<string>;
    readonly pageToken?: string;
    readonly maxResults?: number;
  }): Promise<GmailListaMensajes>;
  listHistory(input: {
    readonly startHistoryId: string;
    readonly labelId?: string;
    readonly pageToken?: string;
    readonly maxResults?: number;
  }): Promise<GmailListaHistorial>;
  getMessage(input: { readonly id: string; readonly format: "full" | "metadata" }): Promise<GmailMensaje>;
  getAttachment(input: { readonly messageId: string; readonly attachmentId: string }): Promise<GmailAdjunto>;
}

interface PayloadGmail {
  readonly partId?: unknown;
  readonly mimeType?: unknown;
  readonly filename?: unknown;
  readonly headers?: unknown;
  readonly body?: unknown;
  readonly parts?: unknown;
}

interface BodyGmail {
  readonly data?: unknown;
  readonly attachmentId?: unknown;
  readonly size?: unknown;
}

interface MessageGmail {
  readonly id?: unknown;
  readonly payload?: unknown;
}

interface HistoryGmail {
  readonly historyId?: unknown;
  readonly history?: unknown;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : null;
}

function array(valor: unknown): ReadonlyArray<unknown> {
  return Array.isArray(valor) ? valor : [];
}

function header(headers: unknown, nombre: string): string {
  for (const h of array(headers)) {
    const o = objeto(h);
    if (!o) continue;
    const n = texto(o["name"]);
    if (n?.toLowerCase() === nombre.toLowerCase()) return texto(o["value"]) ?? "";
  }
  return "";
}

function decodificarBase64Url(valor: unknown): Buffer | null {
  if (typeof valor !== "string" || valor.length === 0) return null;
  try {
    return Buffer.from(valor, "base64url");
  } catch {
    return null;
  }
}

function sinHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function recorrerPayload(
  payload: unknown,
  acumulado: { textoPlano: string[]; html: string[]; adjuntos: GmailAdjuntoRef[] },
): void {
  const p = objeto(payload) as PayloadGmail | null;
  if (!p) return;
  const mime = (texto(p.mimeType) ?? "").toLowerCase();
  const filename = texto(p.filename) ?? "";
  const body = objeto(p.body) as BodyGmail | null;
  const attachmentId = texto(body?.attachmentId);
  const partId = texto(p.partId) ?? "";
  if (filename && attachmentId) {
    acumulado.adjuntos.push({
      partId,
      attachmentId,
      filename,
      mimeType: mime || "application/octet-stream",
      size: numero(body?.size),
    });
  } else if (mime === "text/plain") {
    const bytes = decodificarBase64Url(body?.data);
    if (bytes) acumulado.textoPlano.push(bytes.toString("utf8"));
  } else if (mime === "text/html") {
    const bytes = decodificarBase64Url(body?.data);
    if (bytes) acumulado.html.push(bytes.toString("utf8"));
  }
  for (const parte of array(p.parts)) recorrerPayload(parte, acumulado);
}

function mensajeDesdeGmail(id: string, raw: MessageGmail): GmailMensaje {
  const payload = objeto(raw.payload);
  const acumulado: { textoPlano: string[]; html: string[]; adjuntos: GmailAdjuntoRef[] } = {
    textoPlano: [],
    html: [],
    adjuntos: [],
  };
  recorrerPayload(payload, acumulado);
  const plano = acumulado.textoPlano.join("\n").trim();
  const html = acumulado.html.length > 0 ? sinHtml(acumulado.html.join("\n")) : "";
  return {
    id,
    from: header(payload?.headers, "From"),
    subject: header(payload?.headers, "Subject"),
    bodyText: plano || html || null,
    adjuntos: acumulado.adjuntos,
  };
}

export function detectarMimeComprobante(bytes: Buffer): MimeComprobante | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp") {
    const marca = bytes.subarray(8, 12).toString("ascii");
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(marca)) {
      return "image/heic";
    }
  }
  return null;
}

async function pedirJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  let r: Response;
  try {
    r = await fetchImpl(url, init);
  } catch {
    throw new ErrorGmailTransitorio("red", "No se pudo contactar a Gmail");
  }
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    if (r.ok) throw new ErrorGmail("respuesta_invalida", "Gmail devolvió una respuesta inválida");
  }
  if (!r.ok) {
    if (r.status === 404) throw new ErrorGmail("no_encontrado", "Gmail no encontró el recurso");
    if (r.status === 401) throw new ErrorGmail("no_autorizado", "Gmail rechazó el acceso");
    if (r.status === 403) throw new ErrorGmail("sin_permiso", "Gmail no autorizó el scope");
    if (r.status === 429 || r.status >= 500) {
      throw new ErrorGmailTransitorio(`http_${r.status}`, "Gmail no está disponible");
    }
    throw new ErrorGmail(`http_${r.status}`, "Gmail rechazó la operación");
  }
  return data as T;
}

export function crearClienteGmail(input: {
  readonly accessToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly baseUrl?: string;
}): GmailApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  const base = (input.baseUrl ?? GMAIL_BASE).replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${input.accessToken}` };
  const url = (ruta: string): string => `${base}${ruta}`;

  return {
    async getProfile() {
      const data = await pedirJson<Record<string, unknown>>(fetchImpl, url("/gmail/v1/users/me/profile"), { headers });
      const emailAddress = texto(data["emailAddress"]);
      const historyId = texto(data["historyId"]);
      if (!emailAddress || !historyId) {
        throw new ErrorGmail("perfil_invalido", "Gmail no devolvió el perfil");
      }
      return { emailAddress, historyId };
    },

    async watch({ topicName, labelIds }) {
      const data = await pedirJson<Record<string, unknown>>(fetchImpl, url("/gmail/v1/users/me/watch"), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName,
          ...(labelIds && labelIds.length > 0 ? { labelIds } : {}),
        }),
      });
      const historyId = texto(data["historyId"]);
      const expiration = texto(data["expiration"]);
      if (!historyId || !expiration) {
        throw new ErrorGmail("watch_invalido", "Gmail no devolvió el watch");
      }
      return { historyId, expiration };
    },

    async stop() {
      let r: Response;
      try {
        r = await fetchImpl(url("/gmail/v1/users/me/stop"), { method: "POST", headers });
      } catch {
        throw new ErrorGmailTransitorio("red", "No se pudo contactar a Gmail");
      }
      if (!r.ok && r.status !== 404 && r.status !== 401) {
        throw new ErrorGmail(`http_${r.status}`, "Gmail no detuvo el watch");
      }
    },

    async listMessages({ query, labelIds, pageToken, maxResults }) {
      const q = new URLSearchParams();
      if (query) q.set("q", query);
      for (const l of labelIds ?? []) q.append("labelIds", l);
      if (pageToken) q.set("pageToken", pageToken);
      if (maxResults) q.set("maxResults", String(maxResults));
      const data = await pedirJson<Record<string, unknown>>(
        fetchImpl,
        url(`/gmail/v1/users/me/messages?${q.toString()}`),
        { headers },
      );
      const ids: string[] = [];
      for (const m of array(data["messages"])) {
        const o = objeto(m);
        const id = texto(o?.["id"]);
        if (id) ids.push(id);
      }
      return { ids, nextPageToken: texto(data["nextPageToken"]) };
    },

    async listHistory({ startHistoryId, labelId, pageToken, maxResults }) {
      const q = new URLSearchParams({
        startHistoryId,
        historyTypes: "messageAdded",
      });
      if (labelId) q.set("labelId", labelId);
      if (pageToken) q.set("pageToken", pageToken);
      if (maxResults) q.set("maxResults", String(maxResults));
      let data: HistoryGmail;
      try {
        data = await pedirJson<HistoryGmail>(
          fetchImpl,
          url(`/gmail/v1/users/me/history?${q.toString()}`),
          { headers },
        );
      } catch (e) {
        if (e instanceof ErrorGmail && e.codigo === "no_encontrado") {
          throw new ErrorGmail("historial_vencido", "El historial de Gmail expiró");
        }
        throw e;
      }
      const ids: string[] = [];
      for (const h of array(data.history)) {
        const o = objeto(h);
        for (const m of array(o?.["messages"])) {
          const msg = objeto(m);
          const id = texto(msg?.["id"]);
          if (id) ids.push(id);
        }
        for (const m of array(o?.["messagesAdded"])) {
          const added = objeto(m);
          const msg = objeto(added?.["message"]);
          const id = texto(msg?.["id"]);
          if (id) ids.push(id);
        }
      }
      return {
        historyId: texto(data.historyId),
        ids: [...new Set(ids)],
        nextPageToken: texto(o(data).nextPageToken),
      };
    },

    async getMessage({ id, format }) {
      const data = await pedirJson<MessageGmail>(
        fetchImpl,
        url(`/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=${format}`),
        { headers },
      );
      return mensajeDesdeGmail(id, data);
    },

    async getAttachment({ messageId, attachmentId }) {
      const data = await pedirJson<Record<string, unknown>>(
        fetchImpl,
        url(
          `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
        ),
        { headers },
      );
      const bytes = decodificarBase64Url(data["data"]);
      if (!bytes) throw new ErrorGmail("adjunto_invalido", "Gmail no devolvió el adjunto");
      return {
        bytes,
        filename: "",
        mimeType: "application/octet-stream",
        size: bytes.length,
      };
    },
  };
}

function o(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : {};
}
