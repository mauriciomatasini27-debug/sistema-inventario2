import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { sslPostgresDesdeUrl } from "../scripts/db-migrate-lib.mjs";
import { aplicarHasta, crearBase } from "./helpers/migracion-pg.js";

const hayPG = Boolean(process.env.PG_TEST_URL_A);

describe("P1-76 migración 0045_shared_tenant_sellar_nucleo", () => {
  it("journal registra 0045, 0046 rubro, 0047 periferia, 0049 onboarding, 0050 respuestas y 0051 gmail", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string; when: number }[] };
    expect(journal.entries.some((e) => e.tag === "0045_shared_tenant_sellar_nucleo")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0046_tenants_rubro")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0047_shared_tenant_periferia")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0049_tenants_onboarding_wizard")).toBe(true);
    // TB-165 [tenant]: la 0050 agrega la columna durable de las respuestas del cuestionario.
    expect(journal.entries.some((e) => e.tag === "0050_tenants_wizard_respuestas")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0051_ggl_p240_gmail_dedupe_tenant")).toBe(true);
    // P10-90: la 0052 deja al job de retención anonimizar actor/detalle de la auditoría.
    expect(journal.entries.some((e) => e.tag === "0052_retencion_anonimiza_auditoria")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0053_servicios_pagos_tenant")).toBe(true);
    // P1-96: 0054 de devoluciones y 0055 de unicidad viven en main.
    expect(journal.entries.some((e) => e.tag === "0054_devolucion_por_comercio")).toBe(true);
    expect(journal.entries.some((e) => e.tag === "0055_unicidad_por_comercio")).toBe(true);
    // P10-93: la 0056 agrega products.por_peso (flag de venta por peso).
    expect(journal.entries.some((e) => e.tag === "0056_products_por_peso")).toBe(true);
    // P10-33: la 0057 renombra html/texto del outbox a su forma cifrada.
    expect(journal.entries.some((e) => e.tag === "0057_email_outbox_cifrado")).toBe(true);
    expect(journal.entries.length).toBe(readdirSync("drizzle").filter((f) => f.endsWith(".sql")).length);
    const i46 = journal.entries.findIndex((e) => e.tag === "0046_tenants_rubro");
    const i47 = journal.entries.findIndex((e) => e.tag === "0047_shared_tenant_periferia");
    expect(i46).toBe(46);
    expect(i47).toBe(47);
    expect(journal.entries[i47]!.when).toBeGreaterThan(journal.entries[i46]!.when);
  });
});

