// GGL-S10b: factura que viene en el cuerpo, sin adjunto.
//
// Borrador de cuerpo: mismo borrador de ingesta con origen email_respaldo.
// Los campos de confianza (monto y vencimiento) quedan siempre en "baja".
// pideRevision es true: el Dueño tiene que mirarlo; no se confirma solo.
//
// Imagen saneada: PNG armado en este proceso con el texto visible. No es
// una descarga. Se sacan HTML, scripts, formularios de login y URLs antes
// de dibujar, así un link del mail no se abre ni se manda a un tercero.
//
// Cuerpo saneado: el texto que queda después de eso, más cuántas URLs se
// descartaron. Descartar no es seguirlas: esta función no usa la red.

import { crc32, deflateSync } from "node:zlib";
import type { ConfianzaCampo } from "./facturas_servicios.js";
import { extraer_comprobante } from "./ingesta_gmail.js";

export interface CuerpoSaneado {
  readonly texto: string;
  readonly urlsDescartadas: number;
}

export interface ImagenCuerpoSaneada {
  readonly mime: "image/png";
  readonly bytes: Buffer;
  readonly texto: string;
}

export interface BorradorCuerpo {
  readonly origen: "email_respaldo";
  readonly montoCentavos: bigint | null;
  readonly vencimientoIso: string | null;
  readonly confianzaMonto: "baja";
  readonly confianzaVencimiento: "baja";
  readonly pideRevision: true;
  readonly comprobante: ImagenCuerpoSaneada;
}

export interface ConfianzaGuardada {
  readonly monto: ConfianzaCampo;
  readonly vencimiento: ConfianzaCampo;
  readonly pideRevision: boolean;
  readonly comprobanteCuerpo: { readonly mime: "image/png"; readonly bytes: Buffer } | null;
}

// font8x8 básico, dominio público (Daniel Hepper). Glifos U+0020 a U+007E.
// El bit menos significativo de cada byte es el pixel de la izquierda.
const FUENTE_B64 =
  "AAAAAAAAAAAYPDwYGAAYADY2AAAAAAAANjZ/Nn82NgAMPgMeMB8MAABjMxgMZmMAHDYcbjszbgAGBgMAAAAAABgMBgYGDBgABgwYGBgMBgAAZjz/PGYAAAAMDD8MDAAAAAAAAAAMDAYAAAA/AAAAAAAAAAAADAwAYDAYDAYDAQA+Y3N7b2c+AAwODAwMDD8AHjMwHAYzPwAeMzAcMDMeADg8NjN/MHgAPwMfMDAzHgAcBgMfMzMeAD8zMBgMDAwAHjMzHjMzHgAeMzM+MBgOAAAMDAAADAwAAAwMAAAMDAYYDAYDBgwYAAAAPwAAPwAABgwYMBgMBgAeMzAYDAAMAD5je3t7Ax4ADB4zMz8zMwA/ZmY+ZmY/ADxmAwMDZjwAHzZmZmY2HwB/RhYeFkZ/AH9GFh4WBg8APGYDA3NmfAAzMzM/MzMzAB4MDAwMDB4AeDAwMDMzHgBnZjYeNmZnAA8GBgZGZn8AY3d/f2tjYwBjZ297c2NjABw2Y2NjNhwAP2ZmPgYGDwAeMzMzOx44AD9mZj42ZmcAHjMHDjgzHgA/LQwMDAweADMzMzMzMz8AMzMzMzMeDABjY2Nrf3djAGNjNhwcNmMAMzMzHgwMHgB/YzEYTGZ/AB4GBgYGBh4AAwYMGDBgQAAeGBgYGBgeAAgcNmMAAAAAAAAAAAAAAP8MDBgAAAAAAAAAHjA+M24ABwYGPmZmOwAAAB4zAzMeADgwMD4zM24AAAAeMz8DHgAcNgYPBgYPAAAAbjMzPjAfBwY2bmZmZwAMAA4MDAweADAAMDAwMzMeBwZmNh42ZwAODAwMDAweAAAAM39/a2MAAAAfMzMzMwAAAB4zMzMeAAAAO2ZmPgYPAABuMzM+MHgAADtuZgYPAAAAPgMeMB8ACAw+DAwsGAAAADMzMzNuAAAAMzMzHgwAAABja39/NgAAAGM2HDZjAAAAMzMzPjAfAAA/GQwmPwA4DAwHDAw4ABgYGAAYGBgABwwMOAwMBwBuOwAAAAAAAA==";
