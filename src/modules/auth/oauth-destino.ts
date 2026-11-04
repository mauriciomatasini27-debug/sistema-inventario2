import { GOOGLE_AUTH_ENDPOINT } from "./oidc.js";

// P1-55: el hop same-origin guarda la URL de Google en cookie. Solo
// aceptamos el endpoint de authorize documentado; evita open-redirect.
export function destinoGoogleSeguro(crudo: string): string | null {
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    return null;
  }
  const permitido = new URL(GOOGLE_AUTH_ENDPOINT);
  if (url.origin !== permitido.origin || url.pathname !== permitido.pathname) return null;
  if (url.protocol !== "https:") return null;
  return url.toString();
}