describe.skipIf(!hayPG)("P1-76 migración 0045 en Postgres", () => {
  it(
    "estado piloto (0044) con NULL → 0045 deja cero NULL y uniques compuestos",
    async () => {
      const nombre = `m45_piloto_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0044_piloto_schema_tenant_precios", url, { registrarAplicadas: true });
      const tid = randomUUID();
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        await db`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${tid}::uuid, 'Piloto', 'piloto-m45', 'demo', 'activo')`;
        await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector) values ('DEMO-1', 'Demo', 1000, 3, 'general')`;
        const n0 = await db`select count(*)::int as n from products where tenant_id is null`;
        expect(n0[0]?.n).toBe(1);
      } finally {
        await db.end();
      }
      execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      const db2 = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n1 = await db2`select count(*)::int as n from products where tenant_id is null`;
        expect(n1[0]?.n).toBe(0);
        const isNn = await db2`
          select is_nullable from information_schema.columns
          where table_schema='public' and table_name='products' and column_name='tenant_id'`;
        expect(isNn[0]?.is_nullable).toBe("NO");
        const tidB = randomUUID();
        await db2`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${tidB}::uuid, 'B', 'tenant-b-m45', 'demo', 'activo')`;
        await db2`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('MISMO-SKU', 'A', 100, 1, 'general', ${tid}::uuid)`;
        await db2`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('MISMO-SKU', 'B', 200, 1, 'general', ${tidB}::uuid)`;
        await expect(
          db2`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('MISMO-SKU', 'Dup', 50, 1, 'general', ${tid}::uuid)`,
        ).rejects.toThrow();
      } finally {
        await db2.end();
      }
    },
    300_000,
  );

  it(
    "duplicados (tenant_id, sku) abortan 0045 con mensaje claro",
    async () => {
      const nombre = `m45_dup_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0044_piloto_schema_tenant_precios", url, { registrarAplicadas: true });
      const tid = randomUUID();
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        await db`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${tid}::uuid, 'Dup', 'dup-m45', 'demo', 'activo')`;
        await db.unsafe(`ALTER TABLE "product_codes" DROP CONSTRAINT IF EXISTS "product_codes_sku_products_sku_fk"`);
        await db.unsafe(`ALTER TABLE "stock_lots" DROP CONSTRAINT IF EXISTS "stock_lots_sku_products_sku_fk"`);
        await db.unsafe(`ALTER TABLE "product_photos" DROP CONSTRAINT IF EXISTS "product_photos_sku_products_sku_fk"`);
        await db.unsafe(`ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_sku_unique"`);
        await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('X', 'Uno', 1, 0, 'general', ${tid}::uuid)`;
        await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector, tenant_id) values ('X', 'Dos', 2, 0, 'general', ${tid}::uuid)`;
      } finally {
        await db.end();
      }
      expect(() =>
        execFileSync("node", ["scripts/db-migrate.mjs"], {
          env: { ...process.env, TENANT_DATABASE_URL: url },
          encoding: "utf8",
          stdio: "pipe",
        }),
      ).toThrow();
    },
    300_000,
  );

  it(
    "estado tipo prod: demos mismo created_at, FK compuestas y ticket_counters",
    async () => {
      const nombre = `m45_prod_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0044_piloto_schema_tenant_precios", url, { registrarAplicadas: true });
      const ts = "2024-01-15T12:00:00.000Z";
      const t1 = randomUUID();
      const t2 = randomUUID();
      const t3 = randomUUID();
      const t4 = randomUUID();
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        for (const [id, nombre] of [
          [t1, "Almacén Don Pepe"],
          [t2, "Kiosco Lo de Mauri"],
          [t3, "Demo Tres"],
          [t4, "Demo Cuatro"],
        ] as const) {
          await db`insert into tenants (id, nombre_comercio, slug, plan, estado, es_demo, created_at)
            values (${id}::uuid, ${nombre}, ${nombre.toLowerCase().replace(/\s+/g, "-")}, 'demo', 'activo', true, ${ts}::timestamptz)`;
        }
        for (const sku of ["DEMO-A", "DEMO-B", "DEMO-C"]) {
          await db`insert into products (sku, nombre, precio_centavos, stock_actual, sector) values (${sku}, ${sku}, 100, 1, 'general')`;
          await db`insert into product_codes (codigo, sku, padre) values (${sku + "-EAN"}, ${sku}, null)`;
          await db`insert into stock_lots (sku, cantidad, cantidad_restante) values (${sku}, 1, 1)`;
          await db`insert into product_photos (sku, url) values (${sku}, ${"https://example.test/" + sku + ".jpg"})`;
        }
        await db`insert into ticket_counters (id, ultimo) values ('mostrador', 0) on conflict do nothing`;
        await db`insert into ticket_counters (id, ultimo) values ('devolucion', 0) on conflict do nothing`;
      } finally {
        await db.end();
      }
      execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      const db2 = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const fk = await db2`
          select c.conname, pg_get_constraintdef(c.oid) as def
          from pg_constraint c
          join pg_class t on c.conrelid = t.oid
          where t.relname in ('product_codes','stock_lots','product_photos')
            and c.contype = 'f'
            and c.conname like '%tenant_sku_products%'`;
        expect(fk.length).toBe(3);
        for (const row of fk) {
          expect(row.def).toContain("FOREIGN KEY (tenant_id, sku)");
        }
        const nProdNull = await db2`select count(*)::int as n from products where tenant_id is null`;
        expect(nProdNull[0]?.n).toBe(0);
        const fallback = [t1, t2, t3, t4].sort()[0];
        const demoA = await db2`select tenant_id from products where sku = 'DEMO-A' limit 1`;
        const demoB = await db2`select tenant_id from products where sku = 'DEMO-B' limit 1`;
        expect(demoA[0]?.tenant_id).toBe(fallback);
        expect(demoB[0]?.tenant_id).toBe(fallback);
        const cont = await db2`select count(*)::int as n from ticket_counters where tenant_id is null`;
        expect(cont[0]?.n).toBe(0);
      } finally {
        await db2.end();
      }
    },
    300_000,
  );

  it(
    "base vacía: runner 0001..0047 sin error",
    async () => {
      const nombre = `m45_vacia_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      const out = execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(out).toContain("ok: migrate completo");
      expect(out).toContain("0047_shared_tenant_periferia");
      const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
        expect(n[0]?.n).toBe(journal.entries.length);
        const tc = await db`select count(*)::int as n from ticket_counters`;
        expect(tc[0]?.n).toBe(0);
        const custNn = await db`
          select is_nullable from information_schema.columns
          where table_schema='public' and table_name='customers' and column_name='tenant_id'`;
        expect(custNn[0]?.is_nullable).toBe("NO");
      } finally {
        await db.end();
      }
    },
    300_000,
  );
});

