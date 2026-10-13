// Auditoría de accesos P0 (AU12). Núcleo puro: sin IO.
// auth_events es append-only (REVOKE + trigger en migración, igual que
// stock_movements): acá solo se decide qué se registra, cómo se muestra y
// qué nunca puede viajar en un evento (AU12.3).

// Lista cerrada de tipos: un tipo nuevo fuera de esta lista falla el build
// donde se use el helper (misma técnica que AU4 con los permisos).
export const TIPOS_EVENTO_AUTH = [
  "login",
  "login_fallido",
  "logout",
  "cambio_usuario",
  "alta_comercio",
  "invitacion_creada",
  "invitacion_reenviada",
  "invitacion_cancelada",
  "invitacion_aceptada",
  "invitacion_rechazada",
  "membership_otorgada",
  "cambio_permisos",
  "revocacion",
  "sesion_cerrada",
  "sesion_cerrada_remota",
  "reauth_ok",
  "reauth_fallida",
  "vinculo_codigo_generado",
  "vinculo_ok",
  "vinculo_fallido",
  "bot_desvinculado",
  "bot_habilitado",
  "bot_deshabilitado",
  "email_cambiado",
  "dispositivo_nombrado",
  "pin_definido",
  "mostrador_bloqueado",
  "mostrador_desbloqueado",
  "pin_fallido",
  "acceso_denegado",
  "exportacion_actividad",
] as const;
export type TipoEventoAuth = (typeof TIPOS_EVENTO_AUTH)[number];

// AU12.2: estos interesan al comercio y el Dueño los ve en
// "Usuarios → Actividad" sin acceso a la base de control. En monoproceso se
// leen filtrados por tenant; en producción se replican al audit_log del
// comercio (misma fila, otra base).
const DE_COMERCIO: ReadonlySet<string> = new Set([
  "invitacion_creada",
  "invitacion_reenviada",
  "invitacion_cancelada",
  "invitacion_aceptada",
  "invitacion_rechazada",
  "membership_otorgada",
  "cambio_permisos",
  "revocacion",
  "sesion_cerrada_remota",
  "vinculo_ok",
  "bot_desvinculado",
  "bot_habilitado",
  "bot_deshabilitado",
  "dispositivo_nombrado",
  "pin_definido",
  "mostrador_bloqueado",
  "mostrador_desbloqueado",
]);

export function esEventoDeComercio(tipo: string): boolean {
  return DE_COMERCIO.has(tipo);
}

// AU13.1: la barra superior muestra siempre quién está logueado.
export function etiquetaAtendiendo(nombre: string): string {
  const n = nombre.trim().slice(0, 40) || "…";
  return `Atendiendo: ${n}`;
}

// AU13.2: se desaconseja compartir una cuenta de Google entre varias
// personas (rompe la trazabilidad: no se sabe quién vendió qué) y tampoco
// vale como solución para un empleado sin cuenta propia (AU6.10). La app
// shell muestra este texto junto a "Cambiar de usuario".
export const TEXTO_AYUDA_CUENTAS =
  "Cada persona entra con su propia cuenta de Google. Compartir una cuenta impide saber quién vendió qué. Quien no tenga una, la crea gratis." as const;
export function enmascararEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "…";
  const usuario = email.slice(0, at);
  const dominio = email.slice(at + 1);
  const visible = usuario.slice(0, 1);
  return `${visible}…@${dominio}`;
}

// AU12.3: ni tokens, ni IDs de sesión, ni códigos viajan en eventos.
// Los hashes (token_hash, codigo_hash) sí: son opacos y sirven para operar.
const CLAVE_PROHIBIDA = /^(token|codigo|id_plano|idplano|session_?id|password|secret|code_?verifier|nonce)$/i;

export function sanitizarDetalle(detalle: unknown): unknown {
  if (Array.isArray(detalle)) return detalle.map(sanitizarDetalle);
  if (detalle !== null && typeof detalle === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(detalle as Record<string, unknown>)) {
      if (CLAVE_PROHIBIDA.test(k)) continue;
      out[k] = sanitizarDetalle(v);
    }
    return out;
  }
  if (typeof detalle === "string") {
    // Enmascara emails sueltos dentro de textos.
    return detalle.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, (m) => enmascararEmail(m));
  }
  return detalle;
}

