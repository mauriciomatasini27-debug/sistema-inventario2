import type { APIRoute } from "astro";
import { z } from "zod";
import { control, store } from "../../../lib/store.js";
import { membershipActiva } from "../../../lib/control.js";
import { persistirAuthEvent, persistirBotLink } from "../../../lib/control-db.js";
import { DeduplicadorWamid, verificar_firma_meta } from "../../../modules/whatsapp/webhook.js";
import { debeInvalidarPorIntentos, parsear_vincular, verificar_vincular } from "../../../modules/whatsapp/vincular.js";
import {
  enmascararNumero,
  esPeticionSensibleBot,
  numeroOcupadoPorOtro,
  preguntaPorCosto,
  puedeUsarBot,
  RESPUESTA_SENSIBLE_BOT,
  RESPUESTA_SIN_PERMISO_COSTO,
} from "../../../modules/auth/bot.js";
import { sha256Hex } from "../../../modules/auth/sesiones.js";
import { parsear_comando_aviso, RESPUESTA_BAJA } from "../../../modules/whatsapp/optin.js";
import { detectar_intencion } from "../../../modules/whatsapp/consulta.js";
import { RESPUESTA_NO_VINCULADO, resolver_comercio } from "../../../modules/whatsapp/resolucion.js";
import { atender_consulta, emitir_contexto, type ItemVivo } from "../../../modules/whatsapp/servicio.js";
import { construir_texto } from "../../../modules/whatsapp/envio.js";
import { notificarAlertaSeguridad } from "../../../lib/alertas-seguridad.js";
import { enviar_whatsapp, marcar_leido } from "../../../modules/whatsapp/cliente-cloud.js";
import { enrutar } from "../../../modules/whatsapp/router.js";
import { catalogo_vivo } from "../../../modules/whatsapp/catalogo.js";
import { crear_item_viernes, type ListaViernes } from "../../../modules/whatsapp/lista-viernes.js";
import type { MovimientoVista, PedidoDia } from "../../../modules/whatsapp/dia-a-dia.js";

export const prerender = false;

// GET /api/whatsapp/webhook — verificación de suscripción Meta (hub.verify_token).
const verifySchema = z.object({
  "hub.mode": z.string(),
  "hub.verify_token": z.string(),
  "hub.challenge": z.string(),
});

// Rutas webhook WhatsApp (GET verify + POST entrantes). Detalle del POST
// en su bloque.
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const parsed = verifySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return new Response("forbidden", { status: 403 });
  const q = parsed.data;
  if (q["hub.mode"] !== "subscribe") return new Response("forbidden", { status: 403 });
  if (q["hub.verify_token"] !== process.env.WHATSAPP_VERIFY_TOKEN) return new Response("forbidden", { status: 403 });
  return new Response(q["hub.challenge"], { status: 200, headers: { "content-type": "text/plain" } });
};

// POST /api/whatsapp/webhook — mensajes entrantes Cloud API.
// Slice envío: VINCULAR + BAJA/ALTA + consulta en vivo con resolución
// número→tenant (B1.4) y roles (B1.7), respondiendo por Cloud API.
// Sin identidad no hay datos. Siempre 200 (un 5xx haría reintentar a Meta).
const dedup = new DeduplicadorWamid();

// B2.3: reactivación por chat (el opt-out vive en preferencias; la ruta web
// lo persiste, acá solo se responde).
const RESPUESTA_ALTA = "Listo, volviste a activar los avisos por WhatsApp." as const;

interface CredencialesEnvio {
  readonly phoneNumberId: string;
  readonly token: string;
}

function credenciales_envio(env: NodeJS.ProcessEnv = process.env): CredencialesEnvio | null {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? "";
  const token = env.WHATSAPP_TOKEN ?? "";
  if (!phoneNumberId || !token) return null;
  return { phoneNumberId, token };
}

