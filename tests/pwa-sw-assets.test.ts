import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ORIGIN = "https://inventario.com.ar";

type Handler = (event: {
  data?: unknown;
  waitUntil?: (promise: Promise<unknown>) => void;
}) => void;

interface RespuestaFalsa {
  ok: boolean;
  redirected: boolean;
  headers?: Headers;
}

function cargarSW() {
  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  const handlers = new Map<string, Handler>();
  const puestos: Array<{ url: string; vary: string | null }> = [];
  const buscados: string[] = [];
  const respuestas = new Map<string, RespuestaFalsa>();
  const remotas = new Map<string, RespuestaFalsa>();
  const cache = {
    match: async (url: string) => respuestas.get(url),
    put: async (url: string, response: { headers?: Headers }) => {
      puestos.push({ url, vary: response.headers?.get("vary") ?? null });
    },
  };
  const context = {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (tipo: string, fn: Handler) => handlers.set(tipo, fn),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async () => undefined,
    },
    fetch: async (url: string) => {
      buscados.push(url);
      return (
        remotas.get(url) ??
        respuestas.get(url) ?? {
          ok: true,
          redirected: false,
          status: 200,
          statusText: "OK",
          body: null,
          headers: new Headers({ vary: "Origin" }),
        }
      );
    },
    URL,
    Headers,
    Response,
    Set,
    Promise,
    console,
  };
  vm.runInNewContext(source, context);
  return { handlers, puestos, buscados, respuestas, remotas };
}

async function enviar(handler: Handler | undefined, data: unknown) {
  let tarea: Promise<unknown> | undefined;
  handler?.({ data, waitUntil: (promise) => (tarea = promise) });
  await tarea;
}

describe("SW PWA-S2b: assets de la página para abrir /venta directo sin red", () => {
  it("cachea scripts y estilos same-origin que le pasa la página", async () => {
    const { handlers, puestos, buscados } = cargarSW();
    await enviar(handlers.get("message"), {
      type: "cachear-assets",
      urls: [`${ORIGIN}/_astro/app.js`, `${ORIGIN}/_astro/app.css`],
    });
    expect(buscados).toEqual([`${ORIGIN}/_astro/app.js`, `${ORIGIN}/_astro/app.css`]);
    expect(puestos).toEqual([
      { url: `${ORIGIN}/_astro/app.js`, vary: null },
      { url: `${ORIGIN}/_astro/app.css`, vary: null },
    ]);
  });

  it("descarta cross-origin, la API y el propio SW", async () => {
    const { handlers, puestos, buscados } = cargarSW();
    await enviar(handlers.get("message"), {
      type: "cachear-assets",
      urls: [
        `${ORIGIN}/_astro/app.js`,
        "https://otro.example/app.js",
        `${ORIGIN}/api/sync/pull`,
        `${ORIGIN}/sw.js`,
      ],
    });
    expect(buscados).toEqual([`${ORIGIN}/_astro/app.js`]);
    expect(puestos).toEqual([{ url: `${ORIGIN}/_astro/app.js`, vary: null }]);
  });

  it("no guarda respuestas no OK ni redirigidas", async () => {
    const { handlers, puestos, respuestas } = cargarSW();
    respuestas.set(`${ORIGIN}/_astro/roto.js`, { ok: false, redirected: false });
    respuestas.set(`${ORIGIN}/_astro/redir.js`, { ok: true, redirected: true });
    await enviar(handlers.get("message"), {
      type: "cachear-assets",
      urls: [`${ORIGIN}/_astro/roto.js`, `${ORIGIN}/_astro/redir.js`],
    });
    expect(puestos).toEqual([]);
  });

  it("no guarda HTML aunque la página lo haya cargado como link", async () => {
    const { handlers, puestos, buscados, remotas } = cargarSW();
    const url = `${ORIGIN}/panel`;
    remotas.set(url, {
      ok: true,
      redirected: false,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    });
    await enviar(handlers.get("message"), { type: "cachear-assets", urls: [url] });
    expect(buscados).toEqual([url]);
    expect(puestos).toEqual([]);
  });

  it("no vuelve a bajar un asset que ya está en caché", async () => {
    const { handlers, puestos, buscados, respuestas } = cargarSW();
    const url = `${ORIGIN}/_astro/app.js`;
    respuestas.set(url, { ok: true, redirected: false });
    await enviar(handlers.get("message"), { type: "cachear-assets", urls: [url] });
    expect(buscados).toEqual([]);
    expect(puestos).toEqual([]);
  });

  it("P1-99: el listener fetch ignora <link rel='prefetch'> de rutas del panel (destination='', accept='*/*', sec-purpose='prefetch') y only-if-cached", async () => {
    const { handlers, puestos, buscados } = cargarSW();
    const fetchHandler = handlers.get("fetch") as
      | ((event: {
          request: {
            method: string;
            url: string;
            mode: string;
            cache?: string;
            destination: string;
            headers: Headers;
          };
          respondWith: (p: Promise<unknown>) => void;
        }) => void)
      | undefined;

    let respondidoPrefetch = false;
    fetchHandler?.({
      request: {
        method: "GET",
        url: `${ORIGIN}/panel/stock`,
        mode: "no-cors",
        cache: "reload",
        destination: "",
        headers: new Headers({ accept: "*/*", "sec-purpose": "prefetch" }),
      },
      respondWith: () => {
        respondidoPrefetch = true;
      },
    });
    expect(respondidoPrefetch).toBe(false);

    let respondidoOnlyIfCached = false;
    fetchHandler?.({
      request: {
        method: "GET",
        url: `${ORIGIN}/panel`,
        mode: "no-cors",
        cache: "only-if-cached",
        destination: "",
        headers: new Headers({ accept: "*/*" }),
      },
      respondWith: () => {
        respondidoOnlyIfCached = true;
      },
    });
    expect(respondidoOnlyIfCached).toBe(false);
    expect(buscados).toEqual([]);
    expect(puestos).toEqual([]);
  });
});
