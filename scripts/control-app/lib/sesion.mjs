import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ErrorControlApp } from "./cli.mjs";
import { homeControlApp } from "./estado.mjs";

export async function pedirSesion(baseUrl, rol) {
  let r;
  try {
    r = await fetch(`${baseUrl}/api/dev/control-app`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accion: "login", rol }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new ErrorControlApp(
      "No pude hablar con la app para iniciar sesión.",
      "Corré `control-app levantar` y después `control-app seed`.",
      { detalle: e instanceof Error ? e.message : String(e) },
    );
  }
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new ErrorControlApp(cuerpo.error || `La app respondió HTTP ${r.status} al iniciar sesión.`, cuerpo.hint || "Corré `control-app seed` y reintentá.");
  }
  const setCookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  const cookie = setCookies.find((c) => c.startsWith("__Host-sesion=")) ?? "";
  const valor = cookie.split(";")[0]?.slice("__Host-sesion=".length) ?? "";
  if (!valor) {
    throw new ErrorControlApp(
      "La app no devolvió la cookie de sesión.",
      "Verificá que `control-app levantar` haya exportado CONTROL_APP_DEV=1.",
    );
  }
  return { ...cuerpo, cookie: valor, setCookie: cookie };
}

export function dominioDe(baseUrl) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "localhost";
  }
}

export function escribirStorageState(baseUrl, cookie, rol) {
  const estado = {
    cookies: [
      {
        name: "__Host-sesion",
        value: cookie,
        domain: dominioDe(baseUrl),
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ],
    origins: [],
  };
  const ruta = join(homeControlApp(), `sesion-${rol}.json`);
  writeFileSync(ruta, `${JSON.stringify(estado, null, 2)}\n`);
  return ruta;
}

export function rutaSesion(rol) {
  return join(homeControlApp(), `sesion-${rol}.json`);
}