// Envía el texto por Cloud API + marca leído. Sin credenciales omite el
// envío (enviado:false) pero igual responde 200 con la respuesta calculada.
async function responder(opts: {
  toE164: string;
  wamidEntrante: string;
  texto: string;
  cred: CredencialesEnvio | null;
}): Promise<boolean> {
  if (!opts.cred) return false;
  const base = { phoneNumberId: opts.cred.phoneNumberId, token: opts.cred.token };
  await marcar_leido({ ...base, wamidEntrante: opts.wamidEntrante });
  const r = await enviar_whatsapp({ ...base, toE164: opts.toE164, payload: construir_texto(opts.texto) });
  return r.ok;
}

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();
  const firma = request.headers.get("X-Hub-Signature-256");
  const secret = process.env.WHATSAPP_APP_SECRET ?? "";
  // Sin secret configurado se rechaza (nunca procesar sin verificar firma).
  if (!secret || !verificar_firma_meta({ appSecret: secret, rawBody: raw, signatureHeader: firma })) {
    return Response.json({ error: "firma invalida" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "json invalido" }, { status: 422 });
  }
  const msg = extraer_mensaje(body);
  if (msg == null) return Response.json({ ok: true, ignorado: true });
  const ahoraMs = Date.now();
  // Meta reintenta webhooks: wamid UNIQUE (prod: whatsapp_usage).
  if (
    dedup.es_duplicado(
      { wamid: msg.wamid, remitenteE164: msg.remitente, texto: msg.texto, timestampMs: msg.timestampMs },
      ahoraMs,
    )
  ) {
    return Response.json({ ok: true, duplicado: true });
  }
  // B1: VINCULAR <codigo> gratis al número central. Verifica remitente +
  // vencimiento + un solo uso (verificar_vincular) y deja bot_link verificado.
  // Sin vínculo válido no se revela a qué comercio correspondía el código.
  // AU11.2: 5 intentos fallidos invalidan el código. AU11.5: un número opera
  // como un solo usuario. AU11.3: el flag del Empleado se chequea al vincular.
  const codigoVincular = parsear_vincular(msg.texto);
  if (codigoVincular !== null) {
    const pendiente = control.vincularCodes.get(msg.remitente) ?? null;
    const existente = control.botLinks.get(msg.remitente);
    if (pendiente && existente?.estado === "verificado" && existente.googleSub !== pendiente.googleSub) {
      return Response.json({ ok: true, accion: "vincular_error", motivo: "conflicto" });
    }
    const v = verificar_vincular({
      textoEntrante: msg.texto,
      remitenteE164: msg.remitente,
      codigoIngresadoHash: sha256Hex(codigoVincular),
      pendiente: pendiente
        ? {
            codigoHash: pendiente.codigoHash,
            expiraEn: pendiente.expiraEn,
            usado: pendiente.usado,
            numeroRegistrado: pendiente.numeroRegistrado,
          }
        : null,
      ahoraMs,
    });
    if (!v.ok) {
      let motivo: string = v.motivo;
      if (pendiente && v.motivo === "codigo_invalido") {
        pendiente.intentosFallidos += 1;
        if (debeInvalidarPorIntentos(pendiente.intentosFallidos)) {
          pendiente.usado = true;
          motivo = "intentos_agotados";
        }
      }
      control.events.push({
        tenantId: pendiente?.tenantId ?? null,
        tipo: "vinculo_fallido",
        ...(pendiente?.googleSub ? { actor: pendiente.googleSub } : {}),
        detalle: { motivo },
        creadoEn: new Date(ahoraMs).toISOString(),
      });
      if (pendiente?.googleSub) {
        void notificarAlertaSeguridad({
          evento: "vinculo_fallido",
          tenantId: pendiente.tenantId,
          googleSubDestino: pendiente.googleSub,
        });
      }
      return Response.json({ ok: true, accion: "vincular_error", motivo });
    }
    if (!pendiente) return Response.json({ ok: true, accion: "vincular_error", motivo: "codigo_invalido" });
    const memb = membershipActiva(pendiente.tenantId, pendiente.googleSub);
    if (!memb || !puedeUsarBot({ rol: memb.rol, puedeUsarBot: memb.puedeUsarBot })) {
      pendiente.usado = true;
      return Response.json({ ok: true, accion: "vincular_error", motivo: "no_habilitado" });
    }
    pendiente.usado = true;
    control.botLinks.set(msg.remitente, { tenantId: pendiente.tenantId, googleSub: pendiente.googleSub, estado: "verificado" });
    void persistirBotLink({ tenantId: pendiente.tenantId, googleSub: pendiente.googleSub, numero: msg.remitente, estado: "verificado" });
    control.events.push({
      tenantId: pendiente.tenantId,
      tipo: "vinculo_ok",
      actor: pendiente.googleSub,
      detalle: { numero: enmascararNumero(msg.remitente) },
      creadoEn: new Date(ahoraMs).toISOString(),
    });
    void persistirAuthEvent({
      tenantId: pendiente.tenantId,
      tipo: "vinculo_ok",
      actor: pendiente.googleSub,
      detalle: { numero: enmascararNumero(msg.remitente) },
    });
    void notificarAlertaSeguridad({
      evento: "vinculo_ok",
      tenantId: pendiente.tenantId,
      googleSubDestino: pendiente.googleSub,
      detalle: enmascararNumero(msg.remitente),
    });
    return Response.json({ ok: true, accion: "vincular_ok" });
  }
  const cred = credenciales_envio();
  const cmd = parsear_comando_aviso(msg.texto);
  if (cmd.kind === "baja") {
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_BAJA, cred });
    return Response.json({ ok: true, accion: "opt_out", respuesta: RESPUESTA_BAJA, enviado });
  }
  if (cmd.kind === "alta") {
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_ALTA, cred });
    return Response.json({ ok: true, accion: "opt_in", respuesta: RESPUESTA_ALTA, enviado });
  }
  // AU10.4/AU11.7: las acciones sensibles solo se hacen desde la web; por el
  // bot se derivan (se responde tras la puerta de identidad, sin ejecutar).
  // Las preguntas por costo pasan el gate de intención para denegarse con
  // mensaje explícito (AU11, "cuánto me cuesta" es intención "ninguna").
  const sensible = esPeticionSensibleBot(msg.texto);
  const posibleCosto = preguntaPorCosto(msg.texto);
  // B1.4/AU11.4: el tenant sale del número, nunca del contenido del mensaje.
  // Puerta única de identidad para router y consulta: vínculo verificado +
  // membership activa + tenant vigente. Sin esto no hay datos por ningún
  // camino (AU11.6: revocado → siguiente mensaje sin datos).
  const r = resolver_comercio({
    remitenteE164: msg.remitente,
    identidades: [...control.botLinks.entries()].map(([numeroE164, l]) => ({
      numeroE164,
      googleSub: l.googleSub,
      tenantId: l.tenantId,
      estado: (l.estado === "verificado" ? "verificado" : l.estado === "revocado" ? "revocado" : "pendiente") as
        | "pendiente"
        | "verificado"
        | "revocado",
    })),
    memberships: [...control.memberships.values()].map((m) => ({
      tenantId: m.tenantId,
      googleSub: m.googleSub,
      rol: m.rol,
      estado: m.estado,
    })),
    tenants: [...control.tenants.values()].map((t) => ({
      id: t.id,
      estado: (t.estado === "activo"
        ? "activo"
        : t.estado === "suspendido"
          ? "suspendido"
          : t.estado === "baja"
            ? "baja"
            : "pendiente") as "pendiente" | "activo" | "suspendido" | "baja",
    })),
  });
  // B1.5: sin vínculo solo el genérico, sin datos (tampoco el motivo).
  if (!r.ok) {
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_NO_VINCULADO, cred });
    return Response.json({ ok: true, accion: "consulta", respuesta: RESPUESTA_NO_VINCULADO, enviado });
  }
  if (sensible) {
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_SENSIBLE_BOT, cred });
    return Response.json({ ok: true, accion: "derivada_web", respuesta: RESPUESTA_SENSIBLE_BOT, enviado });
  }
  // B6/B10: comandos de lista del viernes y día a día (solo lectura,
  // con stock vivo). Si el router responde, no se sigue a la consulta.
  const tenantPrevio = resolver_tenant_de(msg.remitente);
  const ruta = enrutar({
    texto: msg.texto,
    catalogo: catalogo_demo().map((c) => ({ sku: c.sku, nombre: c.nombre, stock: c.stock, umbral: c.umbral, proveedor: c.proveedor ?? null })),
    comercio: tenantPrevio?.nombreComercio ?? "tu comercio",
    pedidos: pedidos_dia(),
    movs: movs_vista(ahoraMs),
    friday: friday_vivo(tenantPrevio?.id ?? "", catalogo_demo(), ahoraMs),
    sesion: sesion_viva(msg.remitente, ahoraMs),
    ahoraMs,
  });
  if (ruta.accion === "viernes_guardado") {
    guardar_friday(tenantPrevio?.id ?? "", ruta.friday, ahoraMs);
  }
  if (ruta.accion !== "nada") {
    if (ruta.accion === "alertas") guardar_sesion(msg.remitente, "alertas", { pagina: ruta.pagina }, ahoraMs);
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: ruta.texto, cred });
    return Response.json({ ok: true, accion: ruta.accion, respuesta: ruta.texto, enviado });
  }
  const intencion = detectar_intencion(msg.texto);
  if (!sensible && !posibleCosto && intencion !== "stock" && intencion !== "precio" && intencion !== "alertas") {
    return Response.json({ ok: true, accion: "consulta", intencion });
  }
  // AU11.4: rol y permisos de la membership en cada mensaje (nunca copiados
  // en el vínculo). Costos no delegables en el MVP: solo Dueño.
  const membMsg = membershipActiva(r.tenantId, r.googleSub);
  if (r.rol !== "dueno" && preguntaPorCosto(msg.texto)) {
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_SIN_PERMISO_COSTO, cred });
    return Response.json({ ok: true, accion: "consulta", intencion, respuesta: RESPUESTA_SIN_PERMISO_COSTO, enviado });
  }
  const ctx = emitir_contexto(r, ahoraMs);
  const tenant = control.tenants.get(r.tenantId);
  const atencion = atender_consulta({
    ctx,
    texto: msg.texto,
    catalogo: catalogo_demo(),
    comercio: tenant?.nombreComercio ?? "tu comercio",
    permisos: membMsg?.permisos ?? [],
  });
  // B4: la lista de alertas deja sesión para el "ver más" paginado.
  if (intencion === "alertas") guardar_sesion(msg.remitente, "alertas", { pagina: 1 }, ahoraMs);
  const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: atencion.texto, cred });
  return Response.json({ ok: true, accion: "consulta", intencion, respuesta: atencion.texto, enviado });
};