const FUENTE = Buffer.from(FUENTE_B64, "base64");

const SIN_ACENTO: Readonly<Record<string, string>> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
  ñ: "n",
  Á: "A",
  É: "E",
  Í: "I",
  Ó: "O",
  Ú: "U",
  Ü: "U",
  Ñ: "N",
};

const MAX_TEXTO = 1500;
const COLUMNAS = 64;
const MARGEN = 8;
const CELDA = 8;
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function punto(codigo: number): string {
  if (!Number.isInteger(codigo) || codigo <= 0 || codigo > 0x10ffff) return " ";
  return String.fromCodePoint(codigo);
}

function decodificarEntidades(valor: string): string {
  return valor
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_todo, n: string) => punto(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_todo, h: string) => punto(Number.parseInt(h, 16)));
}

// GGL-S10b: dos pasadas para que &amp;lt;script&amp;gt; no sobreviva como texto.
export function sanearCuerpo(crudo: string): CuerpoSaneado {
  // Regex nuevas en cada llamada: las globales guardan lastIndex y se
  // comerían el saneo del correo siguiente.
  const comentario = /<!--[\s\S]*?-->/g;
  const bloque = /<\s*(script|style|noscript|iframe|object|embed|form)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
  const formAbierto = /<\s*form\b[\s\S]*$/gi;
  const etiqueta = /<[^>]+>/g;
  const url = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let texto = decodificarEntidades(decodificarEntidades(crudo));
  texto = texto.replace(comentario, " ");
  texto = texto.replace(bloque, " ");
  texto = texto.replace(formAbierto, " ");
  texto = texto.replace(etiqueta, " ");
  const urls = texto.match(url);
  url.lastIndex = 0;
  texto = texto.replace(url, " ").replace(/\s+/g, " ").trim();
  return { texto, urlsDescartadas: urls?.length ?? 0 };
}

function confianzaCampo(valor: unknown): ConfianzaCampo {
  return valor === "alta" || valor === "media" || valor === "baja" ? valor : "baja";
}

function objeto(valor: unknown): Record<string, unknown> | null {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
  return valor as Record<string, unknown>;
}

function glifo(caracter: string): number {
  const plano = SIN_ACENTO[caracter] ?? caracter;
  const codigo = plano.codePointAt(0) ?? 63;
  const indice = codigo >= 32 && codigo <= 126 ? codigo - 32 : 63 - 32;
  return indice * 8;
}

function lineasDe(texto: string): string[] {
  const recorte = texto.slice(0, MAX_TEXTO);
  const lineas: string[] = [];
  for (let i = 0; i < recorte.length; i += COLUMNAS) lineas.push(recorte.slice(i, i + COLUMNAS));
  return lineas.length > 0 ? lineas : [" "];
}

function chunkPng(tipo: string, datos: Buffer): Buffer {
  const nombre = Buffer.from(tipo, "ascii");
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([nombre, datos])) >>> 0, 0);
  return Buffer.concat([largo, nombre, datos, crc]);
}

function aLatin1(texto: string): Buffer {
  const bytes: number[] = [];
  for (const ch of texto) {
    const codigo = ch.codePointAt(0) ?? 63;
    bytes.push(codigo > 0 && codigo < 256 ? codigo : 63);
  }
  return Buffer.from(bytes);
}

