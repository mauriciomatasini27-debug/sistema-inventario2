import { describe, expect, it } from "vitest";
import {
  analizarFuente,
  extraerPlantillasSql,
  formatearHallazgo,
  parsearReferencias,
  resolverInterpolaciones,
  verificarReferencias,
} from "../scripts/check-columnas-lib.mjs";

const estado = {
  tablas: {
    products: {
      columnas: {
        tenant_id: {},
        sku: {},
        nombre: {},
        precio_centavos: {},
        stock_actual: {},
        min_stock: {},
        sector: {},
      },
    },
    product_aliases: { columnas: { tenant_id: {}, sku: {}, alias: {}, alias_norm: {} } },
    tickets: { columnas: { id: {}, sale_id: {}, definitivo: {}, tenant_id: {} } },
    sales: { columnas: { id: {}, idempotency_key: {}, tenant_id: {} } },
    fiscal_documents: { columnas: { id: {}, estado: {}, intentos: {}, proximo_intento: {} } },
    outbox: { columnas: { id: {}, payload: {}, tenant_id: {} } },
  },
};

const exportaciones = new Map([
  ["products", { tabla: "products", propiedades: { sku: "sku", tenantId: "tenant_id", precioCentavos: "precio_centavos" } }],
  ["tickets", { tabla: "tickets", propiedades: { id: "id", saleId: "sale_id", definitivo: "definitivo" } }],
  ["sales", { tabla: "sales", propiedades: { id: "id", idempotencyKey: "idempotency_key" } }],
]);

const refs = (sql: string) => parsearReferencias(sql);
const hallazgos = (sql: string) => verificarReferencias(estado, refs(sql));
const extraer = (fuente: string) => {
  const [plantilla] = extraerPlantillasSql(fuente);
  if (!plantilla) throw new Error("sin template sql`` en la fuente");
  return plantilla;
};

describe("check:columnas · extracción de sql`` en TypeScript", () => {
  it("encuentra el template, su línea y sus interpolaciones", () => {
    const fuente = ["const x = 1;", "await db.execute(sql`", "  select * from products", "`);"].join("\n");
    const plantilla = extraer(fuente);
    expect(plantilla.linea).toBe(2);
    expect(plantilla.sql).toContain("select * from products");
  });

  it("guarda la expresión interpolada y su offset", () => {
    const plantilla = extraer("const q = sql`select ${products.sku} from ${products}`;");
    expect(plantilla.exprs.map((e) => e.expr)).toEqual(["products.sku", "products"]);
    expect(plantilla.sql).toBe("select ? from ?");
  });

  it("no se rompe con un template anidado en la interpolación", () => {
    const fuente = ["sql`update t set ${sql.join(sets, sql`, `)} where id = ${id}`;"].join("\n");
    const plantilla = extraer(fuente);
    expect(plantilla.sql).toBe("update t set ? where id = ?");
  });

  it("ignora los sql`` que están dentro de un comentario", () => {
    const fuente = ["// serializa Date dentro de un sql`` crudo.", "const q = sql`select 1`;"].join("\n");
    expect(extraerPlantillasSql(fuente)).toHaveLength(1);
    expect(extraer(fuente).sql).toBe("select 1");
  });
});

describe("check:columnas · resolución contra los exports del schema", () => {
  const resolver = (fuente: string) => resolverInterpolaciones(extraer(fuente), exportaciones);

  it("resuelve ${tabla} al nombre real de la tabla", () => {
    const { sql, refs: referencias } = resolver("sql`update ${tickets} set definitivo = 1`;");
    expect(sql).toBe('update "tickets" set definitivo = 1');
    expect(referencias).toEqual([{ tabla: "tickets", columna: null }]);
  });

  it("resuelve ${tabla.propiedad} a la columna real", () => {
    const { sql, refs: referencias } = resolver("sql`where ${tickets.saleId} = ${sales.id}`;");
    expect(sql).toBe('where "tickets"."sale_id" = "sales"."id"');
    expect(referencias).toEqual([
      { tabla: "tickets", columna: "sale_id" },
      { tabla: "sales", columna: "id" },
    ]);
  });

  it("deja un placeholder cuando la expresión no es del schema", () => {
    const { sql, refs: referencias } = resolver("sql`where id = ${valor}`;");
    expect(sql).toBe("where id = ?");
    expect(referencias).toEqual([]);
  });
});

