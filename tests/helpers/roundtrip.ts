import { randomUUID } from "node:crypto";
import { and, eq, getTableColumns, getTableName, type Column, type SQL } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { expect } from "vitest";
import type { getTenantDb } from "../../src/lib/db.js";

// AUD-S4 (ADR-0126): un round-trip escribe una fila con todas las columnas del
// schema, la relee por clave primaria y compara valor y tipo. El harness arma la
// fila desde el schema tipado, así una columna nueva en `src/db/schema*.ts` entra
// sola al test; un tipo nuevo en el schema hace fallar el armado a propósito
// (hay que enseñarle el valor canónico, no dejar la columna sin cubrir).

export type Db = Pick<ReturnType<typeof getTenantDb>, "insert" | "select" | "update">;
export type Fila = Record<string, unknown>;

const CORRIDA = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// Tipos anidados, null y número decimal: lo que suele romperse al cruzar jsonb.
const JSON_CANONICO = {
  texto: "dos",
  entero: 7,
  decimal: 1.5,
  bool: true,
  nada: null,
  lista: [1, "b", false],
  anidado: { a: 1, b: ["c"] },
};

/** Valor no nulo, válido y distinguible para cada tipo de columna del esquema. */
function valorCanonico(col: Column, tabla: string): unknown {
  switch (col.columnType) {
    case "PgUUID":
      return randomUUID();
    case "PgText":
    case "PgVarchar":
      return `rt-${tabla}-${col.name}-${CORRIDA}`;
    case "PgInteger":
      return 1234567;
    // mode "bigint": un valor mayor a 2^53 prueba que no pasa por number.
    case "PgBigInt64":
      return 9007199254740993n;
    case "PgBigInt53":
      return 1234567;
    case "PgBoolean":
      return true;
    case "PgTimestamp":
      return new Date("2026-11-23T12:34:56.789Z");
    case "PgJsonb":
    case "PgJson":
      return JSON_CANONICO;
    case "PgNumeric":
      return "1234.56";
    case "PgDoublePrecision":
    case "PgReal":
      return 1.5;
    default:
      throw new Error(
        `${tabla}.${col.name}: tipo "${col.columnType}" sin valor canónico; extendé tests/helpers/roundtrip.ts`,
      );
  }
}

/** Tipo JS que el schema promete al leer la columna (el "sin cambio de tipo" del AC). */
function tipoEsperado(col: Column): "bigint" | "number" | "boolean" | "date" | "object" | "string" {
  switch (col.columnType) {
    case "PgBigInt64":
      return "bigint";
    case "PgBigInt53":
    case "PgInteger":
    case "PgDoublePrecision":
    case "PgReal":
      return "number";
    case "PgBoolean":
      return "boolean";
    case "PgTimestamp":
      return "date";
    case "PgJsonb":
    case "PgJson":
      return "object";
    default:
      // PgUUID, PgText, PgVarchar y PgNumeric vuelven string. Un tipo nuevo cae
      // acá: si no mapea a string, el guard falla y hay que extenderlo.
      return "string";
  }
}

function tipoReal(valor: unknown): "bigint" | "number" | "boolean" | "date" | "object" | "string" | "null" | "undefined" {
  if (valor === null) return "null";
  if (valor === undefined) return "undefined";
  if (valor instanceof Date) return "date";
  const t = typeof valor;
  if (t === "bigint" || t === "number" || t === "boolean" || t === "string") return t;
  return "object";
}

/**
 * Falla si lo que volvió de la base no tiene el tipo JS de la columna. Es el caso
 * "entero leído como texto" de PRD-AUD-02: el dato puede estar, el tipo no.
 */
export function verificarTipos(tabla: string, cols: Record<string, Column>, fila: Fila): void {
  for (const [prop, col] of Object.entries(cols)) {
    const esperado = tipoEsperado(col);
    const real = tipoReal(fila[prop]);
    if (real !== esperado) {
      throw new Error(
        `${tabla}.${col.name}: la base devolvió ${real} (${String(fila[prop])}) y el schema espera ${esperado} [${col.columnType}]`,
      );
    }
  }
}

