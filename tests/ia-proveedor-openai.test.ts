import { describe, expect, it } from "vitest";
import {
  ProveedorLLMFake,
  ProveedorLLMOpenAICompat,
  crear_proveedor_llm_desde_env,
} from "../src/modules/ia/proveedor.js";

interface Captura {
  url: string | undefined;
  method: string | undefined;
  authorization: string | undefined;
  body: unknown;
}

function capturar(responder: () => Response): { fetchFalso: typeof fetch; capturado: Captura } {
  const capturado: Captura = { url: undefined, method: undefined, authorization: undefined, body: undefined };
  const fetchFalso: typeof fetch = async (input, init) => {
    capturado.url = String(input);
    capturado.method = init?.method;
    capturado.authorization = new Headers(init?.headers).get("authorization") ?? undefined;
    capturado.body = JSON.parse(String(init?.body));
    return responder();
  };
  return { fetchFalso, capturado };
}

describe("ProveedorLLMOpenAICompat", () => {
  it("arma el request a chat/completions y devuelve texto y tokens", async () => {
    const { fetchFalso, capturado } = capturar(
      () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "hola" } }],
            usage: { prompt_tokens: 7, completion_tokens: 3 },
          }),
          { status: 200 },
        ),
    );
    const proveedor = new ProveedorLLMOpenAICompat({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "test-key",
      modelo: "llama-3.3-70b-versatile",
      fetch: fetchFalso,
    });

    const resultado = await proveedor.completar([
      { rol: "sistema", contenido: "sos un asistente" },
      { rol: "usuario", contenido: "cuánto vendí hoy" },
      { rol: "herramienta", contenido: "total 100" },
    ]);

    expect(capturado.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(capturado.method).toBe("POST");
    expect(capturado.authorization).toBe("Bearer test-key");
    expect(capturado.body).toEqual({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "sos un asistente" },
        { role: "user", content: "cuánto vendí hoy" },
        { role: "assistant", content: "total 100" },
      ],
    });
    expect(resultado).toEqual({ texto: "hola", tokensEntrada: 7, tokensSalida: 3 });
  });

  it("antepone el system y manda max_tokens cuando se piden", async () => {
    const { fetchFalso, capturado } = capturar(
      () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    const proveedor = new ProveedorLLMOpenAICompat({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "test-key",
      modelo: "llama-3.3-70b-versatile",
      fetch: fetchFalso,
    });

    await proveedor.completar([{ rol: "usuario", contenido: "hola" }], { sistema: "se breve", maxTokens: 42 });

    expect(capturado.body).toMatchObject({
      messages: [
        { role: "system", content: "se breve" },
        { role: "user", content: "hola" },
      ],
      max_tokens: 42,
    });
  });

  it("lanza cuando la respuesta no es ok", async () => {
    const { fetchFalso } = capturar(() => new Response("rate limited", { status: 429 }));
    const proveedor = new ProveedorLLMOpenAICompat({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "test-key",
      modelo: "llama-3.3-70b-versatile",
      fetch: fetchFalso,
    });

    await expect(proveedor.completar([{ rol: "usuario", contenido: "hola" }])).rejects.toThrow(/429/);
  });

  it("lanza cuando la respuesta no trae contenido", async () => {
    const { fetchFalso } = capturar(() => new Response(JSON.stringify({ choices: [{}] }), { status: 200 }));
    const proveedor = new ProveedorLLMOpenAICompat({
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "test-key",
      modelo: "llama-3.3-70b-versatile",
      fetch: fetchFalso,
    });

    await expect(proveedor.completar([{ rol: "usuario", contenido: "hola" }])).rejects.toThrow();
  });
});

describe("crear_proveedor_llm_desde_env", () => {
  it("sin clave devuelve el fake", () => {
    expect(crear_proveedor_llm_desde_env({ env: {} })).toBeInstanceOf(ProveedorLLMFake);
  });

  it("con clave usa el proveedor OpenAI-compatible y el fetch inyectado", async () => {
    const { fetchFalso, capturado } = capturar(
      () => new Response(JSON.stringify({ choices: [{ message: { content: "hola" } }] }), { status: 200 }),
    );
    const proveedor = crear_proveedor_llm_desde_env({
      env: { ASSISTANT_LLM_KEY: "k" } as NodeJS.ProcessEnv,
      fetch: fetchFalso,
    });

    expect(proveedor).not.toBeInstanceOf(ProveedorLLMFake);
    const resultado = await proveedor.completar([{ rol: "usuario", contenido: "hola" }]);

    expect(capturado.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(capturado.body).toMatchObject({ model: "llama-3.3-70b-versatile" });
    expect(resultado.texto).toBe("hola");
  });
});
