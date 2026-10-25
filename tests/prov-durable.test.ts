import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { control, resetStore } from "../src/lib/store.js";
import {
  contactoPorNumero,
  guardarContacto,
  guardarCupo,
  guardarInvitacion,
  invitacionPorHash,
  leerCupo,
  listarContactos,
} from "../src/lib/repos/proveedor-wa.js";
import type { ContactoProveedor, InvitacionProveedor } from "../src/modules/whatsapp/proveedor.js";

const URL_A = process.env.PG_TEST_URL_A;
const TENANT_A = "prov-dur-a";
const TENANT_B = "prov-dur-b";
const NUM_A = "+5491100099001";
const NUM_B = "+5491100099002";
const HASH_A = "hash-prov-dur-a";
const HASH_B = "hash-prov-dur-b";
const CREADO = "2026-10-25T12:00:00.000Z";

function contacto(numero: string, tenantId: string, estado: ContactoProveedor["estado"]): ContactoProveedor {
  return { numeroE164: numero, tenantId, supplierCuit: numero === NUM_A ? "20933331726" : null, estado, creadoEn: CREADO };
}

function invitacion(hash: string, tenantId: string, usado = false): InvitacionProveedor {
  return { tenantId, supplierCuit: null, codigoHash: hash, expiraEn: 1_700_000_000_000, usado };
}

function tirarEspejo(): void {
  control.proveedorContactos.clear();
  control.proveedorInvitaciones.clear();
  control.proveedorCupo.clear();
  control.proveedorCupoAviso.clear();
}

async function vaciar(sql: ReturnType<typeof postgres> | null): Promise<void> {
  if (!sql) return;
  await sql`delete from proveedor_cupo`;
  await sql`delete from proveedor_invitaciones`;
  await sql`delete from proveedor_contactos`;
}

describe("PROV-durable sin base", () => {
  beforeEach(() => {
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env[`TENANT_DATABASE_URL_${TENANT_A}`];
    delete process.env[`TENANT_DATABASE_URL_${TENANT_B}`];
    resetStore();
  });

  it("sin base el espejo es la copia y un clear la pierde", async () => {
    await guardarInvitacion(invitacion(HASH_A, TENANT_A));
    await guardarContacto(contacto(NUM_A, TENANT_A, "pendiente"));
    await guardarContacto(contacto(NUM_B, TENANT_B, "verificado"));
    expect((await listarContactos(TENANT_A)).map((c) => c.numeroE164)).toEqual([NUM_A]);
    expect(await invitacionPorHash(HASH_A)).toMatchObject({ tenantId: TENANT_A, usado: false });
    tirarEspejo();
    expect(await invitacionPorHash(HASH_A)).toBeNull();
    expect(await contactoPorNumero(NUM_A)).toBeNull();
    expect(await listarContactos(TENANT_A)).toEqual([]);
  });
});

