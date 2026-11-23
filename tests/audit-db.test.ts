import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canonizarDefault,
  canonizarTipo,
  codigoSalida,
  columnasDesdeIndexDef,
  diffEstados,
  estadoDesdeBase,
  fusionarEstados,
  parsearEsquemaTS,
  parsearMigracionesSql,
  resumirDiferencias,
} from "../scripts/audit-db-lib.mjs";

const esquema = (fuente: string) => parsearEsquemaTS(fuente);
const migraciones = (...sqls: string[]) => parsearMigracionesSql(sqls.map((sql, i) => ({ nombre: `${i}.sql`, sql })));

describe("audit:db · parseo de src/db/schema*.ts", () => {
  const fuente = `
    import { bigint, boolean, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
    import { sql } from "drizzle-orm";

    export const products = pgTable("products", {
      tenantId: uuid("tenant_id").notNull(),
      id: uuid("id").primaryKey().defaultRandom(),
      sku: text("sku").notNull().unique(),
      nombre: varchar("nombre", { length: 80 }).notNull(),
      precioCentavos: bigint("precio_centavos", { mode: "bigint" }).notNull().default(0n),
      porPeso: boolean("por_peso").notNull().default(false),
      rubro: text("rubro").notNull().default("general"),
      creadoEn: timestamp("creado_en").notNull().defaultNow(),
    }, (t) => [
      uniqueIndex("products_tenant_sku_uq").on(t.tenantId, t.sku),
    ]);

    export const devicePins = pgTable("device_pins", {
      tenantId: uuid("tenant_id").notNull(),
      deviceCode: text("device_code").notNull(),
      bloqueado: boolean("bloqueado").notNull().default(false),
    }, (t) => [primaryKey({ columns: [t.tenantId, t.deviceCode] })]);

    export const tickets = pgTable("tickets", {
      id: uuid("id").primaryKey(),
      definitivo: text("definitivo"),
    }, (t) => [uniqueIndex("tickets_tenant_definitivo_uq").on(t.id, t.definitivo).where(sql\`\${t.definitivo} IS NOT NULL\`)]);
  `;

  it("lee columnas, tipos, nullabilidad y defaults", () => {
    const { tablas } = esquema(fuente);
    expect(tablas.products.columnas.tenant_id).toMatchObject({ tipo: "uuid", notNull: true, default: null, pk: false });
    expect(tablas.products.columnas.precio_centavos).toMatchObject({ tipo: "bigint", notNull: true, default: "0" });
    expect(tablas.products.columnas.por_peso).toMatchObject({ tipo: "boolean", default: "false" });
    expect(tablas.products.columnas.rubro).toMatchObject({ tipo: "text", default: "general" });
    expect(tablas.products.columnas.creado_en).toMatchObject({ tipo: "timestamp without time zone", default: "now()" });
    expect(tablas.products.columnas.id).toMatchObject({ pk: true, notNull: true, default: "gen_random_uuid()" });
  });

  it("respeta varchar con largo", () => {
    expect(esquema(fuente).tablas.products.columnas.nombre.tipo).toBe("character varying(80)");
  });

  it("marca la unique de una columna sin inventar nombre de índice", () => {
    const { tablas } = esquema(fuente);
    expect(tablas.products.columnas.sku.unique).toBe(true);
    expect(Object.keys(tablas.products.indices)).toEqual(["products_tenant_sku_uq"]);
  });

  it("lee índices por nombre, sus columnas y si son parciales", () => {
    const { tablas } = esquema(fuente);
    expect(tablas.products.indices.products_tenant_sku_uq).toMatchObject({
      columnas: ["tenant_id", "sku"],
      unique: true,
      parcial: false,
    });
    expect(tablas.tickets.indices.tickets_tenant_definitivo_uq.parcial).toBe(true);
  });

  it("lee la PK compuesta declarada con primaryKey()", () => {
    const { tablas } = esquema(fuente);
    expect(tablas.device_pins.pk).toEqual(["device_code", "tenant_id"]);
    expect(tablas.device_pins.columnas.tenant_id.notNull).toBe(true);
  });

  it("fusiona tablas de varios archivos sin pisar índices", () => {
    const a = esquema(`export const x = pgTable("x", { id: text("id").primaryKey() }, (t) => [uniqueIndex("x_id_uq").on(t.id)]);`);
    const b = esquema(`export const y = pgTable("y", { id: text("id") });`);
    const acumulado = fusionarEstados({ tablas: {}, fks: [] }, a);
    fusionarEstados(acumulado, b);
    expect(Object.keys(acumulado.tablas).sort()).toEqual(["x", "y"]);
    expect(acumulado.tablas.x.indices.x_id_uq.unique).toBe(true);
  });
});

