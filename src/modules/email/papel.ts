// Núcleo puro NE12: papel común del email (DS-S21). Sin IO.
// Un solo lugar arma el documento: columna de 600px y papel claro en inline
// (los clientes que ignoran <style> siguen viendo claro) con el oscuro por
// media query. El CTA es star-glow (#bf360c) con blanco, decidido por Mauri:
// AA en los dos modos, así que la media query lo vuelve a fijar para que el
// cliente no lo invierta.

const FONDO = "#f7f5f2";
const FONDO_OSCURO = "#1a1a1a";
const TEXTO = "#1a1a1a";
const TEXTO_OSCURO = "#f7f5f2";
const MUTED = "#6b6259";
const MUTED_OSCURO = "#cfc9b8";
const BORDE_OSCURO = "#3a3a3a";
const ENLACE_OSCURO = "#8cc4e3";
const CTA_FONDO = "#bf360c";
const CTA_TEXTO = "#ffffff";

// Clases estables: la media query las alcanza y el inline queda con la base
// clara, que es lo que pintan los clientes sin soporte de <style>.
const ESTILO_OSCURO = [
  "@media (prefers-color-scheme: dark){",
  `.ne-fondo{background:${FONDO_OSCURO} !important}`,
  `.ne-papel{background:${FONDO_OSCURO} !important;color:${TEXTO_OSCURO} !important}`,
  `.ne-papel a:not(.ne-cta){color:${ENLACE_OSCURO} !important}`,
  `.ne-mute{color:${MUTED_OSCURO} !important}`,
  `.ne-tabla td{border-color:${BORDE_OSCURO} !important}`,
  `.ne-cta{background:${CTA_FONDO} !important;color:${CTA_TEXTO} !important}`,
  "}",
].join("");

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Documento completo, no fragmento: los metas de color-scheme solo existen en
// <head> y el outbox entrega este html tal cual al proveedor, sin otra capa
// que envuelva nada.
export function documento_papel(asunto: string, cuerpoHtml: string): string {
  return (
    `<!DOCTYPE html><html lang="es" style="color-scheme:light dark;">` +
    `<head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark">` +
    `<meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapar(asunto)}</title>` +
    `<style>${ESTILO_OSCURO}</style>` +
    `</head>` +
    `<body class="ne-fondo" style="margin:0;padding:0;background:${FONDO};">` +
    `<div class="ne-papel" style="max-width:600px;margin:0 auto;background:${FONDO};color:${TEXTO};` +
    `font-family:sans-serif;font-size:16px;line-height:1.4;word-break:break-word;">` +
    `<div style="padding:24px 20px;">${cuerpoHtml}</div>` +
    `</div></body></html>`
  );
}

// Botón a lo ancho con 44px de alto (14+14 de padding más 16 de línea), la
// única acción grande del email.
export function cta(href: string, texto: string): string {
  return (
    `<a href="${href}" class="ne-cta" style="display:block;margin:20px 0;padding:14px 16px;` +
    `background:${CTA_FONDO};color:#fff;text-align:center;border-radius:12px;text-decoration:none;` +
    `font-weight:bold;font-size:16px;line-height:16px;">${escapar(texto)}</a>`
  );
}

// table-layout:fixed con overflow-wrap heredado a las celdas: a 360px la
// columna larga se parte en vez de empujar la tabla.
export function tabla(filasHtml: string): string {
  return (
    `<table class="ne-tabla" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;table-layout:fixed;overflow-wrap:anywhere;font-size:15px;"><tbody>${filasHtml}</tbody></table>`
  );
}

export function pie_links(contenido = "Preferencias: {{preferencias_url}} · Baja: {{baja_url}}"): string {
  return `<p class="ne-mute" style="font-size:12px;color:${MUTED};">${contenido}</p>`;
}

export function pie_seguridad(): string {
  return `<p class="ne-mute" style="font-size:12px;color:${MUTED};">Obligatorio para proteger tu cuenta. <a href="{{preferencias_url}}">Ver tus preferencias</a></p>`;
}