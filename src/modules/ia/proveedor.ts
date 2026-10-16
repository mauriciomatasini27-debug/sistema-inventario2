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

function contarTokens(texto: string): number {
  const n = texto.split(/\s+/).filter(Boolean).length;
  return Math.max(1, n);
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
