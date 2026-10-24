import type { APIRoute } from "astro";
import { z } from "zod";
import { control } from "../../../lib/store.js";
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
import { consulta_con_detalle, detectar_intencion, extraer_termino } from "../../../modules/whatsapp/consulta.js";
import { textoDetalleSiCorresponde } from "../../../lib/repos/consulta-lotes.js";
import { consultarNombre, leerFicha } from "../../../lib/repos/busqueda-nombre.js";
import {
  cuerpo_pedir_edicion_ocr,
  es_comprobante_desde_mime,
  mensaje_error_edicion,
  parsear_boton_ocr,
  parsear_edicion_ocr,
  parche_de_edicion,
  payload_borrador_ocr,
  payload_correccion_ocr,
  payload_propuesta_edicion_ocr,
  propuesta_correccion_total,
  RESPUESTA_NO_COMPROBANTE,
  RESPUESTA_OCR_BOTON_INVALIDO,
  RESPUESTA_OCR_CANCELADO,
  RESPUESTA_OCR_CORREGIDO,
  RESPUESTA_OCR_DESCARTADO,
  RESPUESTA_OCR_EDITAR_WEB,
  RESPUESTA_OCR_MEDIA_FALLIDA,
  RESPUESTA_OCR_NO_ENTENDI,
  RESPUESTA_OCR_SOLO_DUENO,
  type EdicionOcrTexto,
} from "../../../modules/whatsapp/ocr-borrador.js";
import { RESPUESTA_NO_VINCULADO, resolver_comercio } from "../../../modules/whatsapp/resolucion.js";
import { atender_alertas, emitir_contexto, redactarConsulta, redactarFicha, resolver_seleccion } from "../../../modules/whatsapp/servicio.js";
import { crearTransporteCloud, marcarLeidoCloud, normalizarAdjuntoEntrada, normalizarBotonEntrada, normalizarEntrada, type ResultadoEnvioTransporte, type WhatsAppTransport } from "../../../modules/whatsapp/transport.js";
import type { PayloadEnvio } from "../../../modules/whatsapp/envio.js";
import { ingerirOcr } from "../../../lib/ocr-ingesta.js";
import { notificarAlertaSeguridad } from "../../../lib/alertas-seguridad.js";
import { BaseNoDisponible, dbVivaTenant } from "../../../lib/server-db.js";
import { conTenant } from "../../../lib/tenant-mode.js";
import { descartarBorradorOcrRepo, editarBorradorOcrRepo, leerBorradorOcrRepo } from "../../../lib/repos/facturas-proveedor.js";
import { registrarEventoOcr } from "../../../lib/repos/ocr.js";
import { enrutar } from "../../../modules/whatsapp/router.js";
import { preguntar_asistente_bot, reconoce_pregunta_ia } from "../../../modules/whatsapp/asistente.js";
import { CUPO_ASISTENTE_POR_DEFECTO } from "../../../modules/ia/asistente.js";
import { ProveedorLLMFake, crear_proveedor_llm_desde_env } from "../../../modules/ia/proveedor.js";
import { evaluarCupoConsultaBot, planIncluye } from "../../../lib/repos/planes.js";
import { mesAR } from "../../../lib/fecha-ar.js";
import { describir_cuenta } from "../../../modules/email/eventos-seguridad.js";
import { encolar_email_simple } from "../../../jobs/whatsapp-adaptador.js";
import { armar_link_wame } from "../../../modules/whatsapp/envio-proveedor.js";
import { crearRegistroUsoIA } from "../../../lib/repos/ia-uso.js";
import { crearLecturasIA } from "../../../lib/repos/ia-lecturas.js";
import { leerModulosBot } from "../../../lib/repos/bot-modulos.js";
import { MENSAJE_MODULO_APAGADO } from "../../../modules/bot/modulos-rubro.js";
import {
  cantidad_reponer,
  costoCentavosReponer,
  parsear_boton_accion,
  type TipoAccionPropuesta,
} from "../../../modules/bot/acciones-propuestas.js";
import { elegirProveedorUnico } from "../../../modules/purchases/proveedores.js";
import { crearOrdenRepo } from "../../../lib/repos/proveedores.js";
import { listarClientesConSaldo } from "../../../lib/repos/fiado.js";
import { texto_recordatorio } from "../../../jobs/bot-pyme.js";
import { link_whatsapp } from "../../../modules/credit/fiado.js";
import { registrarConsultaBot } from "../../../lib/repos/bot-consultas.js";
import { registrarTurnoBot } from "../../../lib/repos/bot-turnos.js";
import { guardarEleccion, guardarOptIn, prefsDe } from "../../../lib/repos/alerta-prefs.js";
import { registrarEnvioCloud } from "../../../lib/whatsapp-salud.js";
import { editarBorrador, type Borrador, type OrigenIngesta } from "../../../modules/purchases/facturas.js";
import {
  contacto_por_numero,
  evaluar_cupo_proveedor,
  numero_dueno_verificado,
  parsear_invitar,
  RESPUESTA_PROV_CODIGO_INVALIDO,
  RESPUESTA_PROV_CUPO,
  RESPUESTA_PROV_FACTURA,
  RESPUESTA_PROV_FACTURA_RECIBIDA,
  RESPUESTA_PROV_PENDIENTE,
  RESPUESTA_PROV_RECIBIDO,
  type ResultadoVincularCuit,
  verificar_invitacion,
  vincular_cuit_contacto,
} from "../../../modules/whatsapp/proveedor.js";
import { listarProveedores } from "../../../lib/repos/proveedores.js";
import {
  agregarListaViernes,
  guardarSesion,
  leerListaViernes,
  leerSesion,
  listarCatalogoVivo,
  listarMovimientosVista,
  listarPedidosDia,
  type SesionViva,
} from "../../../lib/repos/whatsapp.js";

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

function registrarTurnoConsulta(input: {
  tenantId: string;
  wamid: string;
  remitente: string;
  googleSub: string;
  pregunta: string;
  respuesta: string;
  fuente: "db" | "memoria";
  ahoraMs: number;
}): void {
  void registrarTurnoBot({
    tenantId: input.tenantId,
    wamid: input.wamid,
    numeroE164: input.remitente,
    googleSub: input.googleSub,
    pregunta: input.pregunta,
    respuesta: input.respuesta,
    fuente: input.fuente,
    ahoraMs: input.ahoraMs,
  }).catch((e: unknown) => console.error("[whatsapp] no se pudo registrar el turno", e));
}

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

// Envía por WhatsAppTransport (adaptador cloud) + marca leído. Sin
// credenciales omite el envío (enviado:false) pero igual responde 200.
// `salida` deja elegir el payload: texto o interactivo (botones).
async function enviarSalida(
  opts: { toE164: string; wamidEntrante: string; cred: CredencialesEnvio | null },
  salida: (t: WhatsAppTransport) => Promise<ResultadoEnvioTransporte>,
): Promise<boolean> {
  if (!opts.cred) return false;
  await marcarLeidoCloud({ phoneNumberId: opts.cred.phoneNumberId, token: opts.cred.token, wamidEntrante: opts.wamidEntrante });
  const t = crearTransporteCloud({ phoneNumberId: opts.cred.phoneNumberId, token: opts.cred.token });
  const r = await salida(t);
  registrarEnvioCloud(r.ok, Date.now());
  return r.ok;
}