function condicionPk(tabla: PgTable, nombre: string, cols: Record<string, Column>, fila: Fila): SQL {
  const props = propiedadesPk(tabla, nombre, cols);
  const condiciones = props.map((prop) => eq(cols[prop]!, fila[prop] as never));
  return condiciones.length === 1 ? condiciones[0]! : and(...condiciones)!;
}

/**
 * Clave primaria del schema: la columna `.primaryKey()` o la `primaryKey({columns})`
 * declarada en el callback de la tabla (product_codes, fiscal_sequences).
 */
function propiedadesPk(tabla: PgTable, nombre: string, cols: Record<string, Column>): string[] {
  const deColumnas = Object.entries(cols)
    .filter(([, col]) => col.primary)
    .map(([prop]) => prop);
  if (deColumnas.length > 0) return deColumnas;
  const compuesta = getTableConfig(tabla).primaryKeys[0];
  if (!compuesta) throw new Error(`${nombre}: sin clave primaria en el schema, no se puede releer`);
  return compuesta.columns.map((col) => {
    const encontrada = Object.entries(cols).find(([, schemaCol]) => schemaCol.name === col.name);
    if (!encontrada) throw new Error(`${nombre}: la PK nombra ${col.name} y no está en el schema`);
    return encontrada[0];
  });
}

async function leerUna(db: Db, tabla: PgTable, cond: SQL, nombre: string): Promise<Fila> {
  const filas = (await db.select().from(tabla).where(cond)) as unknown as Fila[];
  if (filas.length !== 1) throw new Error(`${nombre}: se esperaba 1 fila al releer y vinieron ${filas.length}`);
  return filas[0]!;
}

/**
 * Inserta una fila con todas las columnas del schema, la relee por PK y compara
 * valor y tipo. Después pone en NULL las columnas que el schema declara
 * nulables y comprueba que la base también las acepta: si la base quedó NOT NULL
 * donde el schema dice nullable, el round-trip lo delata.
 *
 * `overrides` fija claves ajenas, columnas con CHECK o claves de unicidad que
 * comparten corridas; el resto lo completa el harness.
 */
export async function roundTrip(db: Db, tabla: PgTable, overrides: Fila = {}): Promise<Fila> {
  const nombre = getTableName(tabla);
  const cols = getTableColumns(tabla) as Record<string, Column>;

  for (const prop of Object.keys(overrides)) {
    if (!Object.hasOwn(cols, prop)) throw new Error(`${nombre}: el override "${prop}" no es columna del schema`);
  }

  const fila: Fila = {};
  for (const [prop, col] of Object.entries(cols)) {
    fila[prop] = Object.hasOwn(overrides, prop) ? overrides[prop] : valorCanonico(col, nombre);
  }

  await db.insert(tabla).values(fila as never);
  const cond = condicionPk(tabla, nombre, cols, fila);

  const releida = await leerUna(db, tabla, cond, nombre);
  expect({ tabla: nombre, fila: releida }).toEqual({ tabla: nombre, fila });
  verificarTipos(nombre, cols, releida);

  const nulables = Object.entries(cols)
    .filter(([, col]) => !col.notNull && !col.primary)
    .map(([prop]) => prop);
  if (nulables.length > 0) {
    const nula: Fila = { ...fila };
    for (const prop of nulables) nula[prop] = null;
    await db
      .update(tabla)
      .set(Object.fromEntries(nulables.map((prop) => [prop, null])) as never)
      .where(cond);
    const releidaNula = await leerUna(db, tabla, cond, nombre);
    expect({ tabla: nombre, fila: releidaNula }).toEqual({ tabla: nombre, fila: nula });
  }

  return fila;
}
