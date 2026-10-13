// TV15 térmica 58/80 P2.
// Módulo puro: sin IO, sin red, sin DOM, sin deps. Todo cliente, offline-first.
// Entrada: ticket + líneas (snapshot ya congelado de vender_mostrador /
// aplicar_descuentos) -> { cols32, cols48, html58, html80 }.
// Reglas respetadas: TV2 sin costos, TV7 leyenda obligatoria, BigInt ARS,
// QR como URL corta (no bitmap en P2), corte + feed como marcadores de texto.

export const COLS_58 = 32 as const;
export const COLS_80 = 48 as const;
// Canónica con acento (igual que vender_mostrador.ts); el texto térmico la
// pasa por asciiFallback y la degrada a ASCII solo en papel.
export const LEYENDA_NO_FISCAL = "DOCUMENTO NO VÁLIDO COMO FACTURA" as const;

export interface LineaThermal {
  readonly sku: string;
  readonly cantidad: number;
  readonly precioCentavos: bigint;
  /** Neto ya con descuentos (Lane D). Si ausente => cantidad * precio. */
  readonly netoCentavos?: bigint | undefined;
  /** Descuento total de la línea (línea + prorrateo ticket). Solo display. */
  readonly descuentoCentavos?: bigint | undefined;
}

export interface TicketThermalInput {
  readonly comercio: string;
  readonly comercioExtra?: string | undefined;
  readonly ticketDefinitivo: string | null;
  readonly provisorio: string;
  readonly fechaIso: string;
  readonly medio: string;
  readonly pagoACuenta?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly sobreventa?: boolean | undefined;
  readonly lineas: ReadonlyArray<LineaThermal>;
  readonly totalBrutoCentavos: bigint;
  readonly totalDescuentoCentavos: bigint;
  readonly totalNetoCentavos: bigint;
  readonly qrUrl?: string | undefined;
}

export type FalloThermal =
  | { readonly ok: false; readonly codigo: "LINEA_INVALIDA" }
  | { readonly ok: false; readonly codigo: "TOTAL_CERO" };

export interface TicketThermalOut {
  readonly ok: true;
  readonly cols32: string;
  readonly cols48: string;
  readonly html58: string;
  readonly html80: string;
}

export type RenderTicketResult = TicketThermalOut | FalloThermal;

// ---- CP437 fallback (acentos seguros) ----
// CP437 cubre ñ/Ñ pero NO á/é/í/ó/ú/ü/¿/¡. Para P2 solo texto: degradamos
// vocales acentuadas a su base; ñ/Ñ y ASCII imprimible se conservan.
const FOLD: Readonly<Record<string, string>> = {
  á: "a", à: "a", â: "a", ä: "a", Á: "A", À: "A", Â: "A", Ä: "A",
  é: "e", è: "e", ê: "e", ë: "e", É: "E", È: "E", Ê: "E", Ë: "E",
  í: "i", ì: "i", î: "i", ï: "i", Í: "I", Ì: "I", Î: "I", Ï: "I",
  ó: "o", ò: "o", ô: "o", ö: "o", Ó: "O", Ò: "O", Ô: "O", Ö: "O",
  ú: "u", ù: "u", û: "u", ü: "u", Ú: "U", Ù: "U", Û: "U", Ü: "U",
  ç: "c", Ç: "C", "¿": "?", "¡": "!", "°": "o", "º": "o", "ª": "a",
};

export function asciiFallback(s: string): string {
  let out = "";
  for (const ch of s) {
    if (ch in FOLD) out += FOLD[ch] as string;
    else if (ch === "ñ" || ch === "Ñ") out += ch;
    else {
      const cp = ch.codePointAt(0) as number;
      out += cp >= 0x20 && cp <= 0x7e ? ch : "?";
    }
  }
  return out;
}

// ---- Dinero BigInt ARS (sin Number, sin precisión perdida) ----
function gruposMiles(digitos: string): string {
  let out = "";
  let n = 0;
  for (let i = digitos.length - 1; i >= 0; i--) {
    out = (digitos[i] as string) + out;
    n++;
    if (n % 3 === 0 && i > 0) out = "." + out;
  }
  return out;
}

export function formatArs(centavos: bigint): string {
  const neg = centavos < 0n;
  const abs = neg ? -centavos : centavos;
  const enteros = abs / 100n;
  const resto = abs % 100n;
  const dec = resto.toString().padStart(2, "0");
  return (neg ? "-$" : "$") + gruposMiles(enteros.toString()) + "," + dec;
}

