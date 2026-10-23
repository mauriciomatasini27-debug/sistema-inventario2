// GGL-PDF: texto embebido de PDF digital sin red (ADR-0005); el job inyecta
// otro extractador en tests para no depender del parseo local.

export type ExtractadorPdfDigital = (bytes: Buffer) => Promise<string | null> | string | null;

function decodificar_literal_pdf(raw: string): string {
  return raw
    .replace(/\\([\\()nrtbf])/g, (_, c: string) => {
      if (c === "n") return "\n";
      if (c === "r") return "\r";
      if (c === "t") return "\t";
      if (c === "b") return "\b";
      if (c === "f") return "\f";
      return c;
    })
    .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(Number.parseInt(oct, 8) & 0xff));
}

/** Extrae literales `(…)` del stream PDF; suficiente para facturas con capa de texto. */
export function extraer_texto_embebido_pdf(bytes: Buffer): string | null {
  const s = bytes.toString("latin1");
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const inner = m[0].slice(1, -1);
    const decoded = decodificar_literal_pdf(inner).trim();
    if (decoded.length > 0) chunks.push(decoded);
  }
  const joined = chunks.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > 0 ? joined : null;
}