describe("audit:db · parseo de drizzle/*.sql", () => {
  it("lee CREATE TABLE con tipos multi-palabra, defaults y constraints", () => {
    const estado = migraciones(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "nombre" character varying(80) NOT NULL,
        "precio_centavos" bigint DEFAULT '0' NOT NULL,
        "creado_en" timestamp without time zone DEFAULT now() NOT NULL,
        CONSTRAINT "products_tenant_sku_uq" UNIQUE("nombre")
      );
    `);
    const products = estado.tablas.products;
    expect(products.columnas.id).toMatchObject({ tipo: "uuid", pk: true, default: "gen_random_uuid()" });
    expect(products.columnas.nombre.tipo).toBe("character varying(80)");
    expect(products.columnas.precio_centavos).toMatchObject({ tipo: "bigint", default: "0" });
    expect(products.columnas.creado_en.tipo).toBe("timestamp without time zone");
    expect(products.indices.products_tenant_sku_uq).toMatchObject({ columnas: ["nombre"], unique: true });
  });

  it("aplica ADD COLUMN, ALTER TYPE, RENAME y DROP COLUMN en orden", () => {
    const estado = migraciones(
      `CREATE TABLE "lotes" ("id" uuid PRIMARY KEY, "sku" text, "cantidad" integer);`,
      `ALTER TABLE "lotes" ADD COLUMN "vence_en" timestamp;`,
      `ALTER TABLE "lotes" ALTER COLUMN "cantidad" SET DATA TYPE bigint USING "cantidad"::bigint;`,
      `ALTER TABLE "lotes" RENAME COLUMN "vence_en" TO "vencimiento";`,
      `ALTER TABLE "lotes" DROP COLUMN "sku";`,
    );
    const lotes = estado.tablas.lotes;
    expect(Object.keys(lotes.columnas).sort()).toEqual(["cantidad", "id", "vencimiento"]);
    expect(lotes.columnas.cantidad.tipo).toBe("bigint");
  });

  it("respeta CREATE TABLE IF NOT EXISTS cuando la tabla ya existe", () => {
    const estado = migraciones(
      `CREATE TABLE IF NOT EXISTS "fiscal_jobs" ("id" uuid PRIMARY KEY, "tenant_id" uuid);`,
      `CREATE TABLE IF NOT EXISTS "fiscal_jobs" ("clave" text PRIMARY KEY);`,
    );
    expect(Object.keys(estado.tablas.fiscal_jobs.columnas)).toEqual(["id", "tenant_id"]);
    expect(estado.tablas.fiscal_jobs.pk).toEqual(["id"]);
  });

  it("registra índices creados con CREATE [UNIQUE] INDEX", () => {
    const estado = migraciones(
      `CREATE TABLE "t" ("id" uuid);`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "t_id_uq" ON "t" ("id");`,
      `CREATE INDEX "t_id_idx" ON "t" ("id") WHERE "id" IS NOT NULL;`,
    );
    expect(estado.tablas.t.indices.t_id_uq.unique).toBe(true);
    expect(estado.tablas.t.indices.t_id_idx.parcial).toBe(true);
  });
});