async function responder(opts: {
  toE164: string;
  wamidEntrante: string;
  texto: string;
  cred: CredencialesEnvio | null;
}): Promise<boolean> {
  return enviarSalida(opts, (t) => t.enviar(opts.toE164, opts.texto));
}

async function responderPayload(
  opts: { toE164: string; wamidEntrante: string; cred: CredencialesEnvio | null },
  payload: PayloadEnvio,
): Promise<boolean> {
  return enviarSalida(opts, (t) => t.enviarPayload(opts.toE164, payload));
}

// PLAN-S11: un mail por umbral y mes; sin email del Dueño no encola ni llama al proveedor.
function encolarEmailCupoCuenta(opts: {
  readonly tenantId: string;
  readonly porcentaje: 80 | 100;
  readonly usado: number;
  readonly cupo: number;
  readonly ahoraMs: number;
}): void {
  const tenant = control.tenants.get(opts.tenantId);
  if (!tenant?.ownerGoogleSub) return;
  const email = control.users.get(tenant.ownerGoogleSub)?.email;
  if (typeof email !== "string" || email === "") return;
  const evento = describir_cuenta({
    kind: "cupo",
    porcentaje: opts.porcentaje,
    usado: opts.usado,
    cupo: opts.cupo,
    tenantId: opts.tenantId,
    mes: mesAR(opts.ahoraMs),
  });
  encolar_email_simple(evento.idempotencyKey, email, evento.asunto, evento.texto);
}

const RESPUESTA_OCR_SIN_BASE = "No pude leer el comprobante ahora. Reintentá en un rato." as const;

// BOT-S8: botón de una acción del resumen mensual.
const RESPUESTA_ACCION_INVALIDA = "Ese botón ya no está disponible." as const;
const RESPUESTA_ACCION_SOLO_DUENO = "Solo el Dueño puede armar pedidos." as const;

const MODULO_DE_ACCION: Record<TipoAccionPropuesta, "rotacion" | "cobranza"> = {
  reponer: "rotacion",
  cobrar: "cobranza",
};

function revisa_borrador(b: Borrador): boolean {
  return b.confianza.cuit !== "alta" || b.confianza.fecha !== "alta" || b.confianza.total !== "alta";
}

// `parseMontoAR` acepta coma decimal; sin el punto de miles el texto sigue
// siendo AR y no depende del formato de `formatear_pesos`.
function monto_texto_ar(centavos: bigint): string {
  return `${centavos / 100n},${(centavos % 100n).toString().padStart(2, "0")}`;
}

function string_de_contexto(contexto: Record<string, unknown>, clave: string): string | null {
  const v = contexto[clave];
  return typeof v === "string" && v !== "" ? v : null;
}

// Reconstruye la edición guardada en `ocr_editar_ok`; vuelve a pasar por
// `parsear_edicion_ocr` para no confiar en lo que quedó en el contexto.
function edicion_de_sesion(contexto: Record<string, unknown>): { borradorId: string; ed: EdicionOcrTexto } | null {
  const borradorId = string_de_contexto(contexto, "borradorId");
  const campo = string_de_contexto(contexto, "campo");
  const valor = string_de_contexto(contexto, "valor");
  if (!borradorId || !campo || !valor) return null;
  const ed = parsear_edicion_ocr(`${campo} ${valor}`);
  if (!ed) return null;
  return { borradorId, ed };
}

// FP3.3: el Dueño escribió mientras la sesión está en `ocr_editar`. El texto
// elige un campo, el núcleo valida y solo el OK del Dueño persiste la edición.
async function atenderEdicionTexto(opts: {
  remitente: string;
  wamid: string;
  texto: string;
  tenantId: string;
  sesion: SesionViva;
  cred: CredencialesEnvio | null;
}): Promise<Response> {
  const borradorId = string_de_contexto(opts.sesion.contexto, "borradorId");
  const ed = parsear_edicion_ocr(opts.texto);
  if (!borradorId || !ed) {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_NO_ENTENDI, cred: opts.cred });
    return Response.json({ ok: true, accion: "ocr_edicion_no_entendida", enviado });
  }
  try {
    const ahoraMs = Date.now();
    const r = await conTenant(opts.tenantId, async (): Promise<{ status: 404; error: string } | ReturnType<typeof editarBorrador>> => {
      const b = await leerBorradorOcrRepo(borradorId);
      if (!b) return { status: 404, error: "borrador inexistente" };
      return editarBorrador(b, parche_de_edicion(ed), new Date(ahoraMs).toISOString());
    });
    if (r.status === 200) {
      await guardarSesion(opts.remitente, "ocr_editar_ok", { borradorId, campo: ed.campo, valor: ed.valor }, ahoraMs, opts.tenantId);
      const enviado = await responderPayload(
        { toE164: opts.remitente, wamidEntrante: opts.wamid, cred: opts.cred },
        payload_propuesta_edicion_ocr(ed, r.borrador),
      );
      return Response.json({ ok: true, accion: "ocr_edicion_propuesta", campo: ed.campo, enviado });
    }
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: mensaje_error_edicion(r.status), cred: opts.cred });
    return Response.json({ ok: true, accion: "ocr_edicion_error", status: r.status, enviado });
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred });
      return Response.json({ ok: true, accion: "ocr_edicion_error", error: "base_no_disponible", enviado });
    }
    throw e;
  }
}

