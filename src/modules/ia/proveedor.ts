import { leerVarEntorno } from "../../lib/env.js";

export interface MensajeLLM {
  readonly rol: "sistema" | "usuario" | "herramienta";
  readonly contenido: string;
}

export interface ResultadoLLM {
  readonly texto: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
}

export interface OpcionesCompletar {
  readonly sistema?: string | undefined;
  readonly maxTokens?: number | undefined;
}

export interface ProveedorLLM {
  completar(mensajes: readonly MensajeLLM[], opciones?: OpcionesCompletar): Promise<ResultadoLLM>;
}

export const CLAVE_LLM_ASISTENTE = "ASSISTANT_LLM_KEY";
export const BASE_URL_LLM_ASISTENTE = "ASSISTANT_LLM_BASE_URL";
export const MODELO_LLM_ASISTENTE = "ASSISTANT_LLM_MODEL";
export const BASE_URL_LLM_POR_DEFECTO = "https://api.groq.com/openai/v1";
export const MODELO_LLM_POR_DEFECTO = "llama-3.3-70b-versatile";

function contarTokens(texto: string): number {
  const n = texto.split(/\s+/).filter(Boolean).length;
  return Math.max(1, n);
}

type RolOpenAI = "system" | "user" | "assistant";

interface MensajeOpenAI {
  readonly role: RolOpenAI;
  readonly content: string;
}

interface CuerpoRespuestaOpenAI {
  readonly choices?: readonly { readonly message?: { readonly content?: unknown } | undefined }[] | undefined;
  readonly usage?:
    | { readonly prompt_tokens?: number | undefined; readonly completion_tokens?: number | undefined }
    | undefined;
}

function rol_openai(rol: MensajeLLM["rol"]): RolOpenAI {
  if (rol === "sistema") return "system";
  if (rol === "usuario") return "user";
  return "assistant";
}

export class ProveedorLLMOpenAICompat implements ProveedorLLM {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly modelo: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: { baseUrl: string; apiKey: string; modelo: string; fetch?: typeof fetch }) {
    this.baseUrl = opts.baseUrl;
    this.apiKey = opts.apiKey;
    this.modelo = opts.modelo;
    this.fetchFn = opts.fetch ?? fetch;
  }

  async completar(mensajes: readonly MensajeLLM[], opciones?: OpcionesCompletar): Promise<ResultadoLLM> {
    const lista: MensajeOpenAI[] = [];
    if (opciones?.sistema) lista.push({ role: "system", content: opciones.sistema });
    for (const m of mensajes) lista.push({ role: rol_openai(m.rol), content: m.contenido });

    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.modelo,
        messages: lista,
        ...(opciones?.maxTokens ? { max_tokens: opciones.maxTokens } : {}),
      }),
    });
    if (!res.ok) throw new Error(`llm_openai: ${res.status} ${await res.text()}`);

    const json: CuerpoRespuestaOpenAI = JSON.parse(await res.text());
    const contenido = json.choices?.[0]?.message?.content;
    if (typeof contenido !== "string") throw new Error("llm_openai: respuesta sin contenido");
    return {
      texto: contenido,
      tokensEntrada: json.usage?.prompt_tokens ?? 0,
      tokensSalida: json.usage?.completion_tokens ?? 0,
    };
  }
}

export function crear_proveedor_llm_desde_env(
  opts: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch } = {},
): ProveedorLLM {
  const env = opts.env ?? process.env;
  if (env.CONTROL_APP_DEV === "1") return new ProveedorLLMFake();
  const clave = leerVarEntorno(CLAVE_LLM_ASISTENTE, env);
  if (!clave) return new ProveedorLLMFake();
  return new ProveedorLLMOpenAICompat({
    baseUrl: leerVarEntorno(BASE_URL_LLM_ASISTENTE, env) || BASE_URL_LLM_POR_DEFECTO,
    apiKey: clave,
    modelo: leerVarEntorno(MODELO_LLM_ASISTENTE, env) || MODELO_LLM_POR_DEFECTO,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
}

export class ProveedorLLMFake implements ProveedorLLM {
  llamadas = 0;
  constructor(private readonly fijo?: { texto: string }) {}

  async completar(mensajes: readonly MensajeLLM[]): Promise<ResultadoLLM> {
    this.llamadas += 1;
    const entrada = mensajes.map((m) => m.contenido).join("\n");
    const texto = this.fijo?.texto ?? `FAKE ${entrada}`;
    return { texto, tokensEntrada: contarTokens(entrada), tokensSalida: contarTokens(texto) };
  }
}
