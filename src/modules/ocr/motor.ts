// Motor OCR Fase 0 (ADR-0005), puro salvo el transporte inyectado.
// Primario PaddleOCR PP-OCRv5 autohospedado (HTTP); fallback determinista
// local. Extracción en orden: texto embebido PDF digital primero, luego OCR,
// luego cuerpo email como respaldo. Normalización AR (montos "164.800,00",
// fechas dd/mm/aaaa, CUIT verificador). Confianza por fuente: pdf→alta,
// ocr→media, email→baja. E6: sin motor disponible se queda en local con
// confianza media y marca revisá, sin bloquear.
import { parseFechaAR, parseMontoAR, type ConfianzaCampo } from "../purchases/facturas.js";
import { normalizarCuit, validarCuit } from "../purchases/proveedores.js";

export interface CamposExtraidos {
  readonly cuitTexto: string | null;
  readonly nombreProveedor: string | null;
  readonly fechaTexto: string | null;
  readonly totalTexto: string | null;
}

export interface ConfianzaExtraccion {
  readonly cuit: ConfianzaCampo;
  readonly fecha: ConfianzaCampo;
  readonly total: ConfianzaCampo;
}

export type FuenteCampo = "pdf" | "ocr" | "email" | "ninguna";

export interface Extraccion {
  readonly campos: CamposExtraidos;
  readonly confianza: ConfianzaExtraccion;
  readonly fuentes: Record<"cuit" | "fecha" | "total", FuenteCampo>;
  readonly usoFallbackLocal: boolean;
}

// --- Regex deterministas ----------------------------------------------------

export function extraer_cuit(texto: string): string | null {
  const m = /(\d{2})[-\s]?(\d{8})[-\s]?(\d)/.exec(texto);
  if (!m) return null;
  const candidato = `${m[1]}-${m[2]}-${m[3]}`;
  return validarCuit(candidato) ? normalizarCuit(candidato) : null;
}

export function extraer_fecha_ar(texto: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  if (!m) return null;
  try {
    parseFechaAR(m[0]);
    return m[0];
  } catch {
    return null;
  }
}

function candidatos_monto(texto: string): string[] {
  const out: string[] = [];
  const etiquetado = /(?:total|importe(?: total)?|monto(?: total)?|a pagar)[^\d$]{0,12}\$?\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = etiquetado.exec(texto)) !== null) out.push(m[1]!);
  return out;
}

export function extraer_total_ar(texto: string): string | null {
  const cands = candidatos_monto(texto);
  if (cands.length > 0) {
    // Último total etiquetado (el definitivo suele cerrar el comprobante).
    return cands[cands.length - 1]!;
  }
  // Sin etiqueta: el monto mayor con forma monetaria AR (punto de miles o
  // coma decimal) como respaldo. Dígitos sueltos (años, partes de CUIT) no
  // cuentan: sin forma de monto el campo queda en baja (E1 pide por texto).
  const sueltos = texto.match(/(?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2})/g) ?? [];
  let mejor: string | null = null;
  let mejorValor = 0n;
  for (const s of sueltos) {
    try {
      const v = parseMontoAR(s);
      if (v > mejorValor) {
        mejorValor = v;
        mejor = s;
      }
    } catch {
      // no es monto, se ignora
    }
  }
  return mejor;
}

const CONFIANZA_FUENTE: Record<FuenteCampo, ConfianzaCampo> = {
  pdf: "alta",
  ocr: "media",
  email: "baja",
  ninguna: "baja",
};

function extraer_de_fuente(
  texto: string | null | undefined,
  fuente: FuenteCampo,
): { campos: CamposExtraidos; fuente: FuenteCampo } | null {
  if (!texto) return null;
  const cuit = extraer_cuit(texto);
  const fecha = extraer_fecha_ar(texto);
  const total = extraer_total_ar(texto);
  if (!cuit && !fecha && !total) return null;
  return { campos: { cuitTexto: cuit, nombreProveedor: null, fechaTexto: fecha, totalTexto: total }, fuente };
}

// Extracción en orden de prioridad: pdf → ocr → email. El primer campo
// encontrado en la fuente de mayor prioridad gana.
export function extraer_campos(fuentes: { pdfTexto?: string | null | undefined; ocrTexto?: string | null | undefined; cuerpoEmail?: string | null | undefined }): Extraccion {
  const orden: Array<{ texto: string | null | undefined; fuente: FuenteCampo }> = [
    { texto: fuentes.pdfTexto, fuente: "pdf" },
    { texto: fuentes.ocrTexto, fuente: "ocr" },
    { texto: fuentes.cuerpoEmail, fuente: "email" },
  ];
  const campos: { cuitTexto: string | null; fechaTexto: string | null; totalTexto: string | null } = {
    cuitTexto: null,
    fechaTexto: null,
    totalTexto: null,
  };
  const ftes: Record<"cuit" | "fecha" | "total", FuenteCampo> = { cuit: "ninguna", fecha: "ninguna", total: "ninguna" };
  for (const { texto, fuente } of orden) {
    const r = extraer_de_fuente(texto, fuente);
    if (!r) continue;
    if (!campos.cuitTexto && r.campos.cuitTexto) {
      campos.cuitTexto = r.campos.cuitTexto;
      ftes.cuit = fuente;
    }
    if (!campos.fechaTexto && r.campos.fechaTexto) {
      campos.fechaTexto = r.campos.fechaTexto;
      ftes.fecha = fuente;
    }
    if (!campos.totalTexto && r.campos.totalTexto) {
      campos.totalTexto = r.campos.totalTexto;
      ftes.total = fuente;
    }
  }
  return {
    campos: { ...campos, nombreProveedor: null },
    confianza: { cuit: CONFIANZA_FUENTE[ftes.cuit], fecha: CONFIANZA_FUENTE[ftes.fecha], total: CONFIANZA_FUENTE[ftes.total] },
    fuentes: ftes,
    usoFallbackLocal: false,
  };
}

