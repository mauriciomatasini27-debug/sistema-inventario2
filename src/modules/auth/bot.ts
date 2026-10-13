// Identidad del bot P0 (AU11). Núcleo puro: sin IO.
// El vínculo (número → usuario) se crea desde la web logueada con código de
// un solo uso; el rol y los permisos se leen de la membership en cada
// mensaje, nunca se copian en el vínculo (AU11.4).

export const RESPUESTA_SIN_PERMISO_COSTO = "No tenés permiso para ver costos." as const;

// AU10.4/AU11.7: las acciones sensibles solo se hacen desde la web. Si se
// piden por WhatsApp, el bot responde con un enlace a la web y no ejecuta.
export const RESPUESTA_SENSIBLE_BOT =
  "Esa acción es sensible y solo se hace desde la web. Entrá a tu comercio para continuarla." as const;

// AU11.3: el Dueño siempre puede usar el bot; el Empleado necesita el
// interruptor "Puede usar el bot" (por defecto activado en el MVP).
export function puedeUsarBot(input: { rol: "dueno" | "empleado"; puedeUsarBot?: boolean | undefined }): boolean {
  if (input.rol === "dueno") return true;
  return input.puedeUsarBot !== false;
}

// AU11.5: un número solo puede estar vinculado a un usuario a la vez.
export function numeroOcupadoPorOtro(input: {
  vinculos: ReadonlyArray<{ numeroE164: string; googleSub: string; estado: string }>;
  numero: string;
  googleSub: string;
}): boolean {
  const v = input.vinculos.find((x) => x.numeroE164 === input.numero);
  return !!v && v.estado === "verificado" && v.googleSub !== input.googleSub;
}

const SIN_TILDES = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// "Cuánto me cuesta el Milka" pregunta por costo (restringido en el MVP);
// "precio" o "cuánto sale" es precio de venta (permitido).
export function preguntaPorCosto(texto: string): boolean {
  const t = ` ${SIN_TILDES(texto)} `;
  return /(cuanto me cuesta|cuanto cuesta|costo|margen)/.test(t);
}

export function esPeticionSensibleBot(texto: string): boolean {
  const t = ` ${SIN_TILDES(texto)} `;
  return /exportar|historial|cbu|datos? de cobro|datos? de pago|invit(ar|acion|ame)|revoc(ar|acion|ame)|cambiar.*permiso|suscripcion|cambiar.*plan|dar.*de baja|conectar.*gmail|google photos/.test(t);
}

export type TipoAvisoBot = "resumen_cierre" | "aviso_facturas" | "alerta_stock" | "aviso_matutino" | "alerta_seguridad";

// AU11.9: los avisos con contenido sensible (cierre de caja, facturas)
// solo van a números vinculados de usuarios con permiso (Dueño en el MVP);
// el resto va a cualquier vinculado habilitado.
export function puedeRecibirAviso(input: { rol: "dueno" | "empleado"; tipo: TipoAvisoBot }): boolean {
  if (input.tipo === "resumen_cierre" || input.tipo === "aviso_facturas") {
    return input.rol === "dueno";
  }
  return true;
}

// Por qué enmascarado: en eventos y respuestas se muestra sin exponer el
// número completo (AU12.3, sin datos sensibles en logs).
export function enmascararNumero(e164: string): string {
  const d = e164.replace(/\D/g, "");
  if (d.length < 4) return "…";
  return `+…${d.slice(-4)}`;
}

// P1-1 Alertas WA de seguridad. Núcleo puro: sin IO.
// Eventos que avisan: login desde dispositivo nuevo, cierre remoto,
// reauth fallida reiterada, vínculo ok/fallido y desvinculación.
// La decisión no envía nada: el job adaptador resuelve el destino
// (titular + Dueño vinculados y habilitados) y usa el sender inyectado.
export const EVENTOS_ALERTA_SEGURIDAD = [
  "login_nuevo",
  "sesion_cerrada_remota",
  "reauth_fallida",
  "vinculo_ok",
  "vinculo_fallido",
  "bot_desvinculado",
] as const;
export type EventoAlertaSeguridad = (typeof EVENTOS_ALERTA_SEGURIDAD)[number];

export function esEventoAlertaSeguridad(tipo: string): tipo is EventoAlertaSeguridad {
  return (EVENTOS_ALERTA_SEGURIDAD as readonly string[]).includes(tipo);
}

export function decidirAlertaSeguridad(input: {
  evento: EventoAlertaSeguridad;
  rolDestino: "dueno" | "empleado";
  vinculado: boolean;
  puedeUsarBot?: boolean | undefined;
}): { enviar: boolean; motivo: "ok" | "no_vinculado" | "no_habilitado" } {
  if (!input.vinculado) return { enviar: false, motivo: "no_vinculado" };
  if (!puedeUsarBot({ rol: input.rolDestino, puedeUsarBot: input.puedeUsarBot })) {
    return { enviar: false, motivo: "no_habilitado" };
  }
  if (!puedeRecibirAviso({ rol: input.rolDestino, tipo: "alerta_seguridad" })) {
    return { enviar: false, motivo: "no_habilitado" };
  }
  return { enviar: true, motivo: "ok" };
}

export function claveAlertaSeguridad(eventId: string): string {
  return `alerta_seg:${eventId}`;
}

export function armarTextoAlertaSeguridad(input: {
  evento: EventoAlertaSeguridad;
  comercio: string;
  detalle?: string | undefined;
}): string {
  const donde = input.comercio.trim().slice(0, 40) || "tu comercio";
  switch (input.evento) {
    case "login_nuevo":
      return `Che, hubo un ingreso nuevo en ${donde}${input.detalle ? ` (${input.detalle})` : ""}. Si no fuiste vos, revisá Usuarios → Sesiones.`;
    case "sesion_cerrada_remota":
      return `Cerramos una sesión en ${donde}${input.detalle ? ` (${input.detalle})` : ""}.`;
    case "reauth_fallida":
      return `Falló una confirmación de identidad en ${donde}. Si no fuiste vos, cambiá tu clave de Google y revisá sesiones.`;
    case "vinculo_ok":
      return `Vinculaste tu WhatsApp en ${donde}. Si no fuiste vos, desvinculalo desde la web.`;
    case "vinculo_fallido":
      return `Falló una vinculación de WhatsApp en ${donde}. Si no fuiste vos, avisale al Dueño.`;
    case "bot_desvinculado":
      return `Se desvinculó un número de WhatsApp en ${donde}.`;
  }
}
