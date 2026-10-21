import { SECTOR_RE } from "./sectores.js";

export type ErrorFila = { campo: string; codigo: string; mensaje: string };

export type FilaImportacion =
  | {
      estado: "nueva" | "existente";
      fila: number;
      sku: string;
      nombre: string;
      precioCentavos: number;
      cantidad: number;
      sector: string;
      stockActual: number;
      stockResultante: number;
      errores: [];
    }
  | {
      estado: "error";
      fila: number;
      crudo: readonly string[];
      errores: readonly ErrorFila[];
    };

export type ResumenImportacion = {
  total: number;
  validas: number;
  nuevas: number;
  existentes: number;
  con_error: number;
};

export type ImportError =
  | { codigo: "COLUMNAS_FALTANTES"; columnas: readonly string[]; mensaje: string }
  | { codigo: "DEMASIADAS_FILAS"; mensaje: string }
  | { codigo: "DEMASIADAS_COLUMNAS"; mensaje: string };

export type ParseoOk = {
  ok: true;
  filas: readonly FilaImportacion[];
  resumen: ResumenImportacion;
  columnasIgnoradas: readonly string[];
  advertenciaCodificacion: boolean;
};

export type ParseoKo = { ok: false; error: ImportError };

type Columna = "sku" | "nombre" | "precio" | "cantidad" | "sector";

const COLUMNAS_OBLIGATORIAS: readonly Columna[] = ["sku", "nombre", "precio", "cantidad"];
const MAX_FILAS = 1000;
const MAX_COLUMNAS = 20;
const MAX_SKU = 64;
const MAX_NOMBRE = 200;
const MAX_CENTAVOS = 99_999_999;
const MAX_CANTIDAD = 1_000_000;

const ALIAS: Readonly<Record<string, Columna>> = {
  sku: "sku",
  codigo: "sku",
  nombre: "nombre",
  producto: "nombre",
  descripcion: "nombre",
  precio: "precio",
  precio_venta: "precio",
  precio_unitario: "precio",
  cantidad: "cantidad",
  stock: "cantidad",
  cantidad_inicial: "cantidad",
  sector: "sector",
};

const DELIMITADORES = [",", ";", "\t"] as const;

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  return String(valor);
}

function normalizarEncabezado(valor: unknown): string {
  return texto(valor)
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function filaVacia(celdas: readonly string[]): boolean {
  return celdas.every((c) => c.trim() === "");
}

function filaComentario(celdas: readonly string[]): boolean {
  return (celdas[0] ?? "").trim().startsWith("#");
}

function filaIgnorada(celdas: readonly string[]): boolean {
  return filaVacia(celdas) || filaComentario(celdas);
}

function error(campo: string, codigo: string, mensaje: string): ErrorFila {
  return { campo, codigo, mensaje };
}

// Precio en pesos: aritmética entera. Acepta 1500, 1500.50 y 1500,50; con coma
// los puntos son separadores de miles. Sin coma, un punto con 3 dígitos y
// entera corta se interpreta como miles (1.500). Devuelve null si no es un
// precio válido; el llamador distingue el vacío.
function parsearPrecioCentavos(crudo: string): number | null {
  const s = crudo.trim().replace(/\s+/g, "");
  if (s === "") return null;
  let normalizado: string;
  if (s.includes(",")) {
    if ((s.match(/,/g) ?? []).length !== 1) return null;
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else {
    const puntos = (s.match(/\./g) ?? []).length;
    if (puntos > 1) {
      normalizado = s.replace(/\./g, "");
    } else if (puntos === 1) {
      const [entera = "", decimal = ""] = s.split(".");
      normalizado = decimal.length === 3 && entera.length >= 1 && entera.length <= 3 ? entera + decimal : s;
    } else {
      normalizado = s;
    }
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalizado)) return null;
  const [entera = "", decimal = ""] = normalizado.split(".");
  const centavos = Number(entera) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(centavos) || centavos > MAX_CENTAVOS) return null;
  return centavos;
}

function parsearCantidad(crudo: string): number | null {
  const s = crudo.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_CANTIDAD) return null;
  return n;
}

function mapearEncabezado(celdas: readonly string[]): {
  indices: Partial<Record<Columna, number>>;
  ignoradas: string[];
} {
  const indices: Partial<Record<Columna, number>> = {};
  const ignoradas: string[] = [];
  celdas.forEach((celda, i) => {
    const normalizado = normalizarEncabezado(celda);
    if (normalizado === "") return;
    const columna = ALIAS[normalizado];
    if (!columna || indices[columna] !== undefined) {
      ignoradas.push(normalizado);
      return;
    }
    indices[columna] = i;
  });
  return { indices, ignoradas };
}