// --- Cliente PaddleOCR autohospedado -----------------------------------------

export interface MotorOcr {
  extraer(bytesRef: string): Promise<{ texto: string; confianza: number } | null>;
}

export function crear_paddle_cliente(opts: {
  endpoint: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}): MotorOcr {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const fetchFn = opts.fetchFn ?? fetch;
  return {
    async extraer(bytesRef: string) {
      try {
        const r = await fetchFn(opts.endpoint.replace(/\/$/, "") + "/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagen_ref: bytesRef }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!r.ok) return null;
        const data = (await r.json()) as { texto?: unknown; confianza?: unknown };
        if (typeof data.texto !== "string" || !data.texto) return null;
        const conf = typeof data.confianza === "number" ? data.confianza : 0.5;
        return { texto: data.texto, confianza: conf };
      } catch {
        return null;
      }
    },
  };
}

// Orquestación Fase 0: pdf directo → motor Paddle (si hay) → respaldo local.
// E6: motor ausente o caído → local con marca de fallback (el llamante pone
// revisá si la confianza global no es alta).
export async function resolver_extraccion(input: {
  pdfTexto?: string | null;
  ocrTextoDirecto?: string | null;
  cuerpoEmail?: string | null;
  bytesRef: string;
  motor?: MotorOcr | null;
}): Promise<Extraccion> {
  if (input.pdfTexto) {
    const e = extraer_campos({ pdfTexto: input.pdfTexto });
    if (e.campos.fechaTexto && e.campos.totalTexto) return e;
  }
  if (input.ocrTextoDirecto) {
    const base = extraer_campos({ pdfTexto: input.pdfTexto, ocrTexto: input.ocrTextoDirecto, cuerpoEmail: input.cuerpoEmail });
    return { ...base, usoFallbackLocal: input.motor == null };
  }
  if (input.motor) {
    const r = await input.motor.extraer(input.bytesRef);
    if (r && r.texto) {
      // Confianza Paddle <0.6: el campo cae a baja (fallback nube P1, E6 no
      // bloquea: se marca revisá).
      const base = extraer_campos({ pdfTexto: input.pdfTexto, ocrTexto: r.texto, cuerpoEmail: input.cuerpoEmail });
      if (r.confianza < 0.6) {
        const baja: ConfianzaExtraccion = {
          cuit: base.campos.cuitTexto && base.fuentes.cuit === "ocr" ? "baja" : base.confianza.cuit,
          fecha: base.campos.fechaTexto && base.fuentes.fecha === "ocr" ? "baja" : base.confianza.fecha,
          total: base.campos.totalTexto && base.fuentes.total === "ocr" ? "baja" : base.confianza.total,
        };
        return { ...base, confianza: baja, usoFallbackLocal: false };
      }
      return base;
    }
  }
  const base = extraer_campos({ pdfTexto: input.pdfTexto, cuerpoEmail: input.cuerpoEmail });
  return { ...base, usoFallbackLocal: true };
}

// Confianza global: baja si fecha o total en baja; media si alguna en media;
// alta solo con todo en alta. Media o baja encienden `revisá`.
export function confianza_global(c: ConfianzaExtraccion): ConfianzaCampo {
  if (c.fecha === "baja" || c.total === "baja") return "baja";
  if (c.cuit === "media" || c.fecha === "media" || c.total === "media") return "media";
  return "alta";
}

// N2-4 OCR definitivo: ítems de línea (cantidad x descripción x importe).
// Patrón: "2 x Yerba 500g $5.000,00" / "3 YERBA $1500". Máx 50 líneas.
export interface ItemLinea {
  readonly cantidad: number;
  readonly descripcion: string;
  readonly importeTexto: string | null;
}

export function extraer_items(texto: string): ItemLinea[] {
  const out: ItemLinea[] = [];
  const re = /(\d{1,3})\s*(?:x|×|\*|-)?\s*([A-Za-zÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜ0-9 .\-/]{2,60}?)\s+(\$?\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null && out.length < 50) {
    const cant = Number(m[1]);
    const desc = (m[2] ?? "").trim();
    if (!Number.isInteger(cant) || cant < 1 || cant > 999) continue;
    if (desc.length < 3) continue;
    if (/^(total|subtotal|iva|vuelto|pago|cambio|descuento)/i.test(desc)) continue;
    out.push({ cantidad: cant, descripcion: desc.slice(0, 80), importeTexto: m[3]?.trim() ? m[3].trim() : null });
  }
  return out;
}

export function campos_en_baja(c: ConfianzaExtraccion): string[] {
  const out: string[] = [];
  if (c.cuit === "baja") out.push("cuit");
  if (c.fecha === "baja") out.push("fecha");
  if (c.total === "baja") out.push("total");
  return out;
}
