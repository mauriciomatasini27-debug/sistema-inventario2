import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import { ejecutarRetencionClientes, NOMBRE_CLIENTE_ANONIMO, NUMERO_ANONIMO } from "../src/jobs/retencion-clientes.js";
import { ejecutarPurgaDemos } from "../src/jobs/purga-demos.js";
import { control, resetStore } from "../src/lib/store.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);
const AHORA = new Date();
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

// P10-90: retención de 90 días contra Postgres real (base privada del archivo).
describe.skipIf(!hayPG)("P10-90 retención de datos de clientes", () => {
  let sql: ReturnType<typeof postgres>;
  const ids = { a91: "", b89: "", activo: "", demo: "", sinFecha: "" };
  const numSolo = `+549351${Math.floor(Math.random() * 1e7)}`;
  const numCompartido = `+549352${Math.floor(Math.random() * 1e7)}`;
  const numActivo = `+549353${Math.floor(Math.random() * 1e7)}`;

  async function tenant(nombre: string, estado: string, extra: { esDemo?: boolean; trialHasta?: string } = {}) {
    const [f] = await sql<{ id: string }[]>`
      insert into tenants (nombre_comercio, slug, estado, plan, es_demo, trial_hasta)
      values (${nombre}, ${`ret-${randomUUID().slice(0, 8)}`}, ${estado}, 'base', ${extra.esDemo ?? false}, ${extra.trialHasta ?? null})
      returning id
    `;
    if (!f) throw new Error("no se creó el tenant");
    return f.id;
  }

  async function baja(tenantId: string, cuando: string) {
    await sql`
      insert into tenant_lifecycle_events (tenant_id, de_estado, a_estado, motivo, actor, idempotency_key, creado_en)
      values (${tenantId}, 'activo', 'baja', 'test', 'test', ${`ret-${randomUUID()}`}, ${cuando})
    `;
  }

  async function sembrar(tenantId: string, numero: string) {
    const [c] = await sql<{ id: string }[]>`
      insert into customers (tenant_id, nombre, telefono, dni, notas)
      values (${tenantId}, 'Juana Pérez', '3515550000', '30111222', 'paga los viernes')
      returning id
    `;
    if (!c) throw new Error("no se creó el cliente");
    await sql`
      insert into customer_movements (tenant_id, customer_id, tipo, debe_centavos, idempotency_key, motivo)
      values (${tenantId}, ${c.id}, 'venta_fiado', 1500, ${randomUUID()}, 'fiado de Juana')
    `;
    await sql`
      insert into sales (tenant_id, idempotency_key, medio, total_centavos, client_occurred_at)
      values (${tenantId}, ${randomUUID()}, 'efectivo', 1500, now())
    `;
    await sql`
      insert into fiscal_customers (tenant_id, doc_tipo, doc_nro, nombre, domicilio)
      values (${tenantId}, '96', '30111222', 'Juana Pérez', 'San Martín 100')
    `;
    await sql`
      insert into fiscal_documents (idempotency_key, tenant_id, cbte_tipo, pto_vta, cbte_fch, doc_tipo, doc_nro, cond_iva_receptor, imp_total_centavos)
      values (${randomUUID()}, ${tenantId}, '11', '1', '20260801', '96', 30111222, '5', 1500)
    `;
    await sql`insert into whatsapp_identities (tenant_id, numero, estado) values (${tenantId}, ${numero}, 'activo')`;
    await sql`
      insert into whatsapp_usage (tenant_id, numero_e164, wamid, tipo, costo_centavos)
      values (${tenantId}, ${numero}, ${`wamid.${randomUUID()}`}, 'plantilla', 3)
    `;
    await sql`
      insert into bot_turnos (tenant_id, wamid, numero_e164, google_sub, pregunta, respuesta, fuente)
      values (${tenantId}, ${`wamid.${randomUUID()}`}, ${numero}, 'sub-ret', '¿cuánto debe Juana?', '$15', 'db')
    `;
    await sql`
      insert into notification_preferences (tenant_id, google_sub, canal, opt_in, opt_in_texto)
      values (${tenantId}, ${`sub-${randomUUID().slice(0, 6)}`}, 'whatsapp', true, 'ALTA')
    `;
    const [o] = await sql<{ id: string }[]>`
      insert into email_outbox (tenant_id, destinatario, asunto, html, texto, idempotency_key)
      values (${tenantId}, 'duena@ejemplo.com', 'Cierre', '<p>x</p>', 'x', ${randomUUID()})
      returning id
    `;
    if (!o) throw new Error("no se creó el email");
    await sql`insert into delivery_status (tenant_id, outbox_id, evento) values (${tenantId}, ${o.id}, 'entregado')`;
  }

  async function datos(tenantId: string) {
    const [r] = await sql<Record<string, string | number | null>[]>`
      select
        (select nombre from customers where tenant_id = ${tenantId} limit 1) as nombre,
        (select telefono from customers where tenant_id = ${tenantId} limit 1) as telefono,
        (select dni from customers where tenant_id = ${tenantId} limit 1) as dni,
        (select saldo_cache_centavos::int from customers where tenant_id = ${tenantId} limit 1) as saldo,
        (select count(*)::int from customer_movements where tenant_id = ${tenantId}) as movimientos,
        (select count(*)::int from customer_movements where tenant_id = ${tenantId} and motivo is not null) as motivos,
        (select count(*)::int from sales where tenant_id = ${tenantId}) as ventas,
        (select count(*)::int from fiscal_documents where tenant_id = ${tenantId}) as comprobantes,
        (select count(*)::int from fiscal_customers where tenant_id = ${tenantId}) as receptores,
        (select count(*)::int from whatsapp_identities where tenant_id = ${tenantId}) as identidades,
        (select count(*)::int from whatsapp_usage where tenant_id = ${tenantId}) as usos,
        (select count(*)::int from whatsapp_usage where tenant_id = ${tenantId} and numero_e164 <> ${NUMERO_ANONIMO}) as usos_con_numero,
        (select count(*)::int from bot_turnos where tenant_id = ${tenantId}) as turnos,
        (select count(*)::int from notification_preferences where tenant_id = ${tenantId}) as prefs,
        (select count(*)::int from email_outbox where tenant_id = ${tenantId}) as emails,
        (select count(*)::int from auth_events where tenant_id = ${tenantId} and tipo = 'retencion_clientes_aplicada') as eventos
    `;
    if (!r) throw new Error("sin fila");
    return r;
  }

  const sesiones = async (n: string) => (await sql`select 1 from whatsapp_sessions where numero_e164 = ${n}`).length;
  const codigos = async (n: string) => (await sql`select 1 from whatsapp_codes where numero_e164 = ${n}`).length;

  beforeAll(async () => {
    const url = await asegurarBasePrivada("retencion_clientes_pg", URL_A!);
    process.env.CONTROL_DATABASE_URL = url;
    process.env.TENANT_DATABASE_URL = url;
    delete process.env.TENANT_MODE;
    sql = postgres(url, { max: 1 });

    ids.a91 = await tenant("Cerrado 91", "baja");
    ids.b89 = await tenant("Cerrado 89", "baja");
    ids.activo = await tenant("Activo", "activo");
    ids.demo = await tenant("Demo vieja", "baja", { esDemo: true, trialHasta: haceDias(100) });
    ids.sinFecha = await tenant("Baja sin fecha", "baja");
    await baja(ids.a91, haceDias(91));
    await baja(ids.b89, haceDias(89));
    // P10-90: un evento de baja viejo no alcanza si el comercio volvió a estar activo.
    await baja(ids.activo, haceDias(200));

    await sembrar(ids.a91, numSolo);
    await sembrar(ids.b89, `+549354${Math.floor(Math.random() * 1e7)}`);
    await sembrar(ids.activo, numActivo);
    await sembrar(ids.demo, `+549355${Math.floor(Math.random() * 1e7)}`);
    await sembrar(ids.sinFecha, `+549356${Math.floor(Math.random() * 1e7)}`);
    // P10-90: numCompartido queda vinculado al cerrado y a un comercio activo.
    await sql`insert into whatsapp_identities (tenant_id, numero, estado) values (${ids.a91}, ${numCompartido}, 'activo')`;
    await sql`insert into whatsapp_identities (tenant_id, numero, estado) values (${ids.activo}, ${numCompartido}, 'activo')`;
    for (const n of [numSolo, numCompartido, numActivo]) {
      await sql`insert into whatsapp_sessions (numero_e164) values (${n})`;
      await sql`
        insert into whatsapp_codes (numero_e164, codigo_hash, expira_en)
        values (${n}, 'hash', now() + interval '10 minutes')
      `;
    }
  });

  afterAll(async () => {
    await sql?.end();
    delete process.env.CONTROL_DATABASE_URL;
    delete process.env.TENANT_DATABASE_URL;
  });

  it("a los 91 días anonimiza clientes y borra WhatsApp y emails, y conserva ventas, saldos y comprobantes", async () => {
    const r = await ejecutarRetencionClientes(AHORA);
    expect(r.anonimizados).toContain(ids.a91);
    expect(r.anonimizados).toContain(ids.demo);
    expect(r.anonimizados).not.toContain(ids.b89);
    expect(r.anonimizados).not.toContain(ids.activo);
    expect(r.sinFechaCierre).toContain(ids.sinFecha);

    const a = await datos(ids.a91);
    expect(a).toMatchObject({
      nombre: NOMBRE_CLIENTE_ANONIMO,
      telefono: null,
      dni: null,
      movimientos: 1,
      motivos: 0,
      ventas: 1,
      comprobantes: 1,
      receptores: 1,
      identidades: 0,
      usos: 1,
      usos_con_numero: 0,
      turnos: 0,
      prefs: 0,
      emails: 0,
      eventos: 1,
    });
    expect(await datos(ids.demo)).toMatchObject({ nombre: NOMBRE_CLIENTE_ANONIMO, identidades: 0, eventos: 1 });
    expect(r.conteos[ids.a91]).toMatchObject({ clientesAnonimizados: 1, identidadesWhatsappBorradas: 2, sesionesWhatsappBorradas: 1 });
  });

  it("no toca el cerrado a los 89 días, el activo ni el que no tiene fecha de cierre", async () => {
    for (const id of [ids.b89, ids.activo, ids.sinFecha]) {
      expect(await datos(id)).toMatchObject({
        nombre: "Juana Pérez",
        telefono: "3515550000",
        dni: "30111222",
        motivos: 1,
        identidades: id === ids.activo ? 2 : 1,
        usos_con_numero: 1,
        turnos: 1,
        prefs: 1,
        emails: 1,
        eventos: 0,
      });
    }
  });

  it("borra sesión y código de WhatsApp solo del número que no sigue vinculado a otro comercio", async () => {
    expect(await sesiones(numSolo)).toBe(0);
    expect(await codigos(numSolo)).toBe(0);
    expect(await sesiones(numCompartido)).toBe(1);
    expect(await codigos(numCompartido)).toBe(1);
    expect(await sesiones(numActivo)).toBe(1);
  });

  it("re-correr no cambia nada ni deja otro evento", async () => {
    const antes = await datos(ids.a91);
    const r = await ejecutarRetencionClientes(AHORA);
    expect(r.anonimizados).toContain(ids.a91);
    expect(Object.values(r.conteos[ids.a91] ?? {}).every((n) => n === 0)).toBe(true);
    expect(await datos(ids.a91)).toEqual(antes);
  });

  it("el cerrado a los 89 días entra cuando pasan los 90", async () => {
    const r = await ejecutarRetencionClientes(new Date(AHORA.getTime() + 2 * 86_400_000));
    expect(r.anonimizados).toContain(ids.b89);
    expect(await datos(ids.b89)).toMatchObject({ nombre: NOMBRE_CLIENTE_ANONIMO, comprobantes: 1, ventas: 1 });
  });

  it("purgar una demo deja el evento de vida 'baja' que fecha el cierre", async () => {
    const id = await tenant("Demo a purgar", "activo", { esDemo: true, trialHasta: haceDias(1) });
    resetStore();
    control.tenants.set(id, {
      id,
      nombreComercio: "Demo a purgar",
      slug: `ret-${id.slice(0, 8)}`,
      estado: "activo",
      plan: "demo",
      moneda: "ARS",
      ownerGoogleSub: "sub-demo",
      esDemo: true,
      trialHasta: haceDias(1),
    });
    expect(ejecutarPurgaDemos(AHORA).purgados).toEqual([id]);
    let filas: { a_estado: string }[] = [];
    for (let i = 0; i < 50 && filas.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
      filas = await sql<{ a_estado: string }[]>`select a_estado from tenant_lifecycle_events where tenant_id = ${id}`;
    }
    expect(filas.map((f) => f.a_estado)).toEqual(["baja"]);
    resetStore();
  });
});