function valorDe(celdas: readonly string[], indice: number | undefined): string {
  return indice === undefined ? "" : (celdas[indice] ?? "");
}

type FilaBase = {
  fila: number;
  crudo: readonly string[];
  sku: string;
  nombre: string;
  precioCentavos: number;
  cantidad: number;
  sector: string;
  errores: ErrorFila[];
};

function validarFila(
  celdas: readonly string[],
  fila: number,
  indices: Partial<Record<Columna, number>>,
): FilaBase {
  const errores: ErrorFila[] = [];
  const skuCrudo = valorDe(celdas, indices.sku).trim();
  const sku = skuCrudo.toUpperCase();
  if (skuCrudo === "") errores.push(error("sku", "SKU_FALTA", "Falta el SKU."));
  else if (sku.length > MAX_SKU) errores.push(error("sku", "SKU_INVALIDO", `El SKU supera ${MAX_SKU} caracteres.`));

  const nombre = valorDe(celdas, indices.nombre).trim();
  if (nombre === "") errores.push(error("nombre", "NOMBRE_FALTA", "Falta el nombre."));
  else if (nombre.length > MAX_NOMBRE) errores.push(error("nombre", "NOMBRE_INVALIDO", `El nombre supera ${MAX_NOMBRE} caracteres.`));

  const precioCrudo = valorDe(celdas, indices.precio);
  let precioCentavos = 0;
  if (precioCrudo.trim() === "") {
    errores.push(error("precio", "PRECIO_FALTA", "Falta el precio."));
  } else {
    const centavos = parsearPrecioCentavos(precioCrudo);
    if (centavos === null) errores.push(error("precio", "PRECIO_INVALIDO", "Precio inválido: usá pesos con hasta dos decimales."));
    else precioCentavos = centavos;
  }

  const cantidadCruda = valorDe(celdas, indices.cantidad);
  let cantidad = 0;
  if (cantidadCruda.trim() === "") {
    errores.push(error("cantidad", "CANTIDAD_FALTA", "Falta la cantidad."));
  } else {
    const n = parsearCantidad(cantidadCruda);
    if (n === null) errores.push(error("cantidad", "CANTIDAD_INVALIDA", `La cantidad debe ser un entero entre 1 y ${MAX_CANTIDAD}.`));
    else cantidad = n;
  }

  const sectorCrudo = valorDe(celdas, indices.sector).trim().toLowerCase();
  let sector = "general";
  if (sectorCrudo !== "") {
    if (!SECTOR_RE.test(sectorCrudo)) errores.push(error("sector", "SECTOR_INVALIDO", "Sector inválido: usá letras, números, guion o guion bajo."));
    else sector = sectorCrudo;
  }

  return { fila, crudo: celdas, sku, nombre, precioCentavos, cantidad, sector, errores };
}