// ---- Layout helpers (puros, por ancho) ----
function repeat(ch: string, n: number): string {
  return n > 0 ? new Array(n + 1).join(ch) : "";
}

function center(t: string, cols: number): string {
  const s = asciiFallback(t.trim()).slice(0, cols);
  const pad = cols - s.length;
  const l = Math.floor(pad / 2);
  return repeat(" ", l) + s + repeat(" ", pad - l);
}

function leftRight(l: string, r: string, cols: number): string {
  const ll = asciiFallback(l).trim();
  const rr = asciiFallback(r).trim();
  if (ll.length + rr.length + 1 <= cols) {
    return ll + repeat(" ", cols - ll.length - rr.length) + rr;
  }
  // Sin romper palabras del lado izquierdo si se puede; el importe manda.
  const maxL = cols - rr.length - 1;
  if (maxL <= 0) return rr.slice(0, cols);
  return ll.slice(0, maxL) + " " + rr;
}

// Wrap sin romper palabras; palabra más larga que cols se corta duro.
export function wrapWords(text: string, cols: number): string[] {
  const clean = asciiFallback(text).replace(/\s+/g, " ").trim();
  if (clean === "") return [""];
  const words = clean.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > cols) {
      if (cur !== "") {
        lines.push(cur);
        cur = "";
      }
      for (let i = 0; i < w.length; i += cols) lines.push(w.slice(i, i + cols));
      continue;
    }
    if (cur === "") cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "" || lines.length === 0) lines.push(cur);
  return lines;
}

function rule(cols: number): string {
  return repeat("-", cols);
}

// Línea compacta por ítem (2 filas fijas):
//   fila1: "<sku corto> <qty>x <precio>"
//   fila2: alineada a derecha "<neto>" (+ " -<dto>" si hay descuento)
function lineasCompactas(
  lineas: ReadonlyArray<LineaThermal>,
  cols: number,
): string[] {
  const out: string[] = [];
  for (const l of lineas) {
    const neto = l.netoCentavos ?? BigInt(l.cantidad) * l.precioCentavos;
    const precio = formatArs(l.precioCentavos);
    const etiqueta = `${l.cantidad}x ${precio}`;
    const skuMax = Math.max(4, cols - etiqueta.length - 1);
    let skuCorto = asciiFallback(l.sku).trim().replace(/\s+/g, " ");
    if (skuCorto.length > skuMax) skuCorto = skuCorto.slice(0, skuMax);
    out.push(leftRight(skuCorto, etiqueta, cols));
    const dto = l.descuentoCentavos ?? 0n;
    const netoFmt = formatArs(neto);
    if (dto <= 0n) {
      out.push(
        netoFmt.length + 1 <= cols
          ? repeat(" ", cols - netoFmt.length) + netoFmt
          : netoFmt.slice(0, cols), // patológico: importe solo más ancho que el papel
      );
    } else if (`${netoFmt} (-${formatArs(dto)})`.length + 1 <= cols) {
      const netoTxt = `${netoFmt} (-${formatArs(dto)})`;
      out.push(repeat(" ", cols - netoTxt.length) + netoTxt);
    } else {
      // Descuento gigante: no recortar el ")" — neto a derecha y el
      // descuento en líneas siguientes (wrap corta duro sin perder chars).
      out.push(
        netoFmt.length + 1 <= cols
          ? repeat(" ", cols - netoFmt.length) + netoFmt
          : netoFmt.slice(0, cols),
      );
      for (const w of wrapWords(`(-${formatArs(dto)})`, cols)) out.push(w);
    }
  }
  return out;
}

function validar(input: TicketThermalInput): FalloThermal | null {
  if (input.lineas.length === 0 || input.lineas.length > 50) {
    return { ok: false, codigo: "LINEA_INVALIDA" };
  }
  for (const l of input.lineas) {
    if (
      !l.sku ||
      !Number.isInteger(l.cantidad) ||
      l.cantidad < 1 ||
      l.cantidad > 999 ||
      l.precioCentavos < 0n
    ) {
      return { ok: false, codigo: "LINEA_INVALIDA" };
    }
    if (l.netoCentavos !== undefined && l.netoCentavos < 0n) {
      return { ok: false, codigo: "LINEA_INVALIDA" };
    }
  }
  // Venta de $0 no es venta de mostrador (igual que vender_mostrador:
  // total <= 0 => LINEA_INVALIDA). Se expone como TOTAL_CERO para que el
  // llamante distinga el caso borde del descuento que vacía el ticket.
  if (input.totalNetoCentavos <= 0n) return { ok: false, codigo: "TOTAL_CERO" };
  return null;
}

