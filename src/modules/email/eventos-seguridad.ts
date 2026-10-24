// Núcleo puro NE7: seguridad y cuenta (obligatorios). Sin IO.
// Sin List-Unsubscribe, sin links de acción (NE7.4/NE7.6).

import { formatear_pesos } from "./plantilla-cierre.js";
import { documento_papel, pie_seguridad } from "./papel.js";
import type { TipoEmail } from "./catalogo.js";

export interface EventoEmail {
  readonly tipo: TipoEmail;
  readonly dedupeKey: string;
  readonly idempotencyKey: string;
  readonly asunto: string;
  readonly html: string;
  readonly texto: string;
}

function base(asunto: string, html: string): string {
  return documento_papel(asunto, `${html}${pie_seguridad()}`);
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// NE7.1: dispositivo nuevo. Ignora silencio y pausa (lo decide el gate de A).
export function describir_dispositivo_nuevo(args: {
  comercio: string;
  navegador: string;
  so: string;
  lugar: string;
  fecha: string;
}): EventoEmail {
  const dedupeKey = `dispositivo_nuevo:${args.navegador}:${args.fecha}`;
  const txt = `Se inició sesión en ${args.comercio} con tu cuenta desde ${args.navegador} en ${args.so}, ${args.lugar}, el ${args.fecha}. Si no fuiste vos, cerrá esa sesión desde Mi cuenta.`;
  const asunto = `Nuevo inicio de sesión en ${args.comercio}`;
  return {
    tipo: "seguridad",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto,
    html: base(asunto, `<p>${escapar(txt)}</p><a href="{{dispositivos_url}}">Ver dispositivos</a>`),
    texto: `${txt}\n[Ver dispositivos]`,
  };
}

// NE7.2: otros eventos de seguridad (revocación, cambio de email).
export function describir_evento_seguridad(args: { kind: "sesion_revocada" | "email_cambiado" | "acceso_revocado"; detalle: string; fecha: string }): EventoEmail {
  const dedupeKey = `seguridad:${args.kind}:${args.fecha}`;
  const asunto = `Aviso de seguridad: ${args.kind}`;
  return {
    tipo: "seguridad",
    dedupeKey,
    idempotencyKey: `${dedupeKey}:email`,
    asunto,
    html: base(asunto, `<p>${escapar(args.detalle)}</p><a href="{{dispositivos_url}}">Ver dispositivos</a>`),
    texto: `${args.detalle}\n[Ver dispositivos]`,
  };
}

// NE7.3: cuenta y suscripción. Respetan silencio salvo paso a solo lectura
// (el orquestador fuerza ese envío por fuera del gate).
export function describir_cuenta(args:
  | { kind: "pago_rechazado"; limiteSoloLectura: string }
  | { kind: "paso_solo_lectura" }
  | { kind: "cupo"; porcentaje: 80 | 100; usado: number; cupo: number; tenantId?: string; mes?: string }
  | { kind: "fin_prueba"; fecha: string }
): EventoEmail {
  if (args.kind === "pago_rechazado") {
    const asunto = `Pago rechazado: regularizá antes del ${args.limiteSoloLectura}`;
    return {
      tipo: "cuenta",
      dedupeKey: `cuenta:pago_rechazado:${args.limiteSoloLectura}`,
      idempotencyKey: `cuenta:pago_rechazado:${args.limiteSoloLectura}:email`,
      asunto,
      html: base(
        asunto,
        `<p>Se rechazó el cobro. El comercio pasaría a solo lectura el ${escapar(args.limiteSoloLectura)}.</p>` +
          `<a href="{{pagos_url}}">Actualizar medio de pago</a>`,
      ),
      texto: `Se rechazó el cobro. El comercio pasaría a solo lectura el ${args.limiteSoloLectura}.\n[Actualizar medio de pago]`,
    };
  }
  if (args.kind === "cupo") {
    const asunto = `Consumo del bot al ${args.porcentaje}% (${args.usado}/${args.cupo})`;
    const dedupeKey =
      args.tenantId !== undefined && args.mes !== undefined
        ? `cuenta:cupo:${args.tenantId}:${args.mes}:${args.porcentaje}`
        : `cuenta:cupo:${args.porcentaje}`;
    return {
      tipo: "cuenta",
      dedupeKey,
      idempotencyKey: `${dedupeKey}:email`,
      asunto,
      html: base(asunto, `<p>Consumiste ${args.usado} de ${args.cupo} mensajes del bot.</p><a href="{{plan_url}}">Sumar un paquete</a>`),
      texto: `Consumiste ${args.usado} de ${args.cupo} mensajes del bot.\n[Sumar un paquete]`,
    };
  }
  if (args.kind === "fin_prueba") {
    const asunto = `Tu prueba gratis termina el ${args.fecha}`;
    return {
      tipo: "cuenta",
      dedupeKey: `cuenta:fin_prueba:${args.fecha}`,
      idempotencyKey: `cuenta:fin_prueba:${args.fecha}:email`,
      asunto,
      html: base(asunto, `<p>Tu prueba gratis termina el ${escapar(args.fecha)}.</p><a href="{{plan_url}}">Elegir plan</a>`),
      texto: `Tu prueba gratis termina el ${args.fecha}.\n[Elegir plan]`,
    };
  }
  const asunto = `El comercio pasó a solo lectura`;
  return {
    tipo: "cuenta",
    dedupeKey: `cuenta:solo_lectura`,
    idempotencyKey: `cuenta:solo_lectura:email`,
    asunto,
    html: base(asunto, `<p>El comercio pasó a solo lectura por falta de pago.</p><a href="{{pagos_url}}">Regularizar</a>`),
    texto: `El comercio pasó a solo lectura por falta de pago.\n[Regularizar]`,
  };
}

export function ejemplo_monto(n: bigint): string {
  return formatear_pesos(n);
}