// Catálogo vivo desde el store en memoria (misma forma que Drizzle en prod).
function catalogo_demo(): ItemVivo[] {
  return catalogo_vivo(store.stock, store.prices);
}

// --- B4/B6/B10: adaptadores memoria (prod: Drizzle del tenant) ---

// Sesión corta por número (30 min, sin datos de stock).
const SESION_TTL_MS = 30 * 60 * 1000;

function sesion_viva(numero: string, ahoraMs: number): { paso: string; contexto: Record<string, unknown> } | null {
  const s = store.waSessions.get(numero);
  if (!s || ahoraMs > s.expiraEn) return null;
  return { paso: s.paso, contexto: s.contexto as Record<string, unknown> };
}

function guardar_sesion(numero: string, paso: string, contexto: Record<string, unknown>, ahoraMs: number): void {
  store.waSessions.set(numero, { paso, contexto, updatedAt: ahoraMs, expiraEn: ahoraMs + SESION_TTL_MS });
}

function resolver_tenant_de(remitente: string): { id: string; nombreComercio: string } | null {
  const link = control.botLinks.get(remitente);
  if (!link) return null;
  const t = control.tenants.get(link.tenantId);
  if (!t) return null;
  return { id: link.tenantId, nombreComercio: (t as { nombreComercio?: string }).nombreComercio ?? "tu comercio" };
}