function buildText(input: TicketThermalInput, cols: number): string {
  const L: string[] = [];
  L.push(center(input.comercio, cols));
  if (input.comercioExtra) for (const w of wrapWords(input.comercioExtra, cols)) L.push(center(w, cols));
  L.push(rule(cols));
  const titulo = input.ticketDefinitivo ?? "PROVISORIO (offline)";
  for (const w of wrapWords(`Ticket ${titulo}`, cols)) L.push(center(w, cols));
  L.push(leftRight("Prov:", input.provisorio, cols));
  for (const w of wrapWords(`Fecha: ${input.fechaIso}`, cols)) L.push(w);
  L.push(leftRight("Medio:", input.medio + (input.pagoACuenta ? " (A cuenta)" : ""), cols));
  if (input.offline === true || input.ticketDefinitivo === null) L.push(center("OFFLINE - pendiente sync", cols));
  if (input.sobreventa === true) L.push(center("SOBREVENTA a revisar", cols));
  L.push(rule(cols));
  for (const ln of lineasCompactas(input.lineas, cols)) L.push(ln);
  L.push(rule(cols));
  if (input.totalDescuentoCentavos > 0n) {
    L.push(leftRight("Bruto:", formatArs(input.totalBrutoCentavos), cols));
    L.push(leftRight("Dto:", "-" + formatArs(input.totalDescuentoCentavos), cols));
  }
  L.push(leftRight("TOTAL:", formatArs(input.totalNetoCentavos), cols));
  L.push(rule(cols));
  for (const w of wrapWords(LEYENDA_NO_FISCAL, cols)) L.push(center(w, cols));
  if (input.qrUrl) {
    L.push(center("Comprobante:", cols));
    for (const w of wrapWords(input.qrUrl, cols)) L.push(center(w, cols));
  }
  // Feed + corte: 3 avances + marca textual (el driver BT la traduce a GS V).
  L.push("");
  L.push("");
  L.push(center("[CORTE]", cols));
  return L.join("\n");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(input: TicketThermalInput, kind: "58" | "80"): string {
  const cols = kind === "58" ? COLS_58 : COLS_80;
  const text = buildText(input, cols);
  const cls = kind === "58" ? "thermal-58" : "thermal-80";
  const titulo = input.ticketDefinitivo ?? input.provisorio;
  return (
    `<section class="thermal-ticket ${cls}" data-ticket="${escHtml(titulo)}">\n` +
    `<pre>${escHtml(text)}</pre>\n` +
    `</section>`
  );
}

export function render_ticket_thermal(input: TicketThermalInput): RenderTicketResult {
  const fallo = validar(input);
  if (fallo) return fallo;
  const cols32 = buildText(input, COLS_58);
  const cols48 = buildText(input, COLS_80);
  return {
    ok: true,
    cols32,
    cols48,
    html58: buildHtml(input, "58"),
    html80: buildHtml(input, "80"),
  };
}

// ---- Impresión P2: interfaz propuesta (sin lib obligatoria) ----
// window.print: ver print.css (@media print + @page 58mm/80mm).
// Bluetooth ESC/POS opcional: el llamante implementa EscPosPrinter con
// Web Bluetooth (quizás otro slice) y usa textABytes + bytesCorte.
//
// textABytes: el texto ya salió de buildText en ASCII seguro (acentos con
// fallback), así que cada char es 1 byte CP437/ASCII. Corte = GS V 0.
export interface EscPosPrinter {
  write(data: Uint8Array): Promise<void>;
}

export function textABytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = (text.charCodeAt(i) as number) & 0xff;
  return bytes;
}

export function bytesCorte(): Uint8Array {
  // feed 3 líneas + GS V 0 (corte total)
  return new Uint8Array([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x00]);
}

export async function imprimirEscPos(
  printer: EscPosPrinter,
  textoColumnas: string,
): Promise<void> {
  await printer.write(textABytes(textoColumnas + "\n"));
  await printer.write(bytesCorte());
}