describe("audit:db · canonización de tipos y defaults", () => {
  it("normaliza alias de tipos de Postgres", () => {
    expect(canonizarTipo("character varying")).toBe("character varying");
    expect(canonizarTipo("varchar", { largo: 80 })).toBe("character varying(80)");
    expect(canonizarTipo("timestamptz")).toBe("timestamp with time zone");
    expect(canonizarTipo("timestamp")).toBe("timestamp without time zone");
    expect(canonizarTipo("text[]")).toBe("text[]");
    expect(canonizarTipo("int8")).toBe("bigint");
  });

  it("normaliza defaults para comparar base contra schema", () => {
    expect(canonizarDefault("'general'::text")).toBe("general");
    expect(canonizarDefault("'{}'::jsonb")).toBe("{}");
    expect(canonizarDefault("CURRENT_TIMESTAMP")).toBe("now()");
    expect(canonizarDefault("now()")).toBe("now()");
    expect(canonizarDefault("uuid_generate_v4()")).toBe("gen_random_uuid()");
    expect(canonizarDefault("NULL")).toBeNull();
    expect(canonizarDefault(null)).toBeNull();
  });
});

describe("audit:db · diff base vs esperado", () => {
  const baseDeFilas = (columnas: Array<Record<string, unknown>>) =>
    estadoDesdeBase({
      tablas: [...new Set(columnas.map((c) => c.tabla as string))],
      columnas: columnas as never,
      indices: [],
      pks: columnas.filter((c) => c.pk).map((c) => ({ tabla: c.tabla as string, columna: c.columna as string })),
      fks: [],
    });

  it("caso feliz: sin drift, exit 0", () => {
    const esperado = esquema(`export const t = pgTable("t", { id: text("id").primaryKey() });`);
    const base = baseDeFilas([{ tabla: "t", columna: "id", data_type: "text", is_nullable: "NO", pk: true }]);
    const diferencia = diffEstados(base, esperado, { fuente: "schema" });
    expect(diferencia.hallazgos).toEqual([]);
    expect(codigoSalida(resumirDiferencias([diferencia]))).toBe(0);
  });

  it("columna declarada que falta en la base sale como columna-faltante y exit distinto de 0", () => {
    const esperado = esquema(`export const t = pgTable("t", { id: text("id").primaryKey(), sku: text("sku").notNull() });`);
    const base = baseDeFilas([{ tabla: "t", columna: "id", data_type: "text", is_nullable: "NO", pk: true }]);
    const diferencia = diffEstados(base, esperado, { fuente: "schema" });
    expect(diferencia.hallazgos).toEqual([{ tabla: "t", columna: "sku", categoria: "columna-faltante", detalle: "esperado text" }]);
    expect(codigoSalida(resumirDiferencias([diferencia]))).toBe(1);
  });

  it("columna de la base que el schema no declara sale como columna-sobrante", () => {
    const esperado = esquema(`export const t = pgTable("t", { id: text("id").primaryKey() });`);
    const base = baseDeFilas([
      { tabla: "t", columna: "id", data_type: "text", is_nullable: "NO" },
      { tabla: "t", columna: "vieja", data_type: "text", is_nullable: "YES" },
    ]);
    const diferencia = diffEstados(base, esperado, { fuente: "schema" });
    expect(diferencia.hallazgos).toContainEqual({ tabla: "t", columna: "vieja", categoria: "columna-sobrante", detalle: "base text" });
  });

  it("tipo divergente se reporta con ambos lados", () => {
    const esperado = esquema(`export const t = pgTable("t", { id: text("id").primaryKey(), total: bigint("total", { mode: "bigint" }).notNull() });`);
    const base = baseDeFilas([
      { tabla: "t", columna: "id", data_type: "text", is_nullable: "NO" },
      { tabla: "t", columna: "total", data_type: "integer", is_nullable: "NO" },
    ]);
    const diferencia = diffEstados(base, esperado, { fuente: "schema" });
    expect(diferencia.hallazgos).toContainEqual({
      tabla: "t",
      columna: "total",
      categoria: "tipo",
      detalle: "base=integer esperado=bigint",
    });
  });

  it("tabla declarada que no existe en la base sale como tabla-faltante", () => {
    const esperado = esquema(`export const nueva = pgTable("nueva", { id: text("id") });`);
    const base = baseDeFilas([{ tabla: "otra", columna: "id", data_type: "text", is_nullable: "YES" }]);
    const diferencia = diffEstados(base, esperado, { fuente: "schema" });
    expect(diferencia.hallazgos).toEqual(
      expect.arrayContaining([
        { tabla: "nueva", categoria: "tabla-faltante", detalle: "" },
        { tabla: "otra", categoria: "tabla-sobrante", detalle: "" },
      ]),
    );
  });

  it("default divergente y nulabilidad se reportan por columna", () => {
    const esperado = esquema(`export const t = pgTable("t", { estado: text("estado").notNull().default("pendiente") });`);
    const base = baseDeFilas([{ tabla: "t", columna: "estado", data_type: "text", is_nullable: "YES", default: "'activo'" }]);
    const diferencia = diffEstados(base, esperado, { fuente: "schema" });
    expect(diferencia.hallazgos).toEqual(
      expect.arrayContaining([
        { tabla: "t", columna: "estado", categoria: "nulabilidad", detalle: "base=NULL esperado=NOT NULL" },
        { tabla: "t", columna: "estado", categoria: "default", detalle: "base=activo esperado=pendiente" },
      ]),
    );
  });

  it("índice declarado que falta en la base se reporta", () => {
    const esperado = esquema(
      `export const t = pgTable("t", { a: text("a"), b: text("b") }, (t) => [uniqueIndex("t_ab_uq").on(t.a, t.b)]);`,
    );
    const base = baseDeFilas([
      { tabla: "t", columna: "a", data_type: "text", is_nullable: "YES" },
      { tabla: "t", columna: "b", data_type: "text", is_nullable: "YES" },
    ]);
    const diferencia = diffEstados(base, esperado, { fuente: "schema" });
    expect(diferencia.hallazgos).toContainEqual({
      tabla: "t",
      categoria: "indice-faltante",
      indice: "t_ab_uq",
      detalle: "esperado [a, b]",
    });
  });

  it("lee columnas de un indexdef de Postgres, incluidas expresiones y desc", () => {
    expect(columnasDesdeIndexDef('CREATE UNIQUE INDEX x ON public.t USING btree (tenant_id, lower(nombre)) WHERE (x IS NOT NULL)')).toEqual([
      "tenant_id",
      "lower(nombre)",
    ]);
    expect(columnasDesdeIndexDef("CREATE INDEX y ON public.t USING btree (creado_en DESC, id DESC)")).toEqual([
      "creado_en desc",
      "id desc",
    ]);
  });
});