describe.skipIf(!URL_A)("PROV-durable contra Postgres", () => {
  let url = "";
  let sql: ReturnType<typeof postgres> | null = null;

  beforeAll(async () => {
    url = await asegurarBasePrivada("prov_durable", URL_A ?? "");
    sql = postgres(url, { max: 1 });
  });

  beforeEach(async () => {
    delete process.env.TENANT_MODE;
    process.env.TENANT_DATABASE_URL = url;
    delete process.env[`TENANT_DATABASE_URL_${TENANT_A}`];
    delete process.env[`TENANT_DATABASE_URL_${TENANT_B}`];
    resetStore();
    await vaciar(sql);
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.TENANT_DATABASE_URL;
    delete process.env.TENANT_MODE;
  });

  it("un clear del espejo no pierde invitación, contacto ni cupo", async () => {
    await guardarInvitacion(invitacion(HASH_A, TENANT_A));
    await guardarContacto(contacto(NUM_A, TENANT_A, "pendiente"));
    await guardarContacto(contacto(NUM_B, TENANT_B, "verificado"));
    await guardarCupo(NUM_A, TENANT_A, [1_000, 2_000], true);

    tirarEspejo();
    expect(control.proveedorContactos.size).toBe(0);
    expect(control.proveedorInvitaciones.size).toBe(0);
    expect(control.proveedorCupo.size).toBe(0);

    expect(await invitacionPorHash(HASH_A)).toEqual(invitacion(HASH_A, TENANT_A));
    expect(await contactoPorNumero(NUM_A)).toEqual(contacto(NUM_A, TENANT_A, "pendiente"));
    expect(await leerCupo(NUM_A, TENANT_A)).toEqual({ marcasMs: [1_000, 2_000], aviso: true });

    const listaA = (await listarContactos(TENANT_A)).map((c) => c.numeroE164);
    const listaB = (await listarContactos(TENANT_B)).map((c) => c.numeroE164);
    expect(listaA).toEqual([NUM_A]);
    expect(listaB).toEqual([NUM_B]);

    const cliente = sql;
    if (!cliente) throw new Error("sin cliente de prueba");
    const [conteo] = await cliente<{ n: number }[]>`select count(*)::int as n from proveedor_contactos`;
    expect(conteo?.n).toBe(2);
  });
});

describe.skipIf(!URL_A)("PROV-durable en dos bases", () => {
  let urlA = "";
  let urlB = "";
  let sqlA: ReturnType<typeof postgres> | null = null;
  let sqlB: ReturnType<typeof postgres> | null = null;

  beforeAll(async () => {
    urlA = await asegurarBasePrivada("prov_durable_a", URL_A ?? "");
    urlB = await asegurarBasePrivada("prov_durable_b", URL_A ?? "");
    sqlA = postgres(urlA, { max: 1 });
    sqlB = postgres(urlB, { max: 1 });
  });

  beforeEach(async () => {
    process.env.TENANT_MODE = "multi";
    delete process.env.TENANT_DATABASE_URL;
    process.env[`TENANT_DATABASE_URL_${TENANT_A}`] = urlA;
    process.env[`TENANT_DATABASE_URL_${TENANT_B}`] = urlB;
    resetStore();
    await vaciar(sqlA);
    await vaciar(sqlB);
  });

  afterAll(async () => {
    await sqlA?.end();
    await sqlB?.end();
    delete process.env.TENANT_MODE;
    delete process.env.TENANT_DATABASE_URL;
    delete process.env[`TENANT_DATABASE_URL_${TENANT_A}`];
    delete process.env[`TENANT_DATABASE_URL_${TENANT_B}`];
  });

  it("el contacto del comercio B no aparece en A y sigue hallable por número", async () => {
    await guardarInvitacion(invitacion(HASH_B, TENANT_B));
    await guardarContacto(contacto(NUM_B, TENANT_B, "pendiente"));
    await guardarCupo(NUM_B, TENANT_B, [7], false);
    tirarEspejo();

    expect(await listarContactos(TENANT_A)).toEqual([]);
    expect(await contactoPorNumero(NUM_B)).toEqual(contacto(NUM_B, TENANT_B, "pendiente"));
    expect(await invitacionPorHash(HASH_B)).toEqual(invitacion(HASH_B, TENANT_B));
    expect(await leerCupo(NUM_B, TENANT_B)).toEqual({ marcasMs: [7], aviso: false });

    const enA = sqlA;
    const enB = sqlB;
    if (!enA || !enB) throw new Error("sin cliente de prueba");
    const [cuentaA] = await enA<{ n: number }[]>`
      select count(*)::int as n from proveedor_contactos where numero_e164 = ${NUM_B}
    `;
    const [cuentaB] = await enB<{ n: number }[]>`
      select count(*)::int as n from proveedor_contactos where numero_e164 = ${NUM_B}
    `;
    expect(cuentaA?.n).toBe(0);
    expect(cuentaB?.n).toBe(1);
  });
});
