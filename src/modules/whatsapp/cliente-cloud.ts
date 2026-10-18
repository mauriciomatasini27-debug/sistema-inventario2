import { API_VERSION_DEFECTO, type PayloadEnvio } from "./envio.js";
import { MAX_BYTES_IMAGEN, type ImagenOcr } from "../ocr/imagen.js";

// Adaptador Cloud API (único con IO de red). Fetch inyectable para tests;
// nunca lanza: el webhook siempre responde 200 aunque el envío falle
// (Meta reintentaría el webhook ante un 5xx).

export type FetchEnvio = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type ResultadoEnvio =
  | { readonly ok: true; readonly wamid: string }
  | { readonly ok: false; readonly codigo: "red" | "rechazado" | "respuesta_invalida" };

export function endpoint_envio(apiVersion: string, phoneNumberId: string): string {
  return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
}

function es_transitorio(status: number): boolean {
  return status >= 500 || status === 429;
}

async function intentar(
  fetchFn: FetchEnvio,
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchFn(url, { method: "POST", headers, body, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function wamid_de(respuesta: unknown): string | null {
  try {
    const r = respuesta as { messages?: Array<{ id?: string }> };
    const id = r.messages?.[0]?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// Un solo reintento ante timeout/red/5xx con el mismo body (el dedup por
// wamid entrante evita el doble envío desde la ruta).
export async function enviar_whatsapp(opts: {
  phoneNumberId: string;
  token: string;
  toE164: string;
  payload: PayloadEnvio;
  fetchFn?: FetchEnvio | undefined;
  apiVersion?: string | undefined;
  timeoutMs?: number | undefined;
}): Promise<ResultadoEnvio> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchEnvio);
  const url = endpoint_envio(opts.apiVersion ?? API_VERSION_DEFECTO, opts.phoneNumberId);
  const headers = { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" };
  const body = JSON.stringify({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: opts.toE164,
    ...opts.payload,
  });
  const timeoutMs = opts.timeoutMs ?? 5000;
  for (let intento = 0; intento < 2; intento++) {
    let res: { ok: boolean; status: number; json(): Promise<unknown> };
    try {
      res = await intentar(fetchFn, url, headers, body, timeoutMs);
    } catch {
      if (intento === 0) continue;
      return { ok: false, codigo: "red" };
    }
    if (res.ok) {
      const cuerpo = await res.json().catch((error: unknown) => {
        console.warn("[whatsapp] respuesta 2xx sin JSON", { status: res.status, error });
        return null;
      });
      const wamid = wamid_de(cuerpo);
      return wamid ? { ok: true, wamid } : { ok: false, codigo: "respuesta_invalida" };
    }
    if (es_transitorio(res.status) && intento === 0) continue;
    return { ok: false, codigo: es_transitorio(res.status) ? "red" : "rechazado" };
  }
  return { ok: false, codigo: "red" };
}

// Marca leído best-effort (nunca lanza, sin reintento).
export async function marcar_leido(opts: {
  phoneNumberId: string;
  token: string;
  wamidEntrante: string;
  fetchFn?: FetchEnvio | undefined;
  apiVersion?: string | undefined;
  timeoutMs?: number | undefined;
}): Promise<void> {
  const fetchFn = opts.fetchFn ?? (fetch as unknown as FetchEnvio);
  const url = endpoint_envio(opts.apiVersion ?? API_VERSION_DEFECTO, opts.phoneNumberId);
  const body = JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: opts.wamidEntrante });
  try {
    await intentar(
      fetchFn,
      url,
      { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body,
      opts.timeoutMs ?? 5000,
    );
  } catch {
    // Best-effort: el leído no bloquea la respuesta.
  }
}

// Descarga el media de la Cloud API (dos saltos: metadata y binario) y lo
// entrega como bytes para el motor OCR. Nunca lanza: cualquier fallo devuelve
// null. El token viaja solo en el header Bearer y nunca se devuelve.
export async function descargar_media(opts: {
  idMedia: string;
  token: string;
  apiVersion?: string | undefined;
  timeoutMs?: number | undefined;
  fetchFn?: typeof fetch | undefined;
}): Promise<ImagenOcr | null> {
  try {
    const f = opts.fetchFn ?? fetch;
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const auth = { Authorization: `Bearer ${opts.token}` };
    const metadata = await f(
      `https://graph.facebook.com/${opts.apiVersion ?? API_VERSION_DEFECTO}/${opts.idMedia}`,
      { headers: auth, signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!metadata.ok) return null;
    const info = (await metadata.json()) as { url?: unknown; mime_type?: unknown };
    if (typeof info.url !== "string" || info.url.length === 0) return null;
    if (new URL(info.url).protocol !== "https:") return null;
    const binRes = await f(info.url, { headers: auth, signal: AbortSignal.timeout(timeoutMs) });
    if (!binRes.ok) return null;
    const declarado = Number(binRes.headers.get("content-length") ?? "");
    if (Number.isFinite(declarado) && declarado > MAX_BYTES_IMAGEN) return null;
    const bytes = new Uint8Array(await binRes.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES_IMAGEN) return null;
    const mimeType = typeof info.mime_type === "string" && info.mime_type.length > 0 ? info.mime_type : "application/octet-stream";
    return { bytes, mimeType };
  } catch (e) {
    console.warn("[whatsapp] no se pudo descargar el media", e);
    return null;
  }
}
