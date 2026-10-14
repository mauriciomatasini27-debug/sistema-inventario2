import { revocarDispositivo } from "./dispositivo.js";

// PWA-S5. Latido cliente del borrado remoto: POST /api/sync/heartbeat y, si
// el servidor responde wipe:true, ejecuta revocarDispositivo() (borra
// outbox+mappings+fotos+snapshot; sin base legible). Sin cifrado real: la
// garantía es el borrado de bytes, no SQLCipher ni WebCrypto.
//
// Frontera: el cuerpo JSON se valida acá (wipe booleano, resto opaco). La
// lógica interna confía en tipos. El puerto post inyectable evita fetch en
// tests y no filtra esquemas de sync a la UI.

export const LATIDO_RUTA = "/api/sync/heartbeat";

export interface LatidoCuerpo {
  device_code: string;
  pendientes: number;
  ultima_op_hlc?: string;
}

export interface LatidoRespuestaHttp {
  status: number;
  json: unknown;
}

/** Puerto HTTP inyectable: POST y devuelve estado + JSON ya parseado. */
export type LatidoPost = (url: string, cuerpo: LatidoCuerpo) => Promise<LatidoRespuestaHttp>;

export interface LatidoOpts {
  deviceCode: string;
  pendientes: number;
  ultimaOpHlc?: string;
  post?: LatidoPost;
  url?: string;
  motivo?: string;
}

export interface LatidoResultado {
  wipe: boolean;
  borrado: boolean;
  estado?: string;
  pendientes?: number;
}

function esRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function postPorFetch(url: string, cuerpo: LatidoCuerpo): Promise<LatidoRespuestaHttp> {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (!f) throw new Error("latido: sin fetch disponible para el heartbeat");
  const res = await f(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

/**
 * Late al heartbeat y ejecuta el borrado remoto si el servidor lo ordena.
 * HTTP no-ok lanza un error con el estado y no toca datos locales. La rama
 * wipe nunca lanza: el borrado es best-effort como revocarDispositivo.
 */
export async function latido(opts: LatidoOpts): Promise<LatidoResultado> {
  const post = opts.post ?? postPorFetch;
  const url = opts.url ?? LATIDO_RUTA;
  const cuerpo: LatidoCuerpo = {
    device_code: opts.deviceCode,
    pendientes: opts.pendientes,
    ...(opts.ultimaOpHlc !== undefined ? { ultima_op_hlc: opts.ultimaOpHlc } : {}),
  };
  const res = await post(url, cuerpo);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`latido: el heartbeat respondió ${res.status} para ${opts.deviceCode}`);
  }
  const j = esRegistro(res.json) ? res.json : {};
  const estado = typeof j["estado"] === "string" ? j["estado"] : undefined;
  const pendientes = typeof j["pendientes"] === "number" ? j["pendientes"] : undefined;
  if (j["wipe"] !== true) {
    return {
      wipe: false,
      borrado: false,
      ...(estado !== undefined ? { estado } : {}),
      ...(pendientes !== undefined ? { pendientes } : {}),
    };
  }
  await revocarDispositivo(opts.motivo ?? "borrado-remoto");
  return {
    wipe: true,
    borrado: true,
    ...(estado !== undefined ? { estado } : {}),
    ...(pendientes !== undefined ? { pendientes } : {}),
  };
}