async function atenderBotonOcr(opts: {
  remitente: string;
  wamid: string;
  botonId: string;
  tenantId: string;
  rol: "dueno" | "empleado";
  cred: CredencialesEnvio | null;
}): Promise<Response> {
  const boton = parsear_boton_ocr(opts.botonId);
  if (!boton) return Response.json({ ok: true, accion: "boton_ignorado" });
  if (boton.accion === "confirmar") {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_SENSIBLE_BOT, cred: opts.cred });
    return Response.json({ ok: true, accion: "derivada_web", respuesta: RESPUESTA_SENSIBLE_BOT, enviado });
  }
  if (boton.accion === "editar") {
    // FP3.3: el Dueño corrige por texto; el Empleado sigue derivado a la web.
    if (opts.rol !== "dueno") {
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_EDITAR_WEB, cred: opts.cred });
      return Response.json({ ok: true, accion: "derivada_web", respuesta: RESPUESTA_OCR_EDITAR_WEB, enviado });
    }
    try {
      const ahoraMs = Date.now();
      const b = await conTenant(opts.tenantId, () => leerBorradorOcrRepo(boton.borradorId));
      if (!b) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_BOTON_INVALIDO, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_editar_error", enviado });
      }
      await guardarSesion(opts.remitente, "ocr_editar", { borradorId: b.id }, ahoraMs, opts.tenantId);
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: cuerpo_pedir_edicion_ocr(b), cred: opts.cred });
      return Response.json({ ok: true, accion: "ocr_editar_pedido", enviado });
    } catch (e) {
      if (e instanceof BaseNoDisponible) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_editar_error", error: "base_no_disponible", enviado });
      }
      throw e;
    }
  }
  if (boton.accion === "omitir") {
    try {
      const ahoraIso = new Date().toISOString();
      const b = await conTenant(opts.tenantId, () => leerBorradorOcrRepo(boton.borradorId));
      if (!b) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_BOTON_INVALIDO, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_correccion_omitida_error", enviado });
      }
      const enviado = await responderPayload(
        { toE164: opts.remitente, wamidEntrante: opts.wamid, cred: opts.cred },
        payload_borrador_ocr(b, revisa_borrador(b), ahoraIso),
      );
      return Response.json({ ok: true, accion: "ocr_correccion_omitida", enviado });
    } catch (e) {
      if (e instanceof BaseNoDisponible) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_correccion_omitida_error", error: "base_no_disponible", enviado });
      }
      throw e;
    }
  }
  if (boton.accion === "corregir") {
    // AU10.4/ADR-0093: la corrección la autoriza el Dueño; el Empleado solo
    // recibe el aviso y el borrador queda intacto.
    if (opts.rol !== "dueno") {
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SOLO_DUENO, cred: opts.cred });
      return Response.json({ ok: true, accion: "ocr_corregido_error", respuesta: RESPUESTA_OCR_SOLO_DUENO, enviado });
    }
    try {
      const ahoraIso = new Date().toISOString();
      const corregido = await conTenant(opts.tenantId, async () => {
        const b = await leerBorradorOcrRepo(boton.borradorId);
        if (!b) return null;
        const propuesta = propuesta_correccion_total(b);
        if (!propuesta) return null;
        const editado = await editarBorradorOcrRepo({
          draftId: b.id,
          parche: { totalTexto: monto_texto_ar(propuesta.totalPropuestoCentavos) },
          ahoraIso,
        });
        if (editado.status !== 200) return null;
        await registrarEventoOcr("ocr_corregido", { borrador_id: editado.borrador.id, motivo: "validacion" });
        return editado.borrador;
      });
      if (!corregido) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_BOTON_INVALIDO, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_corregido_error", enviado });
      }
      const enviadoTexto = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_CORREGIDO, cred: opts.cred });
      const enviadoOffer = await responderPayload(
        { toE164: opts.remitente, wamidEntrante: opts.wamid, cred: opts.cred },
        payload_borrador_ocr(corregido, revisa_borrador(corregido), ahoraIso),
      );
      return Response.json({ ok: true, accion: "ocr_corregido", enviado: enviadoTexto && enviadoOffer });
    } catch (e) {
      if (e instanceof BaseNoDisponible) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_corregido_error", error: "base_no_disponible", enviado });
      }
      throw e;
    }
  }
  if (boton.accion === "aprobar") {
    // AU10.4: la edición la aprueba el Dueño; el Empleado solo recibe el aviso.
    if (opts.rol !== "dueno") {
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SOLO_DUENO, cred: opts.cred });
      return Response.json({ ok: true, accion: "ocr_editado_error", respuesta: RESPUESTA_OCR_SOLO_DUENO, enviado });
    }
    try {
      const ahoraMs = Date.now();
      const sesion = await leerSesion(opts.remitente, ahoraMs, opts.tenantId);
      const pendiente = sesion?.paso === "ocr_editar_ok" ? edicion_de_sesion(sesion.contexto) : null;
      if (!pendiente) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_BOTON_INVALIDO, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_editado_error", enviado });
      }
      const ahoraIso = new Date(ahoraMs).toISOString();
      const r = await conTenant(opts.tenantId, async () => {
        const editado = await editarBorradorOcrRepo({ draftId: pendiente.borradorId, parche: parche_de_edicion(pendiente.ed), ahoraIso });
        if (editado.status === 200) {
          await registrarEventoOcr("ocr_editado", { borrador_id: editado.borrador.id, campo: pendiente.ed.campo });
        }
        return editado;
      });
      await guardarSesion(opts.remitente, "nada", {}, ahoraMs, opts.tenantId);
      if (r.status !== 200) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_BOTON_INVALIDO, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_editado_error", enviado });
      }
      const enviado = await responderPayload(
        { toE164: opts.remitente, wamidEntrante: opts.wamid, cred: opts.cred },
        payload_borrador_ocr(r.borrador, revisa_borrador(r.borrador), ahoraIso),
      );
      return Response.json({ ok: true, accion: "ocr_editado", enviado });
    } catch (e) {
      if (e instanceof BaseNoDisponible) {
        const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred });
        return Response.json({ ok: true, accion: "ocr_editado_error", error: "base_no_disponible", enviado });
      }
      throw e;
    }
  }
  if (boton.accion === "cancelar") {
    if (opts.rol !== "dueno") {
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SOLO_DUENO, cred: opts.cred });
      return Response.json({ ok: true, accion: "ocr_edicion_cancelada", respuesta: RESPUESTA_OCR_SOLO_DUENO, enviado });
    }
    await guardarSesion(opts.remitente, "nada", {}, Date.now(), opts.tenantId);
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_CANCELADO, cred: opts.cred });
    return Response.json({ ok: true, accion: "ocr_edicion_cancelada", enviado });
  }
  try {
    const d = await conTenant(opts.tenantId, async () => {
      const r = await descartarBorradorOcrRepo({ draftId: boton.borradorId, ahoraIso: new Date().toISOString() });
      if (r.status === 200) {
        const jobId = r.borrador.idempotencyKey.startsWith("ocr-") ? r.borrador.idempotencyKey.slice(4) : null;
        await registrarEventoOcr("ocr_descartado", jobId ? { job_id: jobId, motivo: "boton" } : { borrador_id: r.borrador.id, motivo: "boton" });
      }
      return r;
    });
    const texto = d.status === 200 ? RESPUESTA_OCR_DESCARTADO : RESPUESTA_OCR_BOTON_INVALIDO;
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto, cred: opts.cred });
    return Response.json({ ok: true, accion: d.status === 200 ? "ocr_descartado" : "ocr_descartado_error", enviado });
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred });
      return Response.json({ ok: true, accion: "ocr_descartado_error", error: "base_no_disponible", enviado });
    }
    throw e;
  }
}

