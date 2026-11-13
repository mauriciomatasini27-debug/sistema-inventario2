import type { ContextoReporteSeguro } from "../../lib/reportes-comercio-store.js";

const MAX_RUTA = 120;
const MAX_PANTALLA = 80;

const PANTALLA_POR_RUTA: Readonly<Record<string, string>> = {
  "/panel": "Inicio",
  "/panel/stock": "Productos",
  "/venta": "Venta mostrador",
  "/panel/fiado": "Fiado",
  "/panel/caja": "Caja",
  "/panel/reportes": "Reportes",
  "/panel/plan": "Plan",
};

export function limpiarRuta(rutaCruda: string | null | undefined): string {
  if (!rutaCruda || typeof rutaCruda !== "string") return "/panel";
  let r = rutaCruda.trim();
  const q = r.indexOf("?");
  if (q >= 0) r = r.slice(0, q);
  const h = r.indexOf("#");
  if (h >= 0) r = r.slice(0, h);
  if (!r.startsWith("/")) r = `/${r}`;
  if (r.length > MAX_RUTA) r = r.slice(0, MAX_RUTA);
  return r || "/panel";
}

export function pantallaDesdeRuta(ruta: string): string {
  if (PANTALLA_POR_RUTA[ruta]) return PANTALLA_POR_RUTA[ruta]!;
  if (ruta.startsWith("/panel/")) {
    const resto = ruta.slice("/panel/".length).split("/")[0] ?? "";
    if (resto) return resto.charAt(0).toUpperCase() + resto.slice(1).replace(/-/g, " ");
  }
  if (ruta === "/venta") return "Venta mostrador";
  return "Panel";
}

export function contextoSeguro(input: {
  rutaSugerida?: string | null;
  pantallaCliente?: string | null;
  versionApp: string;
  referer?: string | null;
}): ContextoReporteSeguro {
  let ruta = limpiarRuta(input.rutaSugerida);
  if (input.referer) {
    try {
      const ref = new URL(input.referer);
      ruta = limpiarRuta(ref.pathname);
    } catch {
      /* ignorar referer inválido */
    }
  }
  let pantalla = pantallaDesdeRuta(ruta);
  if (input.pantallaCliente && typeof input.pantallaCliente === "string") {
    const p = input.pantallaCliente.trim().slice(0, MAX_PANTALLA);
    if (p && !p.includes("?") && !p.includes("#") && !/\b(token|secret|password)\b/i.test(p)) {
      pantalla = p;
    }
  }
  return {
    pantalla,
    ruta,
    version: input.versionApp.slice(0, 40),
  };
}

export function contextoSinDatosSensibles(ctx: ContextoReporteSeguro): boolean {
  const blob = `${ctx.pantalla}\n${ctx.ruta}\n${ctx.version}`;
  if (blob.includes("?") || blob.includes("#")) return false;
  if (/\b(bearer|token|secret|password|api[_-]?key)\b/i.test(blob)) return false;
  return true;
}
