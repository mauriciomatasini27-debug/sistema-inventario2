import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { asegurarBasePrivada } from "./helpers/pg-privada.js";
import {
  ACTOR_ANONIMO,
  type DepsRetencion,
  EMAIL_USUARIO_ANONIMO,
  ejecutarRetencionClientes as ejecutarConDeps,
  NOMBRE_CLIENTE_ANONIMO,
  NOMBRE_PROVEEDOR_ANONIMO,
  NUMERO_ANONIMO,
} from "../src/jobs/retencion-clientes.js";
import { ejecutarPurgaDemos } from "../src/jobs/purga-demos.js";
import { control, resetStore } from "../src/lib/store.js";
import { conTenant } from "../src/lib/tenant.js";
import { altaPayee } from "../src/lib/repos/ordenes-pago.js";
import { altaCuenta } from "../src/lib/repos/servicios.js";

const URL_A = process.env.PG_TEST_URL_A;
const hayPG = Boolean(URL_A);
const AHORA = new Date();
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

// P10-90: retención de 90 días contra Postgres real (base privada del archivo).
describe.skipIf(!hayPG)("P10-90 retención de datos de clientes", () => {
  let sql: ReturnType<typeof postgres>;
  const ids = { a91: "", b89: "", activo: "", demo: "", sinFecha: "", reabierto: "" };
  const numSolo = `+549351${Math.floor(Math.random() * 1e7)}`;
  const numCompartido = `+549352${Math.floor(Math.random() * 1e7)}`;
  const numActivo = `+549353${Math.floor(Math.random() * 1e7)}`;
  const subSolo = `sub-solo-${randomUUID().slice(0, 8)}`;
  const subCompartido = `sub-comp-${randomUUID().slice(0, 8)}`;
  const subOtroCerrado = `sub-otro-${randomUUID().slice(0, 8)}`;
  const subActivo = `sub-act-${randomUUID().slice(0, 8)}`;
  // P10-90: Google se simula; revoca solo si el comercio tiene conexión.
  const revocados: string[] = [];
  const depsTest: DepsRetencion = {
    async revocarGoogle(id) {
      const hay = (await sql`select 1 from google_connections where tenant_id = ${id}`).length > 0;
      if (hay) revocados.push(id);
      return hay;
    },
  };
  const cuentaVieja = randomUUID();
  const ejecutarRetencionClientes = (ahora: Date, deps: DepsRetencion = depsTest) => ejecutarConDeps(ahora, deps);

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
      insert into email_outbox (tenant_id, destinatario, asunto, html_ciphertext, texto_ciphertext, idempotency_key)
      values (${tenantId}, 'duena@ejemplo.com', 'Cierre', '<p>x</p>', 'x', ${randomUUID()})
      returning id
    `;
    if (!o) throw new Error("no se creó el email");
    await sql`insert into delivery_status (tenant_id, outbox_id, evento) values (${tenantId}, ${o.id}, 'entregado')`;
    // P10-90: OCR, facturas de proveedor por WhatsApp, proveedores y Gmail.
    await sql`
      insert into ocr_jobs (tenant_id, id, idempotency_key, origen, bytes_ref, emisor, creado_en, actualizado_en)
      values (${tenantId}, ${randomUUID()}, ${randomUUID()}, 'wa', 'wa-media:123', ${numero}, now(), now())
    `;
    await sql`insert into ocr_eventos (tenant_id, tipo, payload) values (${tenantId}, 'leido', ${sql.json({ texto: "Factura Distribuidora Juan" })})`;
    const [d] = await sql<{ id: string }[]>`
      insert into supplier_drafts (tenant_id, idempotency_key, origen, bytes_ref, cuit, nombre_proveedor, confianza, vence_at)
      values (${tenantId}, ${randomUUID()}, 'wa', 'wa-media:123', '20111222333', 'Juan Gómez', ${sql.json({})}, now() + interval '7 days')
      returning id
    `;
    if (!d) throw new Error("no se creó el borrador");
    await sql`
      insert into supplier_match_log (tenant_id, draft_id, order_id, coincide)
      values (${tenantId}, ${d.id}, ${randomUUID()}, true)
    `;
    await sql`
      insert into supplier_invoices (tenant_id, idempotency_key, draft_id, supplier_cuit, nombre_proveedor, fecha_iso, total_centavos, creado_por)
      values (${tenantId}, ${randomUUID()}, ${d.id}, '20111222333', 'Juan Gómez', '2026-08-01', 5000, 'sub-ret')
    `;
    // P10-90: pagos y órdenes a proveedores también se conservan (registro fiscal).
    await sql`
      insert into supplier_payments (tenant_id, idempotency_key, supplier_cuit, monto_centavos, metodo, creado_por)
      values (${tenantId}, ${randomUUID()}, '20111222333', 5000, 'efectivo', 'sub-ret')
    `;
    await sql`
      insert into purchase_orders (tenant_id, idempotency_key, supplier_cuit, total_centavos, creado_por)
      values (${tenantId}, ${randomUUID()}, '20111222333', 5000, 'sub-ret')
    `;
    await sql`
      insert into suppliers (tenant_id, cuit, nombre, email, telefono)
      values (${tenantId}, '20111222333', 'Juan Gómez', 'juan@ejemplo.com', '3515551111')
    `;
    await sql`
      insert into proveedor_contactos (tenant_id, numero_e164, supplier_cuit, estado, creado_en)
      values (${tenantId}, ${`${numero}9`}, '20111222333', 'verificado', now())
    `;
    await sql`insert into proveedor_cupo (tenant_id, numero_e164) values (${tenantId}, ${`${numero}9`})`;
    await sql`
      insert into proveedor_invitaciones (codigo_hash, tenant_id, supplier_cuit, expira_en_ms)
      values (${randomUUID()}, ${tenantId}, '20111222333', 1)
    `;
    const [g] = await sql<{ id: string }[]>`
      insert into google_connections (tenant_id, tipo, cuenta_email, refresh_token_cifrado, consentimiento_version, consentimiento_at)
      values (${tenantId}, 'gmail', 'duena@ejemplo.com', 'cifrado', 'v1', now())
      returning id
    `;
    if (!g) throw new Error("no se creó la conexión");
    await sql`insert into gmail_watch_routes (email_hmac, tenant_id, connection_id) values (${randomUUID()}, ${tenantId}, ${g.id})`;
    await sql`insert into gmail_ingestion_jobs (tenant_id, connection_id, history_id) values (${tenantId}, ${g.id}, '1')`;
    await sql`
      insert into email_ingestion_drafts (tenant_id, connection_id, message_id, origen, vence_en)
      values (${tenantId}, ${g.id}, ${randomUUID()}, 'pdf_digital', now() + interval '7 days')
    `;
    // P10-90 (0053): servicios y pagos del comercio.
    const [sa] = await sql<{ id: string }[]>`
      insert into service_accounts (tenant_id, servicio, proveedor, titular, email_origen)
      values (${tenantId}, 'luz', 'EPEC', 'Juana Pérez', 'juana@ejemplo.com') returning id
    `;
    await sql`
      insert into utility_bills (tenant_id, account_id, message_id, periodo, vencimiento, monto_centavos, origen)
      values (${tenantId}, ${sa!.id}, ${`msg-${randomUUID()}`}, '2026-10', '2026-11-10', 1500, 'pdf_digital')
    `;
    const [pe] = await sql<{ id: string }[]>`insert into payees (tenant_id, nombre, cbu) values (${tenantId}, 'Juan Gómez', '0000003100000000000001') returning id`;
    const [po] = await sql<{ id: string }[]>`
      insert into payment_orders (tenant_id, idempotency_key, numero, payee_id, concepto, monto_centavos, vence_el, metodo_sugerido, instruccion_tipo, instruccion_snapshot, creado_por)
      values (${tenantId}, ${randomUUID()}, ${`OP-${randomUUID().slice(0, 8)}`}, ${pe!.id}, 'Luz', 1500, now(), 'Transferencia', 'datos', ${sql.json({})}, 'sub-ret') returning id
    `;
    await sql`insert into payment_order_events (payment_order_id, a_estado, version, actor, origen) values (${po!.id}, 'preparada', 1, 'sub-ret', 'web')`;
    // P10-90: auditoría append-only (0052) y feedback a la plataforma.
    await sql`insert into auth_events (tenant_id, tipo, actor, detalle) values (${tenantId}, 'login', 'sub-ret', ${sql.json({ email: "duena@ejemplo.com" })})`;
    await sql`insert into gmail_connection_events (tenant_id, connection_id, evento, actor) values (${tenantId}, ${g.id}, 'conectada', 'sub-ret')`;
    await sql`
      insert into admin_audit_log (actor_google_sub, acto_kind, tenant_id, detalle, hash, origen)
      values ('sub-admin', 'suspender', ${tenantId}, ${sql.json({ kind: "suspender", motivo: "pidió la dueña Juana" })}, ${randomUUID()}, 'panel')
    `;
    await sql`
      insert into platform_feedback_reports (id, tenant_id, nombre_comercio, autor_google_sub, idempotency_key, tipo, texto, contexto)
      values (${randomUUID()}, ${tenantId}, 'Comercio', 'sub-ret', ${randomUUID()}, 'problema', 'no me anda la caja, soy Juana', ${sql.json({})})
    `;
  }

  async function usuario(sub: string) {
    await sql`insert into users (google_sub, email, nombre, foto_url) values (${sub}, ${`${sub}@ejemplo.com`}, 'Persona', 'https://foto')`;
  }

  async function miembro(tenantId: string, sub: string, estado = "activo") {
    await sql`insert into memberships (tenant_id, google_sub, rol, estado) values (${tenantId}, ${sub}, 'empleado', ${estado})`;
    await sql`insert into sessions (id_hash, google_sub, tenant_id, expira_at) values (${randomUUID()}, ${sub}, ${tenantId}, now() + interval '1 day')`;
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
        (select count(*)::int from auth_events where tenant_id = ${tenantId} and tipo = 'retencion_clientes_aplicada') as eventos,
        (select count(*)::int from ocr_jobs where tenant_id = ${tenantId})
          + (select count(*)::int from ocr_eventos where tenant_id = ${tenantId}) as ocr,
        (select count(*)::int from supplier_drafts where tenant_id = ${tenantId})
          + (select count(*)::int from supplier_match_log where tenant_id = ${tenantId}) as borradores_prov,
        (select count(*)::int from supplier_invoices where tenant_id = ${tenantId}) as facturas_prov,
        (select count(*)::int from supplier_payments where tenant_id = ${tenantId}) as pagos_prov,
        (select count(*)::int from purchase_orders where tenant_id = ${tenantId}) as ordenes_prov,
        (select nombre from suppliers where tenant_id = ${tenantId} limit 1) as proveedor,
        (select email from suppliers where tenant_id = ${tenantId} limit 1) as proveedor_email,
        (select cuit from suppliers where tenant_id = ${tenantId} limit 1) as proveedor_cuit,
        (select count(*)::int from proveedor_contactos where tenant_id = ${tenantId})
          + (select count(*)::int from proveedor_cupo where tenant_id = ${tenantId})
          + (select count(*)::int from proveedor_invitaciones where tenant_id = ${tenantId}) as contactos_prov,
        (select count(*)::int from google_connections where tenant_id = ${tenantId})
          + (select count(*)::int from gmail_watch_routes where tenant_id = ${tenantId})
          + (select count(*)::int from gmail_ingestion_jobs where tenant_id = ${tenantId})
          + (select count(*)::int from email_ingestion_drafts where tenant_id = ${tenantId}) as gmail,
        (select count(*)::int from memberships where tenant_id = ${tenantId}) as membresias,
        (select count(*)::int from sessions where tenant_id = ${tenantId}) as sesiones,
        (select count(*)::int from invitations where tenant_id = ${tenantId}) as invitaciones,
        (select owner_google_sub from tenants where id = ${tenantId}) as dueno,
        (select count(*)::int from auth_events where tenant_id = ${tenantId} and tipo <> 'retencion_clientes_aplicada'
          and (actor is distinct from ${ACTOR_ANONIMO} or detalle is not null)) as auditoria_auth,
        (select count(*)::int from gmail_connection_events where tenant_id = ${tenantId} and actor is distinct from ${ACTOR_ANONIMO}) as auditoria_gmail,
        (select count(*)::int from admin_audit_log where tenant_id = ${tenantId}
          and (actor_google_sub <> ${ACTOR_ANONIMO} or detalle ->> 'anonimizado' is distinct from 'true')) as auditoria_admin,
        (select count(*)::int from admin_audit_log where tenant_id = ${tenantId}) as auditoria_admin_filas,
        (select count(*)::int from platform_feedback_reports where tenant_id = ${tenantId}::text) as feedback,
        (select count(*)::int from service_accounts where tenant_id = ${tenantId})
          + (select count(*)::int from utility_bills where tenant_id = ${tenantId}) as servicios,
        (select count(*)::int from payees where tenant_id = ${tenantId})
          + (select count(*)::int from payment_orders where tenant_id = ${tenantId})
          + (select count(*)::int from payment_order_events e join payment_orders o on o.id = e.payment_order_id where o.tenant_id = ${tenantId}) as pagos
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
    // P10-90: cerrado hace 200 días, reabierto y vuelto a cerrar hace 10: cuenta el último cierre.
    ids.reabierto = await tenant("Reabierto", "baja");
    await baja(ids.reabierto, haceDias(200));
    await sql`
      insert into tenant_lifecycle_events (tenant_id, de_estado, a_estado, motivo, actor, idempotency_key, creado_en)
      values (${ids.reabierto}, 'baja', 'activo', 'test', 'test', ${`ret-${randomUUID()}`}, ${haceDias(100)})
    `;
    await baja(ids.reabierto, haceDias(10));

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
    // P10-90: subSolo solo en el cerrado (se borra); subCompartido también en
    // el activo (queda); subOtroCerrado también en el de 89 días (se anonimiza
    // porque su otra membresía es de un comercio en baja y la fila lo referencia).
    for (const sub of [subSolo, subCompartido, subOtroCerrado, subActivo]) await usuario(sub);
    // P10-90 (0053): una cuenta vieja sin tenant_id no se puede atribuir y queda.
    await sql`insert into service_accounts (id, servicio, proveedor, titular) values (${cuentaVieja}, 'luz', 'EPEC', 'Sin comercio')`;
    await sql`update tenants set owner_google_sub = ${subSolo} where id = ${ids.a91}`;
    // P10-90: login sin comercio de una persona que se retira y de una que sigue.
    await sql`insert into auth_events (tenant_id, tipo, actor, detalle) values (null, 'login', ${subSolo}, ${sql.json({ ip: "1.2.3.4" })})`;
    await sql`insert into auth_events (tenant_id, tipo, actor, detalle) values (null, 'login', ${subCompartido}, ${sql.json({ ip: "1.2.3.4" })})`;
    await miembro(ids.a91, subSolo);
    await miembro(ids.a91, subCompartido);
    await miembro(ids.activo, subCompartido);
    await miembro(ids.a91, subOtroCerrado);
    await miembro(ids.b89, subOtroCerrado);
    await miembro(ids.activo, subActivo);
    for (const id of [ids.a91, ids.b89, ids.activo]) {
      await sql`
        insert into invitations (token_hash, tenant_id, email, expira_at)
        values (${randomUUID()}, ${id}, 'empleada@ejemplo.com', now() + interval '1 day')
      `;
    }
  });

  const usuarioDe = async (sub: string) =>
    (await sql<{ email: string; nombre: string | null; foto_url: string | null }[]>`
      select email, nombre, foto_url from users where google_sub = ${sub}
    `)[0] ?? null;
  const membresiasDe = async (sub: string) =>
    (await sql<{ tenant_id: string }[]>`select tenant_id from memberships where google_sub = ${sub} order by tenant_id`).map((f) => f.tenant_id);
  const sesionesDe = async (sub: string) => (await sql`select 1 from sessions where google_sub = ${sub}`).length;

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
    expect(r.anonimizados).not.toContain(ids.reabierto);
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
      ocr: 0,
      borradores_prov: 0,
      facturas_prov: 1,
      pagos_prov: 1,
      ordenes_prov: 1,
      proveedor: NOMBRE_PROVEEDOR_ANONIMO,
      proveedor_email: null,
      proveedor_cuit: "20111222333",
      contactos_prov: 0,
      gmail: 0,
      membresias: 0,
      sesiones: 0,
      invitaciones: 0,
      dueno: null,
      auditoria_auth: 0,
      auditoria_gmail: 0,
      auditoria_admin: 0,
      auditoria_admin_filas: 1,
      feedback: 0,
      servicios: 0,
      pagos: 3,
    });
    expect(revocados).toContain(ids.a91);
    expect(r.revocacionGooglePendiente).toEqual([]);
    expect(await datos(ids.demo)).toMatchObject({ nombre: NOMBRE_CLIENTE_ANONIMO, identidades: 0, eventos: 1 });
    expect(r.conteos[ids.a91]).toMatchObject({ clientesAnonimizados: 1, identidadesWhatsappBorradas: 2, sesionesWhatsappBorradas: 1 });
  });

  it("conserva órdenes de pago, su línea de tiempo y beneficiarios del comercio cerrado (registro fiscal)", async () => {
    const [f] = await sql<{ ordenes: number; eventos: number; payees: number; payee: string; concepto: string }[]>`
      select
        (select count(*)::int from payment_orders where tenant_id = ${ids.a91}) as ordenes,
        (select count(*)::int from payment_order_events e join payment_orders o on o.id = e.payment_order_id where o.tenant_id = ${ids.a91}) as eventos,
        (select count(*)::int from payees where tenant_id = ${ids.a91}) as payees,
        (select nombre from payees where tenant_id = ${ids.a91} limit 1) as payee,
        (select concepto from payment_orders where tenant_id = ${ids.a91} limit 1) as concepto
    `;
    expect(f).toEqual({ ordenes: 1, eventos: 1, payees: 1, payee: "Juan Gómez", concepto: "Luz" });
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
        ocr: 2,
        borradores_prov: 2,
        facturas_prov: 1,
        proveedor: "Juan Gómez",
        proveedor_email: "juan@ejemplo.com",
        contactos_prov: 3,
        gmail: 4,
        invitaciones: id === ids.sinFecha ? 0 : 1,
        auditoria_auth: 1,
        auditoria_gmail: 1,
        auditoria_admin: 1,
        feedback: 1,
        servicios: 2,
        pagos: 3,
      });
      expect(revocados).not.toContain(id);
    }
    expect((await datos(ids.b89)).membresias).toBe(1);
    expect((await datos(ids.activo)).membresias).toBe(2);
  });

  it("borra al usuario que solo era del cerrado, conserva al compartido y anonimiza al que sigue referenciado", async () => {
    expect(await usuarioDe(subSolo)).toBeNull();
    expect(await sesionesDe(subSolo)).toBe(0);

    expect(await usuarioDe(subCompartido)).toMatchObject({ email: `${subCompartido}@ejemplo.com`, nombre: "Persona" });
    expect(await membresiasDe(subCompartido)).toEqual([ids.activo]);
    expect(await sesionesDe(subCompartido)).toBe(1);

    expect(await usuarioDe(subOtroCerrado)).toEqual({ email: EMAIL_USUARIO_ANONIMO, nombre: null, foto_url: null });
    expect(await membresiasDe(subOtroCerrado)).toEqual([ids.b89]);
    expect(await sesionesDe(subOtroCerrado)).toBe(0);

    expect(await usuarioDe(subActivo)).toMatchObject({ nombre: "Persona" });
    // P10-90: el login sin comercio de quien se retiró queda anonimizado; el de quien sigue, no.
    expect((await sql`select 1 from auth_events where actor = ${subSolo}`).length).toBe(0);
    expect((await sql`select 1 from auth_events where actor = ${subCompartido}`).length).toBe(1);
  });

  it("la cuenta de servicio vieja sin comercio queda; las altas nuevas llevan tenant_id", async () => {
    expect((await sql`select 1 from service_accounts where id = ${cuentaVieja}`).length).toBe(1);
    const payeeId = randomUUID();
    const p = await conTenant(ids.activo, () =>
      altaPayee({ id: payeeId, nombre: `Gas Cuyana ${payeeId.slice(0, 6)}`, tipo: "servicio", medioPreferido: "Transferencia", alias: `gas.cuyana.${payeeId.slice(0, 6)}` }),
    );
    expect(p, JSON.stringify(p)).toMatchObject({ ok: true, fuente: "db" });
    const c = await conTenant(ids.activo, () =>
      altaCuenta({ servicio: "gas", proveedor: `Ecogas ${randomUUID().slice(0, 6)}`, titular: "Juana", debitoAutomatico: false }),
    );
    expect(c).toMatchObject({ ok: true, fuente: "db" });
    if (!c.ok) throw new Error("sin cuenta");
    const [fp] = await sql<{ t: string }[]>`select tenant_id::text as t from payees where id = ${payeeId}`;
    const [fc] = await sql<{ t: string }[]>`select tenant_id::text as t from service_accounts where id = ${c.accountId}`;
    expect(fp?.t).toBe(ids.activo);
    expect(fc?.t).toBe(ids.activo);
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
    expect(await datos(ids.b89)).toMatchObject({ nombre: NOMBRE_CLIENTE_ANONIMO, comprobantes: 1, ventas: 1, membresias: 0, facturas_prov: 1, pagos_prov: 1, ordenes_prov: 1 });
    expect(await usuarioDe(subOtroCerrado)).toBeNull();
    expect(await usuarioDe(subCompartido)).toMatchObject({ nombre: "Persona" });
  });

  // P10-90 / migración 0052: el trigger deja anonimizar solo actor/detalle y
  // solo con modoops.retencion = 'on' en la transacción.
  it("auditoría: sin la marca no se puede modificar, DELETE sigue bloqueado y con la marca solo cambian actor y detalle", async () => {
    const id = ids.activo;
    await expect(sql`update auth_events set actor = 'x' where tenant_id = ${id}`).rejects.toThrow(/append-only/);
    await expect(sql`update gmail_connection_events set actor = 'x' where tenant_id = ${id}`).rejects.toThrow(/append-only/);
    await expect(sql`update admin_audit_log set actor_google_sub = 'x' where tenant_id = ${id}`).rejects.toThrow(/append-only/);
    const conMarca = (q: (tx: postgres.TransactionSql) => Promise<unknown>) =>
      sql.begin(async (tx) => {
        await tx`select set_config('modoops.retencion', 'on', true)`;
        await q(tx);
      });
    await expect(conMarca((tx) => tx`delete from auth_events where tenant_id = ${id}`)).rejects.toThrow(/append-only/);
    await expect(conMarca((tx) => tx`delete from gmail_connection_events where tenant_id = ${id}`)).rejects.toThrow(/append-only/);
    await expect(conMarca((tx) => tx`delete from admin_audit_log where tenant_id = ${id}`)).rejects.toThrow(/append-only/);
    await expect(conMarca((tx) => tx`update auth_events set tipo = 'otro' where tenant_id = ${id}`)).rejects.toThrow(/append-only/);
    await expect(conMarca((tx) => tx`update auth_events set actor = 'x', tenant_id = null where tenant_id = ${id}`)).rejects.toThrow(
      /append-only/,
    );
    await expect(conMarca((tx) => tx`update gmail_connection_events set motivo = 'x' where tenant_id = ${id}`)).rejects.toThrow(/append-only/);
    await expect(conMarca((tx) => tx`update admin_audit_log set hash = ${randomUUID()} where tenant_id = ${id}`)).rejects.toThrow(
      /append-only/,
    );
    // P10-90: la marca es local a la transacción: no queda prendida para la conexión.
    await conMarca(async () => undefined);
    await expect(sql`update auth_events set actor = 'x' where tenant_id = ${id}`).rejects.toThrow(/append-only/);
    expect(await datos(id)).toMatchObject({ auditoria_auth: 1, auditoria_gmail: 1, auditoria_admin: 1 });
  });

  it("avisa por mail al dueño una sola vez en la última semana antes del borrado", async () => {
    const subAviso = `sub-aviso-${randomUUID().slice(0, 8)}`;
    await usuario(subAviso);
    const id = await tenant("Kiosco Aviso", "baja");
    const lejos = await tenant("Kiosco Lejos", "baja");
    await sql`update tenants set owner_google_sub = ${subAviso} where id in (${id}, ${lejos})`;
    await baja(id, haceDias(85));
    await baja(lejos, haceDias(80));
    const r = await ejecutarRetencionClientes(AHORA);
    expect(r.avisados).toContain(id);
    expect(r.avisados).not.toContain(lejos);
    expect(r.anonimizados).not.toContain(id);
    const mails = await sql<{ destinatario: string; asunto: string; plantilla: string }[]>`
      select destinatario, asunto, plantilla from email_outbox where tenant_id = ${id}
    `;
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ destinatario: `${subAviso}@ejemplo.com`, plantilla: "retencion_aviso_v1" });
    expect(mails[0]?.asunto).toContain("Kiosco Aviso");
    const otra = await ejecutarRetencionClientes(AHORA);
    expect(otra.avisados).not.toContain(id);
    expect((await sql`select 1 from email_outbox where tenant_id = ${id}`).length).toBe(1);
    expect((await sql`select 1 from email_outbox where tenant_id = ${lejos}`).length).toBe(0);
  });

  it("si Google no responde, conserva la conexión para reintentar y borra el resto", async () => {
    const id = await tenant("Google caído", "baja");
    await baja(id, haceDias(95));
    await sembrar(id, `+549357${Math.floor(Math.random() * 1e7)}`);
    const caido: DepsRetencion = {
      async revocarGoogle() {
        throw new Error("google caído");
      },
    };
    const r = await ejecutarRetencionClientes(AHORA, caido);
    expect(r.revocacionGooglePendiente).toContain(id);
    expect((await sql`select 1 from google_connections where tenant_id = ${id}`).length).toBe(1);
    expect(await datos(id)).toMatchObject({ nombre: NOMBRE_CLIENTE_ANONIMO, identidades: 0, feedback: 0, auditoria_auth: 0 });
    const otra = await ejecutarRetencionClientes(AHORA);
    expect(otra.revocacionGooglePendiente).not.toContain(id);
    expect(revocados).toContain(id);
    expect((await sql`select 1 from google_connections where tenant_id = ${id}`).length).toBe(0);
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