// BOT-S8: el toque de una acción propuesta (ADR-0040). El bot prepara, el
// comerciante confirma: reponer deja un borrador de OC abierto (nunca lo
// confirma ni le escribe al proveedor) y cobrar devuelve el texto de
// recordatorio + link wa.me para que lo mande el Dueño (nunca al cliente).
async function atenderBotonAccion(opts: {
  remitente: string;
  wamid: string;
  botonId: string;
  tenantId: string;
  googleSub: string;
  rol: "dueno" | "empleado";
  soloLectura: boolean;
  cred: CredencialesEnvio | null;
}): Promise<Response> {
  const invalida = async (): Promise<Response> => {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_ACCION_INVALIDA, cred: opts.cred });
    return Response.json({ ok: true, accion: "accion_invalida", enviado });
  };
  const boton = parsear_boton_accion(opts.botonId);
  if (!boton) return invalida();
  const modulo = MODULO_DE_ACCION[boton.tipo];
  const modulos = await leerModulosBot(opts.tenantId);
  if (!modulos.includes(modulo)) {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: MENSAJE_MODULO_APAGADO, cred: opts.cred });
    return Response.json({ ok: true, accion: "accion_modulo_apagado", modulo, enviado });
  }
  // B1.7: armar un pedido es del Dueño (y nunca de un comercio suspendido).
  if (opts.rol !== "dueno" || opts.soloLectura) {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_ACCION_SOLO_DUENO, cred: opts.cred });
    return Response.json({ ok: true, accion: "accion_sin_permiso", enviado });
  }
  try {
    if (boton.tipo === "reponer") return await atenderAccionReponer(opts, boton.ref);
    return await atenderAccionCobrar(opts, boton.ref);
  } catch (e) {
    if (e instanceof BaseNoDisponible) {
      const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred });
      return Response.json({ ok: true, accion: "accion_error", error: "base_no_disponible", enviado });
    }
    throw e;
  }
}

// Reponer X: crea (o reusa en el mismo mes, clave proveedor+sku+mes AR) un
// borrador de OC abierta con la cantidad sugerida del catálogo vivo. Nunca la
// confirma ni le escribe al proveedor: la confirmación vive en la web (AU10.4).
// Por qué el proveedor único: products no tiene proveedor; con 0 o más de un
// proveedor activo el bot no adivina y deriva al panel.
async function atenderAccionReponer(
  opts: { remitente: string; wamid: string; tenantId: string; googleSub: string; cred: CredencialesEnvio | null },
  ref: string,
): Promise<Response> {
  const contestar = async (texto: string, cuerpo: Record<string, unknown>): Promise<Response> => {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto, cred: opts.cred });
    return Response.json({ ok: true, ...cuerpo, enviado });
  };
  const item = (await listarCatalogoVivo(opts.tenantId)).find((c) => c.sku === ref);
  if (!item) return contestar(RESPUESTA_ACCION_INVALIDA, { accion: "accion_invalida" });
  const { proveedores } = await conTenant(opts.tenantId, () => listarProveedores());
  const activos = proveedores.filter((p) => p.activo);
  const proveedor = elegirProveedorUnico(item.proveedor, activos);
  if (!proveedor) {
    return contestar(`No sé a qué proveedor pedirle ${item.nombre}. Armá el pedido desde el panel de proveedores.`, {
      accion: "accion_sin_proveedor",
    });
  }
  const qty = cantidad_reponer({ sku: item.sku, nombre: item.nombre, stock: item.stock, umbral: item.umbral, reorderQty: item.reorderQty ?? null });
  const costo = costoCentavosReponer(item);
  const ahora = Date.now();
  const mes = mesAR(ahora);
  const r = await conTenant(opts.tenantId, () =>
    crearOrdenRepo({
      key: `bot-accion:reponer:${proveedor.cuit}:${item.sku}:${mes}`,
      supplierCuit: proveedor.cuit,
      lineas: [{ sku: item.sku, qty, costoCentavos: costo }],
      creadoPor: opts.googleSub,
      ahoraIso: new Date(ahora).toISOString(),
    }),
  );
  if (!r.ok && r.codigo !== "DUPLICADA") return contestar(RESPUESTA_ACCION_INVALIDA, { accion: "accion_invalida" });
  if (!r.ok) {
    return contestar(
      `Ya tenías el borrador de pedido de ${item.nombre} a ${proveedor.nombre} de este mes. Revisalo y confirmalo desde el panel de proveedores.`,
      { accion: "accion_reponer_borrador", reusado: true, order_id: null },
    );
  }
  return contestar(
    `Armé un borrador de pedido a ${proveedor.nombre}: ${item.nombre} x ${qty} (quedan ${item.stock}). No se envió nada: revisalo y confirmalo desde el panel de proveedores.`,
    { accion: "accion_reponer_borrador", reusado: false, order_id: r.orderId },
  );
}

// Cobrar X: devuelve al Dueño el recordatorio y el link wa.me del cliente. El
// bot nunca le escribe al cliente.
async function atenderAccionCobrar(
  opts: { remitente: string; wamid: string; tenantId: string; cred: CredencialesEnvio | null },
  ref: string,
): Promise<Response> {
  const invalida = async (): Promise<Response> => {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_ACCION_INVALIDA, cred: opts.cred });
    return Response.json({ ok: true, accion: "accion_invalida", enviado });
  };
  const { clientes } = await conTenant(opts.tenantId, () => listarClientesConSaldo(Date.now()));
  const cliente = clientes.find((c) => c.id === ref);
  if (!cliente || cliente.saldoCentavos <= 0n) return invalida();
  const comercio = control.tenants.get(opts.tenantId)?.nombreComercio ?? "tu comercio";
  const recordatorio = texto_recordatorio(cliente.nombre, comercio, cliente.saldoCentavos);
  const wa = cliente.telefono === null ? null : link_whatsapp(cliente.telefono, recordatorio);
  const link = wa !== null && wa.ok ? wa.url : null;
  const cola = link !== null ? `Mandalo desde acá: ${link}` : `Sin teléfono cargado para ${cliente.nombre}.`;
  const enviado = await responder({
    toE164: opts.remitente,
    wamidEntrante: opts.wamid,
    texto: `Recordatorio para ${cliente.nombre}:\n${recordatorio}\n${cola}`,
    cred: opts.cred,
  });
  return Response.json({ ok: true, accion: "accion_cobrar_recordatorio", enviado });
}

