// Núcleo puro Track1 Bot WA B5: aviso matutino por WhatsApp.
// Sin IO, sin Drizzle, sin fetch, sin env. Reutiliza el criterio de
// email/stock-matutino.ts (calcular_matutino): no duplica la regla de
// novedad/urgencia, solo agrega el filtro B4.1 (umbral 0 nunca alerta) y la
// forma del mensaje de WhatsApp.
//
// B5.1 el job sale por comercio solo si hay novedad (enviar === true).
// B5.2 plantilla de utilidad con botones Ver y pedir / Guardar p/ viernes /
// Pausar (máx 3x20 chars — límite Meta).
// B5.6 WA y email son independientes: cada canal tiene su propia clave de
// idempotencia y un fallo en WA nunca bloquea el email.

import { calcular_matutino, type AlertaStock, type ItemStock } from "../email/stock-matutino.js";
import { puede_enviar_whatsapp, type Preferencias } from "./optin.js";

export type { AlertaStock, ItemStock };

// Nombre de la plantilla de utilidad aprobada en Meta.
export const PLANTILLA_MATUTINO_WA = "aviso_matutino_stock_bajo" as const;

export interface VariablesMatutino {
  readonly comercio: string;
  readonly cantidad: number;
  readonly urgentes: number;
  readonly fecha: string;
}

export interface DecisionMatutino {
  readonly enviar: boolean;
  readonly alertas: AlertaStock[];
  readonly sinStock: number;
}

// Reutiliza el criterio del email: entra en alerta lo nuevo desde el aviso
// anterior o lo urgente (stock 0, crítico o debajo de la mitad del umbral),
// con stock vivo al envío. Solo filtra antes los items sin umbral (B4.1).
export function decidir_envio_matutino(
  catalogo: ReadonlyArray<ItemStock>,
  enAlertaPrevia: ReadonlySet<string>,
): DecisionMatutino {
  const conUmbral = catalogo.filter((it) => it.umbral > 0);
  const r = calcular_matutino(conUmbral, enAlertaPrevia);
  return { enviar: r.enviar, alertas: r.alertas, sinStock: r.sinStock };
}

// Arma las variables de la plantilla desde las alertas decididas.
export function armar_variables_matutino(args: {
  readonly comercio: string;
  readonly fecha: string;
  readonly alertas: ReadonlyArray<AlertaStock>;
}): VariablesMatutino {
  const urgentes = args.alertas.filter((a) => a.urgente).length;
  return Object.freeze({
    comercio: args.comercio,
    cantidad: args.alertas.length,
    urgentes,
    fecha: args.fecha,
  });
}

// Cuerpo de la plantilla de utilidad, rioplatense y sin tecnicismos.
export function armar_cuerpo_matutino(v: VariablesMatutino): string {
  if (v.cantidad <= 0) return `Buen día, ${v.comercio}: tenés todo bajo control, no te falta nada.`;
  const cabeza =
    v.cantidad === 1
      ? `Buen día, ${v.comercio}: hay 1 producto con poco stock`
      : `Buen día, ${v.comercio}: hay ${v.cantidad} productos con poco stock`;
  const cola = v.urgentes > 0 ? ` (${v.urgentes} urgentes, pedilos ya)` : "";
  return `${cabeza}${cola} (${v.fecha}). Te los detallo acá abajo para que armes el pedido.`;
}

export interface BotonMatutino {
  readonly id: string;
  readonly titulo: string;
}

// B5.2: botones de la plantilla (máx 3, máx 20 chars cada uno).
export function botones_matutino(): ReadonlyArray<BotonMatutino> {
  return Object.freeze([
    Object.freeze({ id: "ver_pedir", titulo: "Ver y pedir" }),
    Object.freeze({ id: "guardar_viernes", titulo: "Guardar p/ viernes" }),
    Object.freeze({ id: "pausar", titulo: "Pausar" }),
  ]);
}

// B5.6: clave de idempotencia propia del canal WhatsApp (notif + canal +
// fecha + comercio). Distinta de la del email (`stock_matutino:{tenant}:{fecha}`)
// para que cada canal se registre y reintente por su cuenta.
export function clave_aviso_wa(tenantId: string, fecha: string): string {
  return `notif:whatsapp:aviso_matutino:${tenantId}:${fecha}`;
}

// Decide si el aviso de WA puede salir: respeta opt-in/pausa (optin.ts) y
// solo sale si el cálculo vivo trae novedad (B5.1).
export function debe_enviar_matutino_wa(args: {
  readonly prefs: Preferencias;
  readonly ahoraMs: number;
  readonly decision: DecisionMatutino;
}): boolean {
  if (!args.decision.enviar) return false;
  return puede_enviar_whatsapp(args.prefs, args.ahoraMs);
}