export function parsearFilasStock(
  filas: readonly unknown[][],
  catalogo: ReadonlyMap<string, number>,
): ParseoOk | ParseoKo {
  const crudas = filas.map((f) => f.map(texto));
  const indiceEncabezado = crudas.findIndex((f) => !filaIgnorada(f));
  if (indiceEncabezado < 0) {
    return {
      ok: false,
      error: {
        codigo: "COLUMNAS_FALTANTES",
        columnas: [...COLUMNAS_OBLIGATORIAS],
        mensaje: "Falta la fila de encabezados.",
      },
    };
  }
  const encabezado = crudas[indiceEncabezado] ?? [];
  if (encabezado.length > MAX_COLUMNAS) {
    return {
      ok: false,
      error: { codigo: "DEMASIADAS_COLUMNAS", mensaje: `El encabezado supera ${MAX_COLUMNAS} columnas.` },
    };
  }
  const { indices, ignoradas } = mapearEncabezado(encabezado);
  const faltantes = COLUMNAS_OBLIGATORIAS.filter((c) => indices[c] === undefined);
  if (faltantes.length > 0) {
    return {
      ok: false,
      error: {
        codigo: "COLUMNAS_FALTANTES",
        columnas: faltantes,
        mensaje: `Faltan columnas obligatorias: ${faltantes.join(", ")}.`,
      },
    };
  }

  const datos = crudas
    .map((celdas, i) => ({ celdas, i }))
    .filter(({ celdas, i }) => i > indiceEncabezado && !filaIgnorada(celdas));
  if (datos.length > MAX_FILAS) {
    return {
      ok: false,
      error: { codigo: "DEMASIADAS_FILAS", mensaje: `El archivo supera ${MAX_FILAS} filas de datos.` },
    };
  }

  const bases = datos.map(({ celdas, i }) => {
    const rellenadas = [...celdas];
    while (rellenadas.length < encabezado.length) rellenadas.push("");
    return validarFila(rellenadas, i + 1, indices);
  });

  const apariciones = new Map<string, number>();
  for (const base of bases) {
    if (base.sku === "") continue;
    apariciones.set(base.sku, (apariciones.get(base.sku) ?? 0) + 1);
  }
  for (const base of bases) {
    if ((apariciones.get(base.sku) ?? 0) > 1) {
      base.errores.push(error("sku", "SKU_DUPLICADO_EN_ARCHIVO", "El SKU está repetido en el archivo."));
    }
  }

  const filasResultado: FilaImportacion[] = bases.map((base) => {
    if (base.errores.length > 0) {
      return { estado: "error", fila: base.fila, crudo: base.crudo, errores: base.errores };
    }
    const stockActual = catalogo.get(base.sku) ?? 0;
    const existente = catalogo.has(base.sku);
    return {
      estado: existente ? "existente" : "nueva",
      fila: base.fila,
      sku: base.sku,
      nombre: base.nombre,
      precioCentavos: base.precioCentavos,
      cantidad: base.cantidad,
      sector: base.sector,
      stockActual,
      stockResultante: stockActual + base.cantidad,
      errores: [],
    };
  });

  const nuevas = filasResultado.filter((f) => f.estado === "nueva").length;
  const existentes = filasResultado.filter((f) => f.estado === "existente").length;
  const conError = filasResultado.filter((f) => f.estado === "error").length;
  return {
    ok: true,
    filas: filasResultado,
    resumen: {
      total: filasResultado.length,
      validas: nuevas + existentes,
      nuevas,
      existentes,
      con_error: conError,
    },
    columnasIgnoradas: ignoradas,
    advertenciaCodificacion: false,
  };
}

function contarFueraDeComillas(linea: string, delimitador: string): number {
  let enComillas = false;
  let total = 0;
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') i += 1;
      else enComillas = !enComillas;
    } else if (!enComillas && c === delimitador) {
      total += 1;
    }
  }
  return total;
}

function detectarDelimitador(texto: string): string {
  const primera = texto
    .split(/\r?\n/)
    .find((linea) => linea.trim() !== "" && !linea.trim().startsWith("#"));
  if (!primera) return ",";
  let elegido = ",";
  let maximo = -1;
  for (const delimitador of DELIMITADORES) {
    const cuenta = contarFueraDeComillas(primera, delimitador);
    if (cuenta > maximo) {
      maximo = cuenta;
      elegido = delimitador;
    }
  }
  return elegido;
}

function parsearLineasCsv(texto: string, delimitador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i] ?? "";
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      enComillas = true;
    } else if (c === delimitador) {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c === "\r") {
      if (texto[i + 1] !== "\n") {
        fila.push(campo);
        filas.push(fila);
        fila = [];
        campo = "";
      }
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

export function parsearCsvStock(
  texto: string,
  catalogo: ReadonlyMap<string, number>,
): ParseoOk | ParseoKo {
  const limpio = texto.replace(/^\uFEFF/, "");
  const delimitador = detectarDelimitador(limpio);
  const filas = parsearLineasCsv(limpio, delimitador);
  const resultado = parsearFilasStock(filas, catalogo);
  if (!resultado.ok) return resultado;
  return { ...resultado, advertenciaCodificacion: limpio.includes("\uFFFD") };
}

function escaparCsv(valor: string): string {
  return /[",\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function generarPlantillaCsv(): string {
  const filas = [
    ["sku", "nombre", "precio", "cantidad", "sector"],
    ["# precio en pesos con hasta 2 decimales (ej. 1950.00)"],
    ["# la cantidad se suma al stock actual"],
    ["ARROZ-1", "Arroz gallo 1 kg", "1950.00", "24", ""],
  ];
  return `\uFEFF${filas.map((f) => f.map(escaparCsv).join(",")).join("\n")}\n`;
}
