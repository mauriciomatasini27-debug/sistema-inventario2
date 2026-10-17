// Núcleo puro NE12: base de plantillas, copy y links. Sin IO.

import { documento_papel, pie_links } from "./papel.js";

const RUTAS = ["/caja", "/pedidos", "/alertas", "/pagos", "/turnos", "/conteo", "/fiado", "/resumen"] as const;

// Deep links a la PWA: solo rutas internas allowlist; lo demás va al inicio.
// Nunca inician sesión solos ni ejecutan acciones (NE12.6).
export function link_app(ruta: string): string {
  if (!ruta.startsWith("/")) return "{{app_url}}/";
  const base = ruta.split("?")[0] ?? "/";
  const ok = (RUTAS as readonly string[]).some((r) => base === r || base.startsWith(`${r}/`));
  if (!ok) return "{{app_url}}/";
  return `{{app_url}}${ruta}`;
}

// Sin tracking: ni pixel ni utm (NE12.7, NE40). El adaptador lo verifica.
export function tiene_tracking(html: string): boolean {
  return html.includes("open-pixel") || html.includes("utm_") || html.includes("click-track");
}

export function layout(titulo: string, cuerpoHtml: string): string {
  return documento_papel(titulo, `<h1 style="font-size:22px;">${titulo}</h1>${cuerpoHtml}`);
}

export const REMITENTES = {
  avisos: "avisos@avisos.local",
  seguridad: "seguridad@local",
  soporte: "soporte@local",
} as const;

// Reply-To: soporte en avisos al dueño; email del comercio en los que salen
// en nombre del comercio (pedidos, contador, empleados). Nunca CBU/alias.
export function reply_para(enNombreComercio: boolean, emailComercio?: string): string {
  if (enNombreComercio && emailComercio) return emailComercio;
  return REMITENTES.soporte;
}

// Pie: por qué lo recibís + prefs + baja cuando corresponde (NE12.8).
export function pie(comercio: string, conBaja: boolean): { html: string; texto: string } {
  const base = `Recibís este email porque sos dueño de ${comercio}.`;
  return {
    html: pie_links(
      `${base} <a href="{{preferencias_url}}">Preferencias</a>${conBaja ? ` · <a href="{{baja_url}}">Dejar de recibir estos emails</a>` : ""}`,
    ),
    texto: `${base}\nPreferencias: {{preferencias_url}}${conBaja ? "\nBaja: {{baja_url}}" : ""}`,
  };
}
