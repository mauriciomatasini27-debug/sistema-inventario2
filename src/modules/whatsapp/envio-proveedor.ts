// Núcleo puro Track4 B8: envío de pedido al proveedor por el Bot WA.
// Sin IO, sin red, sin reloj propio (fechaIso/ahoraMs entran por parámetro).
// Dinero siempre bigint centavos. Unidades y montos con el mismo formato que
// la web (consulta.ts/servicio.ts: "14 u.", "$900").
// Límites Meta: títulos de botón a 20 caracteres (truncar_titulo) y como
// máximo 3 botones por mensaje (envio.ts).
//
// Flujo B8:
// B8.1 pantalla de confirmación obligatoria (texto final + canal +
//   destinatario, botones Enviar/Volver).
// B8.2 email con Reply-To del comercio.
// B8.3 MVP wa.me manual: el proveedor sin opt-in recibe link wa.me y el
//   pedido queda "Enviado (WhatsApp manual)" con Sí enviado/Todavía no.
// B8.5 sin email ni WA no se envía: se pide completar la ficha web.
// B8.6 registro Confirmado/Enviado con fecha/usuario/canal/origen bot.
// B8.7 pedido mínimo: se avisa antes de mandar.

import { autorizar_operacion, type ContextoBot } from "./servicio.js";
import { truncar_titulo } from "./envio.js";

export type CanalEnvio = "email" | "wa_manual" | "sin_canal";

export interface ContactoProveedor {
  readonly nombre: string;
  readonly email: string | null;
  readonly telefonoE164: string | null;
}

export interface LineaPedido {
  readonly sku: string;
  readonly nombre: string;
  /** Unidades: conteo entero, igual que la web. */
  readonly qty: number;
  readonly costoCentavos: bigint;
}

export interface Confirmacion {
  readonly textoFinal: string;
  readonly canal: CanalEnvio;
  readonly destinatario: string;
}

export interface OpcionBoton {
  readonly id: string;
  readonly titulo: string;
}

export interface PantallaBot {
  readonly texto: string;
  readonly opciones: ReadonlyArray<OpcionBoton>;
}

export type EstadoEnvio = "Confirmado" | "Enviado (Email)" | "Enviado (WhatsApp manual)";

export interface RegistroEnvio {
  readonly estado: EstadoEnvio;
  readonly fechaIso: string;
  readonly usuarioId: string;
  readonly canal: Exclude<CanalEnvio, "sin_canal">;
  readonly origen: "bot";
}

/** Ancla verificada en panel.astro (#proveedores). */
export const FICHA_PROVEEDORES_URL = "/panel#proveedores" as const;

export const MAX_BOTONES = 3 as const;
export const MAX_TITULO_BOTON = 20 as const;

// Mismo formato que la web (formatear_stock / atender_consulta).
export function formatear_monto(centavos: bigint): string {
  return `$${Number(centavos) / 100}`;
}

// Email si hay; si no, WhatsApp manual si hay teléfono; si no hay ninguno,
// sin_canal (B8.5: no se envía, se pide la ficha).
export function decidir_canal(contacto: {
  readonly email: string | null;
  readonly telefonoE164: string | null;
}): CanalEnvio {
  if (contacto.email && contacto.email.trim()) return "email";
  if (contacto.telefonoE164 && contacto.telefonoE164.trim()) return "wa_manual";
  return "sin_canal";
}

// Texto del pedido con unidades en "u." y montos idénticos a la web.
export function armar_texto_proveedor(opts: {
  readonly comercio: string;
  readonly proveedorNombre: string;
  readonly lineas: ReadonlyArray<LineaPedido>;
  readonly totalCentavos?: bigint | undefined;
}): string {
  const cuerpo = opts.lineas.map((l) => {
    const sub = BigInt(l.qty) * l.costoCentavos;
    return `• ${l.nombre} — ${l.qty} u. x ${formatear_monto(l.costoCentavos)} = ${formatear_monto(sub)}`;
  });
  const total =
    opts.totalCentavos ??
    opts.lineas.reduce((acc, l) => acc + BigInt(l.qty) * l.costoCentavos, 0n);
  return [
    `Hola ${opts.proveedorNombre}, te paso un pedido de ${opts.comercio}:`,
    ...cuerpo,
    `Total: ${formatear_monto(total)}.`,
  ].join("\n");
}