// Lista del viernes viva: los guardados se recalculan con stock del momento;
// el repuesto (vivo > umbral) sale solo (B6.5).
function friday_vivo(tenantId: string, catalogo: ItemVivo[], ahoraMs: number): ListaViernes {
  void ahoraMs;
  const guardados = tenantId ? (store.waFriday.get(tenantId) ?? []) : [];
  const porSku = new Map(catalogo.map((c) => [c.sku, c]));
  const mapa = new Map<string, ReturnType<typeof crear_item_viernes>[]>();
  for (const g of guardados) {
    const vivo = porSku.get(g.sku);
    if (!vivo || vivo.umbral <= 0 || vivo.stock > vivo.umbral) continue;
    const item = crear_item_viernes({ sku: vivo.sku, nombre: vivo.nombre, stock: vivo.stock, umbral: vivo.umbral, proveedor: vivo.proveedor });
    const arr = mapa.get(item.proveedor) ?? [];
    if (arr.some((i) => i.sku === item.sku)) continue;
    mapa.set(item.proveedor, [...arr, item]);
  }
  return mapa;
}

function guardar_friday(tenantId: string, friday: ListaViernes, ahoraMs: number): void {
  if (!tenantId) return;
  const previa = store.waFriday.get(tenantId) ?? [];
  const vistos = new Set(previa.map((g) => g.sku));
  const next = [...previa];
  for (const items of friday.values()) {
    for (const i of items) {
      if (vistos.has(i.sku)) continue;
      vistos.add(i.sku);
      next.push({ sku: i.sku, proveedor: i.proveedor, agregadoEn: ahoraMs });
    }
  }
  store.waFriday.set(tenantId, next);
}