// OCR1-S5: foto o PDF por WhatsApp abre un borrador con confianza por campo y
// se ofrece con [Confirmar] [Editar] [Descartar]. Idempotente por wamid (AT1) y
// en el tenant del número. El media se descarga de Meta con las credenciales
// del número central y sus bytes van al motor OCR; el job guarda
// `wa-media:<id>` como referencia de auditoría. Todo inline en la request, sin
// cola, para poder ofrecer el borrador en la misma vuelta.
async function ofrecerBorradorOcr(opts: {
  remitente: string;
  wamid: string;
  adjunto: { idMedia: string; mimeType: string };
  tenantId: string;
  cred: CredencialesEnvio | null;
  origen?: OrigenIngesta;
  // PROV-S8: a quién se le ofrece el borrador. `undefined` = al remitente
  // (Dueño/Empleado). Un número = al Dueño del comercio. `null` = sin aviso:
  // el borrador igual se crea y el llamador responde al remitente.
  destinoOferta?: string | null;
  alCrearBorrador?: (borrador: Borrador) => void | Promise<void>;
}): Promise<Response> {
  if (!es_comprobante_desde_mime(opts.adjunto.mimeType)) {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_NO_COMPROBANTE, cred: opts.cred });
    return Response.json({ ok: true, accion: "ocr_no_comprobante", respuesta: RESPUESTA_NO_COMPROBANTE, enviado });
  }
  const t = opts.cred ? crearTransporteCloud({ phoneNumberId: opts.cred.phoneNumberId, token: opts.cred.token }) : null;
  const imagen = t ? await t.descargarMedia(opts.adjunto.idMedia) : null;
  if (!imagen) {
    const enviado = await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_MEDIA_FALLIDA, cred: opts.cred });
    return Response.json({ ok: true, accion: "ocr_media_fallida", enviado });
  }
  const r = await ingerirOcr({
    idempotencyKey: opts.wamid,
    body: {
      origen: opts.origen ?? "wa",
      bytes_ref: `wa-media:${opts.adjunto.idMedia}`,
      es_comprobante: true,
      foto_pendiente: true,
    },
    tenantId: opts.tenantId,
    imagen,
  });
  if (r.status === 200) {
    // Reentrega en frío (dedup en memoria perdido): el job ya existe y no se
    // vuelve a ofrecer el borrador.
    return Response.json({ ok: true, accion: "ocr_duplicado", job_id: r.jobId, borrador_id: r.borradorId });
  }
  if (r.status === 201) {
    // S6/S7: antes de ofrecer el borrador, el llamador ata la identidad del
    // proveedor al CUIT leído. Sin callback no cambia nada.
    await opts.alCrearBorrador?.(r.borrador);
    const ahoraIso = new Date().toISOString();
    const propuesta = propuesta_correccion_total(r.borrador);
    const destino = opts.destinoOferta === undefined ? opts.remitente : opts.destinoOferta;
    const enviado =
      destino === null
        ? false
        : await responderPayload(
            { toE164: destino, wamidEntrante: opts.wamid, cred: opts.cred },
            propuesta
              ? payload_correccion_ocr(r.borrador, propuesta)
              : payload_borrador_ocr(r.borrador, r.revisa, ahoraIso),
          );
    return Response.json({
      ok: true,
      accion: "ocr_borrador",
      job_id: r.jobId,
      borrador_id: r.borrador.id,
      confianza_global: r.confianzaGlobal,
      revisa: r.revisa,
      enviado,
    });
  }
  const enviado =
    r.status === 503
      ? await responder({ toE164: opts.remitente, wamidEntrante: opts.wamid, texto: RESPUESTA_OCR_SIN_BASE, cred: opts.cred })
      : false;
  return Response.json({ ok: true, accion: r.status === 503 ? "ocr_sin_base" : "ocr_rechazado", enviado });
}

