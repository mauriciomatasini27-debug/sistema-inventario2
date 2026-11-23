import type { APIRoute } from "astro";
import { destinoGoogleSeguro } from "../../../modules/auth/oauth-destino.js";

export const prerender = false;

function leerCookie(header: string | null, nombre: string): string | null {
  if (!header) return null;
  for (const parte of header.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nombre) continue;
    const crudo = parte.slice(i + 1).trim();
    if (!crudo) return null;
    try {
      return decodeURIComponent(crudo);
    } catch {
      return crudo;
    }
  }
  return null;
}

// P1-55: segundo hop same-origin. Las cookies OAuth ya están en el jar
// (Set-Cookie del login). Acá recién vamos a Google; limpia destino.
export const GET: APIRoute = async ({ request, url }) => {
  const crudo =
    url.searchParams.get("d") ?? leerCookie(request.headers.get("cookie"), "__Host-oauth-destino");
  const destino = crudo ? destinoGoogleSeguro(crudo) : null;
  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.append(
    "Set-Cookie",
    "__Host-oauth-destino=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  );
  if (!destino) {
    headers.set("Location", "/?ingreso=error&mensaje=" + encodeURIComponent("Sesión de ingreso inválida o vencida. Volvé a intentarlo."));
    return new Response(null, { status: 302, headers });
  }
  headers.set("Location", destino);
  return new Response(null, { status: 302, headers });
};