function fechaCorta(iso: string | undefined): string {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sin fecha";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} ${hh}:${mm}`;
}

// Texto legible para "Usuarios → Actividad". `actorNombre` lo resuelve el
// adaptador (nombre del usuario o "Vos" si es el propio Dueño); para acciones
// sobre otro miembro (cierre remoto, revocación, flag del bot) se usa
// `objetivoNombre` con el nombre del afectado.
export function formatearEvento(input: {
  tipo: string;
  actorNombre: string;
  objetivoNombre?: string | undefined;
  fechaISO?: string | undefined;
  detalle?: Record<string, unknown> | undefined;
}): string {
  const cuando = fechaCorta(input.fechaISO);
  const a = input.actorNombre;
  const o = input.objetivoNombre ?? a;
  switch (input.tipo) {
    case "invitacion_aceptada":
      return `${a} aceptó la invitación (${cuando})`;
    case "invitacion_creada":
      return `Invitaste a ${enmascararEmail(String(input.detalle?.email ?? "…"))} (${cuando})`;
    case "invitacion_reenviada":
      return `Reenviaste la invitación (${cuando})`;
    case "invitacion_cancelada":
      return `Cancelaste una invitación (${cuando})`;
    case "invitacion_rechazada":
      return `Rechazaron una invitación por email distinto (${cuando})`;
    case "membership_otorgada":
      return `Diste acceso a un miembro (${cuando})`;
    case "cambio_permisos":
      return `Cambiaste permisos (${cuando})`;
    case "revocacion":
      return `Revocaste el acceso de ${o} (${cuando})`;
    case "sesion_cerrada":
      return `Se cerró una sesión (${cuando})`;
    case "sesion_cerrada_remota":
      return `Cerraste la sesión de ${o} (${cuando})`;
    case "reauth_ok":
      return `Confirmaste tu identidad con Google (${cuando})`;
    case "reauth_fallida":
      return `Falló una confirmación de identidad (${cuando})`;
    case "login":
      return `${a} inició sesión (${cuando})`;
    case "login_fallido":
      return `Falló un inicio de sesión (${cuando})`;
    case "logout":
      return `${a} cerró sesión (${cuando})`;
    case "cambio_usuario":
      return `${a} cambió de usuario (${cuando})`;
    case "vinculo_ok":
      return `Vinculaste tu WhatsApp (${cuando})`;
    case "vinculo_fallido":
      return `Falló una vinculación de WhatsApp (${cuando})`;
    case "bot_desvinculado":
      return `Desvinculaste un número de WhatsApp (${cuando})`;
    case "bot_habilitado":
      return `Habilitaste el bot a ${o} (${cuando})`;
    case "bot_deshabilitado":
      return `Deshabilitaste el bot a ${o} (${cuando})`;
    case "email_cambiado":
      return `${a} cambió su email de Google (${cuando})`;
    case "dispositivo_nombrado":
      return `Nombraste un dispositivo del local (${cuando})`;
    case "pin_definido":
      return `Definiste el PIN del mostrador (${cuando})`;
    case "mostrador_bloqueado":
      return `Bloqueaste el mostrador (${cuando})`;
    case "mostrador_desbloqueado":
      return `Desbloqueaste el mostrador (${cuando})`;
    case "pin_fallido":
      return `Falló un intento de PIN (${cuando})`;
    case "alta_comercio":
      return `Creaste tu comercio (${cuando})`;
    case "acceso_denegado":
      return `Se denegó un acceso (${cuando})`;
    case "exportacion_actividad":
      return `Exportaste la actividad (${cuando})`;
    case "vinculo_codigo_generado":
      return `Generaste un código de vinculación (${cuando})`;
    default:
      return `${input.tipo} (${cuando})`;
  }
}