// ADR-0096: el número central es compartido, así que el comercio de un
// proveedor sale SOLO del código de invitación, nunca del contenido. Devuelve
// null cuando el remitente no es proveedor y sigue el flujo normal.
async function atenderProveedor(opts: {
  msg: MensajeEntranteWa;
  ahoraMs: number;
  cred: CredencialesEnvio | null;
}): Promise<Response | null> {
  const { msg, ahoraMs, cred } = opts;
  const contacto = contacto_por_numero(control.proveedorContactos, msg.remitente);
  // PROV-E4: el cupo corre antes de cualquier respuesta u OCR. Un revocado no
  // consume cupo y sigue a la puerta de identidad.
  if (contacto && contacto.estado !== "revocado") {
    const cupo = evaluar_cupo_proveedor({
      marcasMs: control.proveedorCupo.get(msg.remitente) ?? [],
      ahoraMs,
    });
    control.proveedorCupo.set(msg.remitente, [...cupo.marcasMs]);
    if (!cupo.permitido) {
      // Solo el primer corte de cada racha responde; los siguientes callan
      // para no amplificar el spam.
      let enviado = false;
      if (!control.proveedorCupoAviso.has(msg.remitente)) {
        enviado = await responder({
          toE164: msg.remitente,
          wamidEntrante: msg.wamid,
          texto: RESPUESTA_PROV_CUPO,
          cred,
        });
        control.proveedorCupoAviso.set(msg.remitente, true);
      }
      return Response.json({ ok: true, accion: "prov_cupo_excedido", enviado });
    }
    control.proveedorCupoAviso.delete(msg.remitente);
  }
  const codigo = parsear_invitar(msg.texto);
  if (codigo !== null) {
    const hash = sha256Hex(codigo);
    const inv = control.proveedorInvitaciones.get(hash) ?? null;
    const v = verificar_invitacion({
      textoEntrante: msg.texto,
      codigoIngresadoHash: hash,
      invitacion: inv,
      ahoraMs,
    });
    if (!v.ok || !inv) {
      const enviado = await responder({
        toE164: msg.remitente,
        wamidEntrante: msg.wamid,
        texto: RESPUESTA_PROV_CODIGO_INVALIDO,
        cred,
      });
      return Response.json({ ok: true, accion: "prov_codigo_invalido", motivo: v.ok ? "codigo_invalido" : v.motivo, enviado });
    }
    // Un número ata a un comercio: si ya es proveedor verificado de otro, no
    // se reasigna y se responde el genérico de código inválido.
    const existente = contacto_por_numero(control.proveedorContactos, msg.remitente);
    if (existente?.estado === "verificado" && existente.tenantId !== inv.tenantId) {
      const enviado = await responder({
        toE164: msg.remitente,
        wamidEntrante: msg.wamid,
        texto: RESPUESTA_PROV_CODIGO_INVALIDO,
        cred,
      });
      return Response.json({ ok: true, accion: "prov_codigo_invalido", motivo: "numero_ocupado", enviado });
    }
    control.proveedorContactos.set(msg.remitente, {
      numeroE164: msg.remitente,
      tenantId: inv.tenantId,
      supplierCuit: inv.supplierCuit,
      estado: "pendiente",
      creadoEn: new Date(ahoraMs).toISOString(),
    });
    control.proveedorInvitaciones.set(hash, { ...inv, usado: true });
    const enviado = await responder({
      toE164: msg.remitente,
      wamidEntrante: msg.wamid,
      texto: RESPUESTA_PROV_RECIBIDO,
      cred,
    });
    return Response.json({ ok: true, accion: "prov_invitado", tenantId: inv.tenantId, enviado });
  }
  if (!contacto) return null;
  if (contacto.estado === "verificado") {
    if (msg.adjunto) {
      // S6/S7: el contacto verificado manda la factura. Antes de ofrecer el
      // borrador se ata su identidad al CUIT que leyó el OCR. El callback corre
      // dentro de `ofrecerBorradorOcr`; `vinculo` queda para la respuesta.
      // S8: el aviso con botones va al Dueño verificado; el proveedor recibe
      // solo el acuse. Sin Dueño con número verificado, igual entra el borrador.
      const destino = numero_dueno_verificado({
        tenantId: contacto.tenantId,
        memberships: [...control.memberships.values()].map((m) => ({
          tenantId: m.tenantId,
          googleSub: m.googleSub,
          rol: m.rol,
          estado: m.estado,
        })),
        botLinks: [...control.botLinks.entries()].map(([numeroE164, l]) => ({ numeroE164, ...l })),
      });
      const vinculo: { r: ResultadoVincularCuit | null } = { r: null };
      const res = await ofrecerBorradorOcr({
        remitente: msg.remitente,
        wamid: msg.wamid,
        adjunto: msg.adjunto,
        tenantId: contacto.tenantId,
        cred,
        origen: "wa_proveedor",
        destinoOferta: destino,
        alCrearBorrador: async (borrador) => {
          const { proveedores } = await conTenant(contacto.tenantId, () => listarProveedores());
          const resultado = vincular_cuit_contacto({ contacto, cuitLeido: borrador.cuit, proveedores });
          if (resultado.cambio) control.proveedorContactos.set(contacto.numeroE164, resultado.contacto);
          vinculo.r = resultado;
        },
      });
      const resultado = vinculo.r;
      if (resultado === null) return res;
      const cuit = resultado.cambio ? resultado.contacto.supplierCuit : resultado.supplierCuit;
      const cuerpo = (await res.json()) as Record<string, unknown>;
      if (cuerpo["accion"] === "ocr_borrador") {
        await responder({
          toE164: msg.remitente,
          wamidEntrante: msg.wamid,
          texto: RESPUESTA_PROV_FACTURA_RECIBIDA,
          cred,
        });
      }
      return Response.json({ ...cuerpo, cuit, proveedor_existe: resultado.proveedorExiste, aviso_dueno: destino !== null });
    }
    const enviado = await responder({
      toE164: msg.remitente,
      wamidEntrante: msg.wamid,
      texto: RESPUESTA_PROV_FACTURA,
      cred,
    });
    return Response.json({ ok: true, accion: "prov_factura_pedida", enviado });
  }
  if (contacto.estado === "pendiente") {
    const enviado = await responder({
      toE164: msg.remitente,
      wamidEntrante: msg.wamid,
      texto: RESPUESTA_PROV_PENDIENTE,
      cred,
    });
    return Response.json({ ok: true, accion: "prov_pendiente", enviado });
  }
  // revocado: cae a la puerta de identidad y recibe el genérico no vinculado.
  return null;
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
  // El proveedor no está vinculado: va antes de la puerta de identidad.
  const proveedor = await atenderProveedor({ msg, ahoraMs, cred });
  if (proveedor) return proveedor;
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
  const cmd = parsear_comando_aviso(msg.texto);
  if (cmd.kind === "baja") {
    void guardarOptIn({ tenantId: r.tenantId, googleSub: r.googleSub, alta: false, ahoraMs }).catch((e: unknown) =>
      console.error("[whatsapp] opt-out", e),
    );
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_BAJA, cred });
    return Response.json({ ok: true, accion: "opt_out", respuesta: RESPUESTA_BAJA, enviado });
  }
  if (cmd.kind === "alta") {
    void guardarOptIn({
      tenantId: r.tenantId,
      googleSub: r.googleSub,
      alta: true,
      ahoraMs,
      optInTexto: msg.texto,
    }).catch((e: unknown) => console.error("[whatsapp] opt-in", e));
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_ALTA, cred });
    return Response.json({ ok: true, accion: "opt_in", respuesta: RESPUESTA_ALTA, enviado });
  }
  if (cmd.kind === "pausa") {
    const prefs = await prefsDe(r.tenantId, r.googleSub);
    const pausadoHastaMs = msg.timestampMs + cmd.dias * 86_400_000;
    void guardarEleccion({
      tenantId: r.tenantId,
      googleSub: r.googleSub,
      pedido: { canal: prefs.canal, avisoHora: prefs.avisoHora, pausadoHastaMs },
    }).catch((e: unknown) => console.error("[whatsapp] pausa avisos", e));
    const texto = `Listo, pausé los avisos por ${cmd.dias} días.`;
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto, cred });
    return Response.json({ ok: true, accion: "pausa", respuesta: texto, enviado });
  }
  if (cmd.kind === "cambio_hora") {
    const prefs = await prefsDe(r.tenantId, r.googleSub);
    void guardarEleccion({
      tenantId: r.tenantId,
      googleSub: r.googleSub,
      pedido: { canal: prefs.canal, avisoHora: cmd.hora, pausadoHastaMs: prefs.pausadoHastaMs },
    }).catch((e: unknown) => console.error("[whatsapp] hora aviso", e));
    const texto = `Quedó el aviso matutino a las ${cmd.hora}.`;
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto, cred });
    return Response.json({ ok: true, accion: "cambio_hora", respuesta: texto, enviado });
  }
  // OCR1-S5: el toque de un botón del borrador no es consulta. Descartar cierra
  // inline; Confirmar se deriva a la web y Editar abre la edición por texto del
  // Dueño (AU10.4, ADR-0005, FP3.3).
  if (msg.boton) {
    // BOT-S8: un botón `acc:` se despacha antes del flujo OCR.
    if (parsear_boton_accion(msg.boton)) {
      return atenderBotonAccion({
        remitente: msg.remitente,
        wamid: msg.wamid,
        botonId: msg.boton,
        tenantId: r.tenantId,
        googleSub: r.googleSub,
        rol: r.rol,
        soloLectura: r.soloLectura,
        cred,
      });
    }
    return atenderBotonOcr({ remitente: msg.remitente, wamid: msg.wamid, botonId: msg.boton, tenantId: r.tenantId, rol: r.rol, cred });
  }
  // OCR1-S5: el adjunto no es una consulta del bot; abre el borrador del
  // comprobante con el tenant del número ya resuelto por la puerta de identidad.
  if (msg.adjunto) {
    return ofrecerBorradorOcr({
      remitente: msg.remitente,
      wamid: msg.wamid,
      adjunto: msg.adjunto,
      tenantId: r.tenantId,
      cred,
    });
  }
  // FP3.3: con la sesión `ocr_editar` abierta, el texto del Dueño corrige el
  // borrador. Con otro rol la sesión se ignora y sigue el flujo normal.
  if (r.rol === "dueno") {
    const sesionEdicion = await leerSesion(msg.remitente, ahoraMs, r.tenantId);
    if (sesionEdicion?.paso === "ocr_editar") {
      return atenderEdicionTexto({
        remitente: msg.remitente,
        wamid: msg.wamid,
        texto: msg.texto,
        tenantId: r.tenantId,
        sesion: sesionEdicion,
        cred,
      });
    }
  }
  // WA-CUPO: mora, aviso 80%, techo 100% y registro de consulta (PLAN-S6/S11).
  try {
    const cupoBot = await evaluarCupoConsultaBot({ tenantId: r.tenantId, ahoraMs });
    if (cupoBot.tipo === "suspendida") {
      const enviado = await responder({
        toE164: msg.remitente,
        wamidEntrante: msg.wamid,
        texto: cupoBot.mensaje,
        cred,
      });
      return Response.json({ ok: true, accion: "cuenta_suspendida", respuesta: cupoBot.mensaje, enviado });
    }
    if (cupoBot.tipo === "agotado") {
      encolarEmailCupoCuenta({
        tenantId: r.tenantId,
        porcentaje: 100,
        usado: cupoBot.usado,
        cupo: cupoBot.cupo,
        ahoraMs,
      });
      const respuesta = `${cupoBot.mensaje}\nSeguí por la web: ${armar_link_wame(msg.remitente, "Seguí por la web")}`;
      const enviado = await responder({
        toE164: msg.remitente,
        wamidEntrante: msg.wamid,
        texto: respuesta,
        cred,
      });
      return Response.json({ ok: true, accion: "cupo_bot_agotado", respuesta, enviado });
    }
    if (cupoBot.tipo === "aviso") {
      encolarEmailCupoCuenta({
        tenantId: r.tenantId,
        porcentaje: 80,
        usado: cupoBot.usado,
        cupo: cupoBot.cupo,
        ahoraMs,
      });
    }
  } catch (e) {
    if (!(e instanceof BaseNoDisponible)) throw e;
    console.warn("[whatsapp] sin base para evaluar cupo del bot", e);
  }
  // DASH-S3 (ADR-0034): consulta del bot registrada best-effort. Un fallo de
  // DB nunca rompe el 200 ni cambia la respuesta; VINCULAR/BAJA/ALTA y los no
  // vinculados ya salieron antes por otros caminos.
  void registrarConsultaBot({ tenantId: r.tenantId, numeroE164: msg.remitente, wamid: msg.wamid, ahoraMs }).catch(
    (e: unknown) => console.error("[whatsapp] no se pudo registrar la consulta", e),
  );
  if (sensible) {
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: RESPUESTA_SENSIBLE_BOT, cred });
    return Response.json({ ok: true, accion: "derivada_web", respuesta: RESPUESTA_SENSIBLE_BOT, enviado });
  }
  // B6/B10: comandos de lista del viernes y día a día (solo lectura,
  // con stock vivo). Si el router responde, no se sigue a la consulta.
  const tenantPrevio = resolver_tenant_de(msg.remitente);
  const tenantId = tenantPrevio?.id ?? "";
  const catalogo = await listarCatalogoVivo(tenantId || undefined);
  const sesion = await leerSesion(msg.remitente, ahoraMs, tenantId || undefined);
  const ruta = enrutar({
    texto: msg.texto,
    catalogo: catalogo.map((c) => ({ sku: c.sku, nombre: c.nombre, stock: c.stock, umbral: c.umbral, proveedor: c.proveedor ?? null })),
    comercio: tenantPrevio?.nombreComercio ?? "tu comercio",
    pedidos: await listarPedidosDia(tenantId || undefined),
    movs: await listarMovimientosVista(ahoraMs, tenantId || undefined),
    friday: leerListaViernes(tenantId, catalogo, ahoraMs),
    sesion,
    ahoraMs,
    modulos: await leerModulosBot(tenantId),
  });
  if (ruta.accion === "viernes_guardado") {
    agregarListaViernes(tenantId, ruta.friday, ahoraMs);
  }
  if (ruta.accion !== "nada") {
    if (ruta.accion === "alertas") await guardarSesion(msg.remitente, "alertas", { pagina: ruta.pagina }, ahoraMs, tenantId || undefined);
    const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: ruta.texto, cred });
    return Response.json({ ok: true, accion: ruta.accion, respuesta: ruta.texto, enviado });
  }
  const pedidoDetalle = consulta_con_detalle(msg.texto);
  const intencionDetectada = detectar_intencion(msg.texto);
  // BOT2-S4: "detalle de X" es consulta de stock aunque no diga cuántos/stock.
  const intencion =
    pedidoDetalle && pedidoDetalle.texto !== "" && intencionDetectada === "ninguna" ? "stock" : intencionDetectada;
  // BOT2-S2: "2" elige el segundo de la última lista numerada del bot.
  if (intencion !== "stock" && intencion !== "precio" && intencion !== "alertas" && sesion?.paso === "desambiguar") {
    const raw = sesion.contexto["opciones"];
    const opciones = Array.isArray(raw) ? raw.filter((o): o is string => typeof o === "string") : [];
    const sku = resolver_seleccion(msg.texto, opciones);
    if (sku) {
      const membSel = membershipActiva(r.tenantId, r.googleSub);
      const ctxSel = emitir_contexto(r, ahoraMs);
      const comercioSel = control.tenants.get(r.tenantId)?.nombreComercio ?? "tu comercio";
      let textoSel: string;
      try {
        const fuenteSel = dbVivaTenant(r.tenantId) ? "db" : "memoria";
        const ficha = await leerFicha({ tenantId: r.tenantId, sku });
        textoSel = ficha
          ? redactarFicha({ ctx: ctxSel, ficha, comercio: comercioSel, permisos: membSel?.permisos ?? [] })
          : `No encontré esa opción en ${comercioSel}.`;
        if (ficha) {
          // BOT2-S4: el candidato elegido queda para el "detalle" siguiente.
          await guardarSesion(msg.remitente, "stock", { sku }, ahoraMs, r.tenantId);
        }
        registrarTurnoConsulta({
          tenantId: r.tenantId,
          wamid: msg.wamid,
          remitente: msg.remitente,
          googleSub: r.googleSub,
          pregunta: msg.texto,
          respuesta: textoSel,
          fuente: fuenteSel,
          ahoraMs,
        });
      } catch (e) {
        if (e instanceof BaseNoDisponible) {
          textoSel = "No pude consultar, probá en un rato.";
        } else {
          throw e;
        }
      }
      const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: textoSel, cred });
      return Response.json({ ok: true, accion: "consulta", respuesta: textoSel, enviado });
    }
  }
  // BOT2-S4: "detalle" a secas pide los lotes del último producto consultado.
  if (pedidoDetalle && pedidoDetalle.texto === "" && sesion?.paso === "stock") {
    const skuRaw = sesion.contexto["sku"];
    const sku = typeof skuRaw === "string" ? skuRaw : "";
    if (sku) {
      const comercioDet = control.tenants.get(r.tenantId)?.nombreComercio ?? "tu comercio";
      let textoDet: string;
      try {
        const fuenteDet = dbVivaTenant(r.tenantId) ? "db" : "memoria";
        const ficha = await leerFicha({ tenantId: r.tenantId, sku });
        const detalle = ficha
          ? await textoDetalleSiCorresponde({
              tenantId: r.tenantId,
              sku,
              nombre: ficha.nombre,
              comercio: comercioDet,
            })
          : null;
        const ctxDet = emitir_contexto(r, ahoraMs);
        const membDet = membershipActiva(r.tenantId, r.googleSub);
        textoDet =
          detalle ??
          (ficha
            ? redactarFicha({ ctx: ctxDet, ficha, comercio: comercioDet, permisos: membDet?.permisos ?? [] })
            : `No encontré esa opción en ${comercioDet}.`);
        registrarTurnoConsulta({
          tenantId: r.tenantId,
          wamid: msg.wamid,
          remitente: msg.remitente,
          googleSub: r.googleSub,
          pregunta: msg.texto,
          respuesta: textoDet,
          fuente: fuenteDet,
          ahoraMs,
        });
      } catch (e) {
        if (e instanceof BaseNoDisponible) {
          textoDet = "No pude consultar, probá en un rato.";
        } else {
          throw e;
        }
      }
      const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: textoDet, cred });
      return Response.json({ ok: true, accion: "consulta", intencion: "stock", respuesta: textoDet, enviado });
    }
  }
  if (!sensible && !posibleCosto && intencion !== "stock" && intencion !== "precio" && intencion !== "alertas") {
    // IA-S4: el asistente va después de los flujos existentes y solo si el
    // plan del tenant del vínculo lo incluye. Apagado no se llama al LLM.
    if (reconoce_pregunta_ia(msg.texto)) {
      let incluido = false;
      let cupo = CUPO_ASISTENTE_POR_DEFECTO;
      try {
        const inc = await planIncluye(r.tenantId, "asistente_ia");
        incluido = inc.incluida;
        if (typeof inc.cupo === "number") cupo = inc.cupo;
      } catch (e) {
        if (!(e instanceof BaseNoDisponible)) throw e;
        console.warn("[whatsapp] sin base para verificar el plan del asistente", e);
      }
      // Sin ASSISTANT_LLM_KEY el proveedor es el fake (devuelve el prompt
      // crudo): no se le contesta al comercio con eso, sigue el flujo actual.
      const proveedor = incluido ? crear_proveedor_llm_desde_env() : null;
      if (proveedor && !(proveedor instanceof ProveedorLLMFake)) {
        const respuesta = await preguntar_asistente_bot({
          texto: msg.texto,
          tenantId: r.tenantId,
          rol: r.rol,
          cupoConsultasPorMes: cupo,
          proveedor,
          registro: crearRegistroUsoIA(),
          lecturas: crearLecturasIA(),
        });
        if (respuesta) {
          const enviado = await responder({
            toE164: msg.remitente,
            wamidEntrante: msg.wamid,
            texto: respuesta.texto,
            cred,
          });
          return Response.json({
            ok: true,
            accion: "asistente",
            respuesta: respuesta.texto,
            herramienta: respuesta.herramienta,
            enviado,
          });
        }
      }
    }
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
  const comercio = tenant?.nombreComercio ?? "tu comercio";
  const permisos = membMsg?.permisos ?? [];
  let atencion: ReturnType<typeof redactarConsulta>;
  let fuenteConsulta: "db" | "memoria" | null = null;
  if (intencion === "alertas") {
    atencion = atender_alertas(await listarCatalogoVivo(r.tenantId), comercio);
  } else {
    try {
      const textoConsulta = pedidoDetalle && pedidoDetalle.texto !== "" ? pedidoDetalle.texto : msg.texto;
      const { origen, resolucion } = await consultarNombre({ tenantId: r.tenantId, texto: textoConsulta });
      fuenteConsulta = origen;
      atencion = redactarConsulta({ ctx, resolucion, termino: extraer_termino(textoConsulta), comercio, permisos });
      if (resolucion.kind === "directo") {
        // BOT2-S4: guarda el sku para que un "detalle" posterior liste los lotes.
        await guardarSesion(msg.remitente, "stock", { sku: resolucion.ficha.sku }, ahoraMs, r.tenantId);
        if (pedidoDetalle) {
          const detalle = await textoDetalleSiCorresponde({
            tenantId: r.tenantId,
            sku: resolucion.ficha.sku,
            nombre: resolucion.ficha.nombre,
            comercio,
          });
          if (detalle) atencion = { kind: "respuesta", texto: detalle };
        }
      }
    } catch (e) {
      if (e instanceof BaseNoDisponible) {
        const texto = "No pude consultar, probá en un rato.";
        const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto, cred });
        return Response.json({ ok: true, accion: "consulta", intencion, respuesta: texto, enviado });
      }
      throw e;
    }
  }
  // B4: la lista de alertas deja sesión para el "ver más" paginado.
  if (intencion === "alertas") await guardarSesion(msg.remitente, "alertas", { pagina: 1 }, ahoraMs, r.tenantId);
  // BOT2-S2: la lista numerada deja sus skus para la selección con 1-5.
  if (atencion.kind === "desambiguar") {
    await guardarSesion(msg.remitente, "desambiguar", { opciones: atencion.opciones.map((o) => o.sku) }, ahoraMs, r.tenantId);
  }
  if ((intencion === "stock" || intencion === "precio") && atencion.kind !== "desambiguar" && fuenteConsulta) {
    registrarTurnoConsulta({
      tenantId: r.tenantId,
      wamid: msg.wamid,
      remitente: msg.remitente,
      googleSub: r.googleSub,
      pregunta: msg.texto,
      respuesta: atencion.texto,
      fuente: fuenteConsulta,
      ahoraMs,
    });
  }
  const enviado = await responder({ toE164: msg.remitente, wamidEntrante: msg.wamid, texto: atencion.texto, cred });
  return Response.json({ ok: true, accion: "consulta", intencion, respuesta: atencion.texto, enviado });
};