describe("check:columnas · tablas y columnas de una sentencia", () => {
  it("valida las columnas de una tabla única y saltea alias de salida", () => {
    const r = refs("SELECT sku, stock_actual AS stock, COALESCE(min_stock, 0) AS umbral FROM products WHERE sku = ?");
    expect(r.tablas.map((t) => t.nombre)).toEqual(["products"]);
    const columnas = r.columnas.map((c) => c.columna);
    expect(columnas).toContain("sku");
    expect(columnas).toContain("stock_actual");
    expect(columnas).toContain("min_stock");
    expect(columnas).not.toContain("stock");
    expect(columnas).not.toContain("umbral");
  });

  it("valida columnas calificadas y usa el alias del join", () => {
    const r = refs("select p.sku, a.alias from products p inner join product_aliases a on p.sku = a.sku");
    expect(r.tablas.map((t) => t.nombre).sort()).toEqual(["product_aliases", "products"]);
    expect(r.columnas).toEqual([
      { tabla: "products", columna: "sku" },
      { tabla: "product_aliases", columna: "alias" },
      { tabla: "product_aliases", columna: "sku" },
    ]);
  });

  it("valida la lista de columnas del insert", () => {
    const r = refs("insert into products (sku, nombre, precio_centavos) values (?, ?, ?) on conflict do nothing");
    expect(r.columnas).toEqual([
      { tabla: "products", columna: "sku" },
      { tabla: "products", columna: "nombre" },
      { tabla: "products", columna: "precio_centavos" },
    ]);
  });

  it("valida los destinos del set y no confunde `on conflict do update` con otra tabla", () => {
    const r = refs("update products set nombre = ?, es_fiscal = 1 where sku = ?");
    expect(r.tablas.map((t) => t.nombre)).toEqual(["products"]);
    expect(r.columnas).toContainEqual({ tabla: "products", columna: "nombre" });

    const upsert = refs("insert into products (sku) values (?) on conflict (sku) do update set nombre = excluded.nombre");
    expect(upsert.tablas.map((t) => t.nombre)).toEqual(["products"]);
  });

  it("saca los nombres de CTE de la lista de tablas y no valida columnas ambiguas", () => {
    const r = refs(
      "with ranked as (select sku, max(score) as score from products group by sku) select sku, score from ranked order by score desc",
    );
    expect(r.tablas.filter((t) => !t.cte).map((t) => t.nombre)).toEqual(["products"]);
    expect(r.tablas.find((t) => t.nombre === "ranked")?.cte).toBe(true);
    expect(hallazgos("with ranked as (select sku, score from products) select sku, score from ranked")).toEqual([]);
  });

  it("saltea funciones, casts y literales", () => {
    const r = refs("select count(*), now(), 'texto', 1.0::float8 from products where sku = 'abc'");
    expect(r.columnas).toEqual([{ tabla: "products", columna: "sku" }]);
    expect(hallazgos("select count(*), now(), 'texto', 1.0::float8 from products where sku = 'abc'")).toEqual([]);
  });
});

describe("check:columnas · hallazgos", () => {
  it("no reporta nada cuando todo existe", () => {
    expect(hallazgos("select sku, nombre from products where tenant_id = ?")).toEqual([]);
  });

  it("reporta la tabla inexistente", () => {
    expect(hallazgos("select * from productoz")).toEqual([{ tipo: "tabla", tabla: "productoz" }]);
  });

  it("reporta la columna inexistente con la tabla", () => {
    expect(hallazgos("select sku, inexistente from products")).toEqual([
      { tipo: "columna", tabla: "products", columna: "inexistente" },
    ]);
  });

  it("reporta la columna inexistente en un set y en una lista de insert", () => {
    expect(hallazgos("update fiscal_documents set estado = ?, otro = 1")).toEqual([
      { tipo: "columna", tabla: "fiscal_documents", columna: "otro" },
    ]);
    expect(hallazgos("insert into products (sku, otro) values (?, ?)")).toEqual([
      { tipo: "columna", tabla: "products", columna: "otro" },
    ]);
  });

  it("analizarFuente devuelve el file:line de la referencia rota", () => {
    const fuente = ["const a = 1;", "await db.execute(sql`", "  select sku, faltante from products", "`);"].join("\n");
    const resultado = analizarFuente("src/lib/repos/fake.ts", fuente, estado, exportaciones);
    expect(resultado).toEqual([{ archivo: "src/lib/repos/fake.ts", linea: 2, tipo: "columna", tabla: "products", columna: "faltante" }]);
    expect(formatearHallazgo(resultado[0])).toBe(
      "src/lib/repos/fake.ts:2: columna inexistente products.faltante (no está en src/db/schema*.ts)",
    );
  });

  it("analizarFuente reporta una tabla interpolada que no existe", () => {
    const fuente = "sql`select * from ${productosViejos}`;";
    const exportacionesRotas = new Map([["productosViejos", { tabla: "productos_viejos", propiedades: {} }]]);
    const resultado = analizarFuente("src/x.ts", fuente, estado, exportacionesRotas);
    expect(resultado).toEqual([{ archivo: "src/x.ts", linea: 1, tipo: "tabla", tabla: "productos_viejos" }]);
  });
});