describe.skipIf(!hayPG)("P1-81 migración 0047 tras 0046", () => {
  it(
    "con 0046 aplicada corren 0047, 0048, 0049 y 0050; reintento sin error",
    async () => {
      const nombre = `m47_post46_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0046_tenants_rubro", url, { registrarAplicadas: true });
      const db0 = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n = await db0`select count(*)::int as n from drizzle.__drizzle_migrations`;
        expect(n[0]?.n).toBe(47);
      } finally {
        await db0.end();
      }
      const out1 = execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(out1).toMatch(/pendientes=1|0047_shared_tenant_periferia/);
      expect(out1).toContain("0047_shared_tenant_periferia");
      const out2 = execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(out2).toContain("nada pendiente");
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const n = await db`select count(*)::int as n from drizzle.__drizzle_migrations`;
        // P1-96 + P10-93 [plataforma]: el wrapper aplica hasta la última migración del journal (0056 incluida).
        const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
        expect(n[0]?.n).toBe(journal.entries.length);
      } finally {
        await db.end();
      }
    },
    300_000,
  );
});

describe.skipIf(!hayPG)("ON12 migración 0049_tenants_onboarding_wizard en Postgres", () => {
  it(
    "agrega las columnas, marca los tenants preexistentes completos y deja los nuevos incompletos",
    async () => {
      const nombre = `m49_onboarding_${Date.now()}`;
      const url = await crearBase(nombre, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0048_ggl_p0_huecos", url, { registrarAplicadas: true });
      const viejo = randomUUID();
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        await db`insert into tenants (id, nombre_comercio, slug, plan, estado, created_at) values (${viejo}::uuid, 'Viejo', 'viejo-49', 'demo', 'activo', now() - interval '1 day')`;
      } finally {
        await db.end();
      }

      execFileSync("node", ["scripts/db-migrate.mjs"], {
        env: { ...process.env, TENANT_DATABASE_URL: url },
        encoding: "utf8",
      });

      const db2 = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      try {
        const cols = await db2`
          select column_name from information_schema.columns
          where table_schema='public' and table_name='tenants' and column_name in ('wizard_completado','wizard_paso','wizard_respuestas')
          order by column_name`;
        expect(cols.map((c) => c.column_name)).toEqual([
          "wizard_completado", "wizard_paso", "wizard_respuestas",
        ]);

        const filaVieja = await db2`select wizard_completado, wizard_paso from tenants where id = ${viejo}::uuid`;
        expect(filaVieja[0]?.wizard_completado).toBe(true);
        expect(filaVieja[0]?.wizard_paso).toBe(5);

        const nuevo = randomUUID();
        await db2`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${nuevo}::uuid, 'Nuevo', 'nuevo-49', 'demo', 'activo')`;
        const filaNueva = await db2`select wizard_completado, wizard_paso, wizard_respuestas from tenants where id = ${nuevo}::uuid`;
        expect(filaNueva[0]?.wizard_completado).toBe(false);
        expect(filaNueva[0]?.wizard_paso).toBe(0);
        // TB-165 [tenant]: la 0050 deja el default vacío; las respuestas se escriben al completar.
        expect(filaNueva[0]?.wizard_respuestas).toEqual({});
      } finally {
        await db2.end();
      }
    },
    300_000,
  );
});

// P10-90: la 0053 agrega tenant_id a servicios y pagos y completa las filas
// viejas solo cuando la relación da un único comercio.
describe.skipIf(!hayPG)("P10-90 migración 0053 tenant_id en servicios y pagos", () => {
  it(
    "completa por egreso, mensaje, facturas y órdenes; deja null lo ambiguo o sin relación",
    async () => {
      const url = await crearBase(`m53_backfill_${Date.now()}`, process.env.PG_TEST_URL_A ?? "");
      await aplicarHasta("0052_retencion_anonimiza_auditoria", url, { registrarAplicadas: true });
      const db = postgres(url, { max: 1, ssl: sslPostgresDesdeUrl(url) });
      const t1 = randomUUID();
      const t2 = randomUUID();
      const ids = { cm: randomUUID(), ordenA: randomUUID(), ordenB: randomUUID(), ordenC: randomUUID(), payeeSolo: randomUUID(), payeeMixto: randomUUID(), payeeSuelto: randomUUID(), cuentaA: randomUUID(), cuentaB: randomUUID(), cuentaSuelta: randomUUID(), factA: randomUUID(), factB: randomUUID() };
      try {
        for (const [id, slug] of [[t1, `m53-a-${t1.slice(0, 6)}`], [t2, `m53-b-${t2.slice(0, 6)}`]] as const) {
          await db`insert into tenants (id, nombre_comercio, slug, plan, estado) values (${id}::uuid, 'T', ${slug}, 'base', 'activo')`;
        }
        const cm2 = randomUUID();
        await db`insert into cash_movements (id, tipo, origen, categoria_id, metodo, idempotency_key, tenant_id, monto_centavos) values (${ids.cm}::uuid, 'egreso', 'orden_pago', 'pagos', 'efectivo', ${randomUUID()}, ${t1}::uuid, 100)`;
        await db`insert into cash_movements (id, tipo, origen, categoria_id, metodo, idempotency_key, tenant_id, monto_centavos) values (${cm2}::uuid, 'egreso', 'orden_pago', 'pagos', 'efectivo', ${randomUUID()}, ${t2}::uuid, 100)`;
        for (const id of [ids.payeeSolo, ids.payeeMixto, ids.payeeSuelto]) await db`insert into payees (id, nombre) values (${id}::uuid, 'Beneficiario')`;
        const orden = (id: string, payee: string, cm: string | null) => db`
          insert into payment_orders (id, idempotency_key, numero, payee_id, concepto, monto_centavos, vence_el, metodo_sugerido, instruccion_tipo, instruccion_snapshot, creado_por, cash_movement_id)
          values (${id}::uuid, ${randomUUID()}, ${`OP-${id.slice(0, 8)}`}, ${payee}::uuid, 'Luz', 100, now(), 'Transferencia', 'datos', ${db.json({})}, 'sub', ${cm}::uuid)
        `;
        await orden(ids.ordenA, ids.payeeSolo, ids.cm);
        await orden(ids.ordenB, ids.payeeMixto, cm2);
        await orden(ids.ordenC, ids.payeeMixto, ids.cm);
        const sinRelacion = randomUUID();
        await orden(sinRelacion, ids.payeeSuelto, null);
        for (const id of [ids.cuentaA, ids.cuentaB, ids.cuentaSuelta]) await db`insert into service_accounts (id, servicio, proveedor, titular) values (${id}::uuid, 'luz', 'EPEC', 'Juana')`;
        await db`insert into email_ingestion_drafts (tenant_id, message_id, origen, vence_en) values (${t1}::uuid, 'msg-solo', 'pdf_digital', now())`;
        await db`insert into email_ingestion_drafts (tenant_id, message_id, origen, vence_en) values (${t1}::uuid, 'msg-compartido', 'pdf_digital', now())`;
        await db`insert into email_ingestion_drafts (tenant_id, message_id, origen, vence_en) values (${t2}::uuid, 'msg-compartido', 'pdf_digital', now())`;
        await db`insert into utility_bills (id, account_id, message_id, periodo, vencimiento, monto_centavos, origen) values (${ids.factA}::uuid, ${ids.cuentaA}::uuid, 'msg-solo', '2026-10', '2026-11-10', 100, 'pdf_digital')`;
        await db`insert into utility_bills (id, account_id, message_id, periodo, vencimiento, monto_centavos, origen) values (${ids.factB}::uuid, ${ids.cuentaB}::uuid, 'msg-compartido', '2026-10', '2026-11-10', 100, 'pdf_digital')`;

        execFileSync("node", ["scripts/db-migrate.mjs"], { env: { ...process.env, TENANT_DATABASE_URL: url }, encoding: "utf8" });

        const tenantDe = async (tabla: string, id: string) =>
          ((await db.unsafe(`select tenant_id::text as t from "${tabla}" where id = $1`, [id]))[0] as { t: string | null } | undefined)?.t ?? null;
        expect(await tenantDe("payment_orders", ids.ordenA)).toBe(t1);
        expect(await tenantDe("payment_orders", ids.ordenB)).toBe(t2);
        expect(await tenantDe("payment_orders", sinRelacion)).toBeNull();
        expect(await tenantDe("payees", ids.payeeSolo)).toBe(t1);
        expect(await tenantDe("payees", ids.payeeMixto)).toBeNull();
        expect(await tenantDe("payees", ids.payeeSuelto)).toBeNull();
        expect(await tenantDe("utility_bills", ids.factA)).toBe(t1);
        expect(await tenantDe("utility_bills", ids.factB)).toBeNull();
        expect(await tenantDe("service_accounts", ids.cuentaA)).toBe(t1);
        expect(await tenantDe("service_accounts", ids.cuentaB)).toBeNull();
        expect(await tenantDe("service_accounts", ids.cuentaSuelta)).toBeNull();
        // P10-90: re-correr no cambia nada.
        const out = execFileSync("node", ["scripts/db-migrate.mjs"], { env: { ...process.env, TENANT_DATABASE_URL: url }, encoding: "utf8" });
        expect(out).toContain("nada pendiente");
      } finally {
        await db.end();
      }
    },
    300_000,
  );
});