// Link manual MVP (B8.3): wa.me con dígitos pelados + texto encodeado.
export function armar_link_wame(telefonoE164: string, texto: string): string {
  const digitos = telefonoE164.replace(/\D/g, "");
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

// B8.7: si el total no llega al mínimo del proveedor se avisa antes.
export function verificar_minimo(opts: {
  readonly totalCentavos: bigint;
  readonly minimoCentavos?: bigint | null | undefined;
  readonly proveedorNombre: string;
}): { readonly ok: true } | { readonly ok: false; readonly aviso: string } {
  const minimo = opts.minimoCentavos ?? null;
  if (minimo == null || opts.totalCentavos >= minimo) return { ok: true };
  return {
    ok: false,
    aviso: `Che, el pedido (${formatear_monto(opts.totalCentavos)}) no llega al mínimo de ${opts.proveedorNombre} (${formatear_monto(minimo)}). ¿Lo mandamos igual?`,
  };
}

// B8.2: email con Reply-To del comercio. Solo arma el sobre; el adaptador
// lo manda por el proveedor de email.
export function armar_email_proveedor(opts: {
  readonly para: string;
  readonly replyToComercio: string;
  readonly comercio: string;
  readonly texto: string;
}): { readonly para: string; readonly replyTo: string; readonly asunto: string; readonly texto: string } {
  return Object.freeze({
    para: opts.para,
    replyTo: opts.replyToComercio,
    asunto: `Pedido de ${opts.comercio}`,
    texto: opts.texto,
  });
}

function a_botones(texto: string, opciones: ReadonlyArray<OpcionBoton>): PantallaBot {
  const recortadas = opciones.slice(0, MAX_BOTONES).map((o) => ({
    id: o.id,
    titulo: truncar_titulo(o.titulo, MAX_TITULO_BOTON),
  }));
  return { texto, opciones: Object.freeze(recortadas) };
}

// B8.1: confirmación obligatoria con mensaje final + canal + destinatario.
export function armar_pantalla_confirmacion(c: Confirmacion): PantallaBot {
  const canalTxt =
    c.canal === "email"
      ? `Email a ${c.destinatario}`
      : c.canal === "wa_manual"
        ? `WhatsApp manual a ${c.destinatario}`
        : "Sin canal (falta email o WhatsApp)";
  return a_botones(`${c.textoFinal}\n\nCanal: ${canalTxt}\n¿Lo mandamos?`, [
    { id: "enviar", titulo: "Enviar" },
    { id: "volver", titulo: "Volver" },
  ]);
}

// B8.3: después del link manual se pregunta si ya lo mandó.
export function armar_seguimiento_manual(linkWame: string): PantallaBot {
  return a_botones(
    `Te dejé el pedido listo para mandar por WhatsApp:\n${linkWame}\nCuando lo mandes desde tu celu, avisame.`,
    [
      { id: "si_enviado", titulo: "Sí, lo envié" },
      { id: "todavia_no", titulo: "Todavía no" },
    ],
  );
}

// B8.5: sin email ni WA no se envía; se pide completar la ficha web.
export function armar_falta_canal(destinatario: string): { readonly texto: string; readonly fichaUrl: string } {
  return {
    texto: `No tengo email ni WhatsApp de ${destinatario}. Completalo en la ficha y probamos de nuevo.`,
    fichaUrl: FICHA_PROVEEDORES_URL,
  };
}

// Empleado sin permiso: se ofrece avisarle al dueño.
export function avisar_dueno(opts: {
  readonly empleadoNombre: string;
  readonly comercio: string;
  readonly resumenPedido: string;
}): PantallaBot {
  return a_botones(
    `Che ${opts.empleadoNombre}, mandar pedidos lo hace el dueño de ${opts.comercio}. Tu pedido quedó así:\n${opts.resumenPedido}\n¿Le aviso al dueño?`,
    [
      { id: "avisar_dueno", titulo: "Avisarle al dueño" },
      { id: "volver", titulo: "Volver" },
    ],
  );
}

export type ResultadoConfirmacion =
  | { readonly ok: true; readonly registro: RegistroEnvio }
  | {
      readonly ok: false;
      readonly motivo: "falta_confirmacion" | "sin_permiso" | "solo_lectura" | "no_resuelto" | "sin_canal";
      readonly detalle: string;
      readonly fichaUrl?: string | undefined;
    };

// Gate puro B8: permiso (dueño, B1.7) + no solo-lectura (suspendido) +
// canal disponible (B8.5) + confirmación explícita (B8.1). Sin el Enviar
// explícito no sale nada.
export function confirmar_envio(opts: {
  readonly ctx: ContextoBot | null;
  readonly confirmacionExplicita: boolean;
  readonly confirmacion: Confirmacion;
  readonly usuarioId: string;
  readonly fechaIso: string;
  readonly ahoraMs?: number | undefined;
}): ResultadoConfirmacion {
  const auth = autorizar_operacion(opts.ctx, "pedir", [], opts.ahoraMs ?? 0);
  if (!auth.ok) {
    if (auth.motivo === "sin_permiso") {
      return { ok: false, motivo: "sin_permiso", detalle: "Solo el dueño puede mandar pedidos. Ofrecé avisarle al dueño." };
    }
    if (auth.motivo === "solo_lectura") {
      return { ok: false, motivo: "solo_lectura", detalle: "El comercio está suspendido: no se puede mandar nada por ahora." };
    }
    return { ok: false, motivo: "no_resuelto", detalle: "No te tengo vinculado. Vinculá tu número primero." };
  }
  if (opts.confirmacion.canal === "sin_canal") {
    const falta = armar_falta_canal(opts.confirmacion.destinatario);
    return { ok: false, motivo: "sin_canal", detalle: falta.texto, fichaUrl: falta.fichaUrl };
  }
  if (!opts.confirmacionExplicita || !opts.confirmacion.textoFinal.trim()) {
    return { ok: false, motivo: "falta_confirmacion", detalle: "Mostrá la confirmación primero: sin el Enviar explícito no sale nada." };
  }
  return {
    ok: true,
    registro: Object.freeze({
      estado: "Confirmado" as const,
      fechaIso: opts.fechaIso,
      usuarioId: opts.usuarioId,
      canal: opts.confirmacion.canal,
      origen: "bot" as const,
    }),
  };
}

// B8.6: el adaptador marca Enviado cuando el email salió o cuando se mostró
// el link wa.me (queda "Enviado (WhatsApp manual)" hasta el Sí enviado).
export function marcar_enviado(registro: RegistroEnvio): RegistroEnvio {
  const estado: EstadoEnvio = registro.canal === "email" ? "Enviado (Email)" : "Enviado (WhatsApp manual)";
  return Object.freeze({ ...registro, estado });
}