// PERS2-S10: catálogo, sesión, viernes, pedidos y movimientos salen del
// repositorio del canal (DB del tenant primero, memoria solo en single).
function resolver_tenant_de(remitente: string): { id: string; nombreComercio: string } | null {
  const link = control.botLinks.get(remitente);
  if (!link) return null;
  const t = control.tenants.get(link.tenantId);
  if (!t) return null;
  return { id: link.tenantId, nombreComercio: (t as { nombreComercio?: string }).nombreComercio ?? "tu comercio" };
}

// Un mensaje entrante de la Cloud API: texto, adjunto (image/document) o el
// toque de un botón (interactive). Los otros tipos de Meta (audio, voz,
// ubicación) siguen ignorándose.
interface MensajeEntranteWa {
  wamid: string;
  remitente: string;
  texto: string;
  timestampMs: number;
  adjunto: { idMedia: string; mimeType: string; nombreArchivo: string | null } | null;
  boton: string | null;
}

function extraer_mensaje(body: unknown): MensajeEntranteWa | null {
  const boton = normalizarBotonEntrada(body);
  if (boton) return { wamid: boton.wamid, remitente: boton.remitenteE164, texto: "", timestampMs: boton.timestampMs, adjunto: null, boton: boton.botonId };
  const texto = normalizarEntrada(body);
  if (texto) {
    return { wamid: texto.wamid, remitente: texto.remitenteE164, texto: texto.texto, timestampMs: texto.timestampMs, adjunto: null, boton: null };
  }
  const adjunto = normalizarAdjuntoEntrada(body);
  if (!adjunto) return null;
  return { wamid: adjunto.wamid, remitente: adjunto.remitenteE164, texto: "", timestampMs: adjunto.timestampMs, adjunto: adjunto.adjunto, boton: null };
}
