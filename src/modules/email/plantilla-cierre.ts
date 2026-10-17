// Núcleo puro NE4/NE12: plantilla cierre_v1. Sin IO, sin dependencias.
// Una columna 600px sobre el papel común, CTA llama, sin tracking,
// rioplatense, sin emojis.

import { cta, documento_papel, pie_links, tabla } from "./papel.js";

export type TipoCierre = "manual" | "automatica";

export interface DatosCierre {
  readonly nombreComercio: string;
  readonly fechaJornada: string;
  readonly totalCentavos: bigint;
  readonly porMedio: Readonly<Record<string, bigint>>;
  readonly tipo: TipoCierre;
}

// Por qué a mano y no Intl: el snapshot del cierre es inmutable; el formato
// se congela en el evento para que el email siempre muestre lo mismo.
export function formatear_pesos(centavos: bigint): string {
  const negativa = centavos < 0n;
  const abs = negativa ? -centavos : centavos;
  const pesos = abs / 100n;
  const resto = abs % 100n;
  const enteros = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativa ? "-$" : "$"} ${enteros},${resto.toString().padStart(2, "0")}`;
}

export interface PlantillaCierre {
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function armar_cierre(datos: DatosCierre): PlantillaCierre {
  const total = formatear_pesos(datos.totalCentavos);
  const asunto = `Cierre ${datos.fechaJornada} · Resultado ${total} · ${datos.nombreComercio}`;
  const filas = Object.entries(datos.porMedio)
    .map(([medio, monto]) => ({ medio, monto }))
    .sort((a, b) => (a.monto > b.monto ? -1 : a.monto < b.monto ? 1 : 0));
  const filasHtml = filas
    .map(
      (f) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e7e2d9;">${escapar(f.medio)}</td>` +
        `<td align="right" style="padding:8px 0;border-bottom:1px solid #e7e2d9;">${formatear_pesos(f.monto)}</td></tr>`,
    )
    .join("");
  const filasTexto = filas.map((f) => `- ${f.medio}: ${formatear_pesos(f.monto)}`).join("\n");
  const tipoTxt = datos.tipo === "manual" ? "manual" : "automático";
  const html = documento_papel(
    asunto,
    `<p class="ne-mute" style="margin:0 0 8px;font-size:14px;color:#6b6259;">${escapar(datos.nombreComercio)} · cierre ${tipoTxt} ${escapar(datos.fechaJornada)}</p>` +
      `<h1 style="margin:0 0 4px;font-size:24px;">Resultado ${total}</h1>` +
      `<p class="ne-mute" style="margin:0 0 16px;font-size:14px;color:#6b6259;">Snapshot del cierre, sin recalcular. Si hay diferencia de turno, se resuelve en la app.</p>` +
      tabla(filasHtml) +
      cta("{{preferencias_url}}", "Ver cierre en la app") +
      pie_links("Recibís este aviso porque activaste el resumen de cierre. Preferencias: {{preferencias_url}} · Baja: {{baja_url}}"),
  );
  const texto =
    `${datos.nombreComercio} · cierre ${tipoTxt} ${datos.fechaJornada}\n` +
    `Resultado ${total}\n` +
    `Snapshot del cierre, sin recalcular.\n` +
    `${filasTexto}\n` +
    `Ver cierre en la app: {{preferencias_url}}\n` +
    `Baja: {{baja_url}}`;
  return { asunto, html, texto };
}
