// Segundo canal P1-2: fallback WA → email para alertas de seguridad.
// Núcleo puro: sin IO. WA es primario; email solo si WA no pudo
// (sin vínculo, deshabilitado, fallo de canal) y hay email verificado.
// Claves idempotentes independientes por canal, como el job de viernes.

import type { EventoAlertaSeguridad } from "./bot.js";

export type CanalAlerta = "wa" | "email" | "ninguno";

export function elegirCanal(input: {
  vinculadoWA: boolean;
  waHabilitado: boolean;
  emailVerificado: boolean;
}): CanalAlerta {
  if (input.vinculadoWA && input.waHabilitado) return "wa";
  if (input.emailVerificado) return "email";
  return "ninguno";
}

// Si el intento WA terminó en estos estados, corresponde probar email.
export function debeProbarEmail(estadoWA: string): boolean {
  return (
    estadoWA === "omitido_no_vinculado" ||
    estadoWA === "omitido_no_habilitado" ||
    estadoWA === "fallo"
  );
}

export function claveAlertaEmail(eventId: string): string {
  return `alerta_seg:${eventId}:email`;
}

export function armarEmailSeguridad(input: {
  evento: EventoAlertaSeguridad;
  comercio: string;
  detalle?: string | undefined;
}): { asunto: string; texto: string } {
  const donde = input.comercio.trim().slice(0, 40) || "tu comercio";
  const base = input.detalle ? ` Detalle: ${input.detalle.slice(0, 120)}.` : "";
  switch (input.evento) {
    case "login_nuevo":
      return {
        asunto: `Ingreso nuevo en ${donde}`,
        texto: `Hubo un ingreso nuevo en ${donde}.${base} Si no fuiste vos, revisá Usuarios → Sesiones.`,
      };
    case "sesion_cerrada_remota":
      return {
        asunto: `Sesión cerrada en ${donde}`,
        texto: `Cerramos una sesión en ${donde}.${base}`,
      };
    case "reauth_fallida":
      return {
        asunto: `Falló una confirmación en ${donde}`,
        texto: `Falló una confirmación de identidad en ${donde}. Si no fuiste vos, revisá tu cuenta de Google y tus sesiones.`,
      };
    case "vinculo_ok":
      return {
        asunto: `WhatsApp vinculado en ${donde}`,
        texto: `Vinculaste tu WhatsApp en ${donde}.${base} Si no fuiste vos, desvinculalo desde la web.`,
      };
    case "vinculo_fallido":
      return {
        asunto: `Falló una vinculación en ${donde}`,
        texto: `Falló una vinculación de WhatsApp en ${donde}. Si no fuiste vos, avisale al Dueño.`,
      };
    case "bot_desvinculado":
      return {
        asunto: `WhatsApp desvinculado en ${donde}`,
        texto: `Se desvinculó un número de WhatsApp en ${donde}.${base}`,
      };
  }
}