function imagenSaneadaDelCuerpo(texto: string): ImagenCuerpoSaneada {
  const lineas = lineasDe(texto);
  const ancho = MARGEN * 2 + COLUMNAS * CELDA;
  const alto = MARGEN * 2 + lineas.length * CELDA;
  const stride = ancho + 1;
  const raw = Buffer.alloc(alto * stride, 0xff);
  for (let y = 0; y < alto; y++) raw[y * stride] = 0;

  lineas.forEach((linea, fila) => {
    [...linea].forEach((caracter, columna) => {
      const origen = glifo(caracter);
      for (let row = 0; row < 8; row++) {
        const bits = FUENTE[origen + row] ?? 0;
        for (let col = 0; col < 8; col++) {
          if ((bits & (1 << col)) === 0) continue;
          const x = MARGEN + columna * CELDA + col;
          const y = MARGEN + fila * CELDA + row;
          raw[y * stride + 1 + x] = 0;
        }
      }
    });
  });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;
  const comentario = Buffer.concat([Buffer.from("Comment", "ascii"), Buffer.from([0]), aLatin1(texto.slice(0, MAX_TEXTO))]);
  const bytes = Buffer.concat([
    FIRMA_PNG,
    chunkPng("IHDR", ihdr),
    chunkPng("tEXt", comentario),
    chunkPng("IDAT", deflateSync(raw)),
    chunkPng("IEND", Buffer.alloc(0)),
  ]);
  return { mime: "image/png", bytes, texto: texto.slice(0, MAX_TEXTO) };
}

export function borradorDeCuerpo(crudo: string): BorradorCuerpo | null {
  const saneado = sanearCuerpo(crudo);
  if (saneado.texto === "") return null;
  const extraccion = extraer_comprobante({ cuerpo: saneado.texto });
  if (extraccion.montoCentavos === null && extraccion.vencimientoIso === null) return null;
  return {
    origen: "email_respaldo",
    montoCentavos: extraccion.montoCentavos,
    vencimientoIso: extraccion.vencimientoIso,
    confianzaMonto: "baja",
    confianzaVencimiento: "baja",
    pideRevision: true,
    comprobante: imagenSaneadaDelCuerpo(saneado.texto),
  };
}

// GGL-S10b: la imagen vive en el jsonb de confianza porque el borrador no
// tiene columna propia y esta historia no agrega migración.
export function confianzaParaGuardar(input: {
  readonly monto: ConfianzaCampo;
  readonly vencimiento: ConfianzaCampo;
  readonly pideRevision?: boolean;
  readonly comprobante?: { readonly mime: "image/png"; readonly bytes: Buffer } | null;
}): Record<string, unknown> {
  const confianza: Record<string, unknown> = {
    monto: input.monto,
    vencimiento: input.vencimiento,
  };
  if (input.pideRevision === true) confianza.pideRevision = true;
  if (input.comprobante && input.comprobante.bytes.length > 0) {
    confianza.comprobanteCuerpo = {
      mime: "image/png",
      bytesBase64: input.comprobante.bytes.toString("base64"),
    };
  }
  return confianza;
}

function pngDe(valor: unknown): { readonly mime: "image/png"; readonly bytes: Buffer } | null {
  const rec = objeto(valor);
  if (!rec || rec.mime !== "image/png" || typeof rec.bytesBase64 !== "string" || rec.bytesBase64.length === 0) {
    return null;
  }
  const bytes = Buffer.from(rec.bytesBase64, "base64");
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(FIRMA_PNG)) return null;
  return { mime: "image/png", bytes };
}

export function leerConfianzaGuardada(confianza: unknown): ConfianzaGuardada {
  const valor = objeto(confianza) ?? {};
  return {
    monto: confianzaCampo(valor.monto),
    vencimiento: confianzaCampo(valor.vencimiento),
    pideRevision: valor.pideRevision === true,
    comprobanteCuerpo: pngDe(valor.comprobanteCuerpo),
  };
}