describe("audit:db · archivos reales del repo", () => {
  const raiz = `${resolve(dirname(fileURLToPath(import.meta.url)), "..")}/`;

  it("parsea todo src/db/schema*.ts sin excepciones y con todas las columnas", () => {
    const dir = `${raiz}src/db`;
    const archivos = readdirSync(dir).filter((n) => /^schema.*\.ts$/.test(n));
    const estado: any = { tablas: {}, fks: [] };
    for (const nombre of archivos) fusionarEstados(estado, parsearEsquemaTS(readFileSync(`${dir}/${nombre}`, "utf8")));
    const tablas = Object.keys(estado.tablas);
    expect(archivos.length).toBeGreaterThan(10);
    expect(tablas.length).toBeGreaterThan(100);
    for (const tabla of tablas) expect(Object.keys(estado.tablas[tabla].columnas).length).toBeGreaterThan(0);
    expect(estado.tablas.products.columnas.precio_centavos).toMatchObject({ tipo: "bigint", notNull: true });
  });

  it("parsea todo drizzle/*.sql y reconoce las tablas del núcleo", () => {
    const dir = `${raiz}drizzle`;
    const archivos = readdirSync(dir).filter((n) => n.endsWith(".sql"));
    const estado = parsearMigracionesSql(archivos.map((nombre) => ({ nombre, sql: readFileSync(`${dir}/${nombre}`, "utf8") })));
    expect(archivos.length).toBeGreaterThan(10);
    expect(Object.keys(estado.tablas).length).toBeGreaterThan(50);
    for (const [tabla, def] of Object.entries(estado.tablas)) expect(Object.keys(def.columnas).length, tabla).toBeGreaterThan(0);
    expect(estado.tablas.products.columnas.precio_centavos.tipo).toBe("bigint");
    expect(estado.tablas.sales.columnas.tenant_id.tipo).toBe("uuid");
  });
});
