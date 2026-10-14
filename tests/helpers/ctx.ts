import type { APIContext } from "astro";

export interface CtxInit {
  method?: string;
  headers?: HeadersInit;
  body?: string | Record<string, unknown>;
  params?: Record<string, string>;
  cookies?: Record<string, string>;
  locals?: Record<string, unknown>;
}

function jarInicial(headers: Headers, semilla: Record<string, string> | undefined): Map<string, string> {
  const jar = new Map<string, string>(Object.entries(semilla ?? {}));
  const cabecera = headers.get("cookie");
  if (cabecera) {
    for (const parte of cabecera.split(";")) {
      const i = parte.indexOf("=");
      if (i > 0) jar.set(parte.slice(0, i).trim(), decodeURIComponent(parte.slice(i + 1).trim()));
    }
  }
  return jar;
}

export function ctx(url: string, init: CtxInit = {}): APIContext {
  const completa = new URL(url, "http://localhost");
  const headers = new Headers(init.headers);
  let body: BodyInit | undefined;
  if (typeof init.body === "string") {
    body = init.body;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const requestInit: RequestInit = { headers };
  if (init.method !== undefined) requestInit.method = init.method;
  else if (body !== undefined) requestInit.method = "POST";
  if (body !== undefined) requestInit.body = body;
  const request = new Request(completa, requestInit);
  const jar = jarInicial(headers, init.cookies);
  const cookies = {
    get: (key: string) => {
      const value = jar.get(key);
      return value === undefined ? undefined : { value };
    },
    has: (key: string) => jar.has(key),
    set: (key: string, value: string) => {
      jar.set(key, value);
    },
    delete: (key: string) => {
      jar.delete(key);
    },
  };
  return {
    request,
    url: new URL(request.url),
    params: init.params ?? {},
    locals: init.locals ?? {},
    cookies,
    redirect: (path: string, status = 302) =>
      new Response(null, { status, headers: { Location: path } }),
    clientAddress: "127.0.0.1",
    site: undefined,
  } as unknown as APIContext;
}