// B10.1: pedidos del store a la vista del día a día.
function pedidos_dia(): PedidoDia[] {
  const out: PedidoDia[] = [];
  for (const o of store.purchaseOrders.values()) {
    const sup = store.suppliers.get(`sup-${o.supplierCuit}`);
    out.push({
      id: o.id,
      proveedor: sup?.nombre ?? o.supplierCuit,
      estado: o.estado === "abierta" ? "borrador" : "enviado",
      creadoEnMs: Date.parse(o.creadoEn),
      totalCentavos: o.totalCentavos,
    });
  }
  return out;
}

// B10.2: movimientos del store a la vista del día a día.
function movs_vista(ahoraMs: number): MovimientoVista[] {
  return store.stockMoves.map((m) => ({
    idemKey: m.idemKey,
    sku: m.sku,
    delta: m.delta,
    tipo: m.tipo,
    fechaMs: ahoraMs,
  }));
}

interface TextoMsg {
  readonly id?: string;
  readonly from?: string;
  readonly timestamp?: string;
  readonly text?: { readonly body?: string };
}
interface ValueMsg {
  readonly messages?: readonly TextoMsg[];
}
interface ChangeMsg {
  readonly value?: ValueMsg;
}
interface EntryMsg {
  readonly changes?: readonly ChangeMsg[];
}
function extraer_mensaje(body: unknown): { wamid: string; remitente: string; texto: string; timestampMs: number } | null {
  try {
    const b = body as { readonly entry?: readonly EntryMsg[] };
    const msg = b.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body || !msg.from || !msg.id) return null;
    return {
      wamid: msg.id,
      remitente: msg.from.startsWith("+") ? msg.from : `+${msg.from}`,
      texto: msg.text.body,
      timestampMs: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
    };
  } catch {
    return null;
  }
}
