// Bienvenida ON5 sin UX. Núcleo puro: decide el canal según la ventana
// de 24 h y el opt-in. Sin IO, sin Drizzle.
import { claveBienvenida } from "./estado.js";

export type CanalBienvenida = "libre" | "plantilla" | "nada";

export interface DecisionBienvenida {
  canal: CanalBienvenida;
  motivo?: "sin_optin" | "ya_enviada" | undefined;
}

export const BOTONES_BIENVENIDA = ["Cargar un producto", "Qué puedo hacer", "Ver el video"] as const;

// Por qué este orden: si ya se envió no se repite aunque la ventana siga
// abierta (ON5.7). Sin ventana ni opt-in no sale nada (ON5.1).
export function decidir_bienvenida(input: {
  escribioPrimero: boolean;
  ventanaAbierta: boolean;
  optIn: boolean;
  yaEnviada: boolean;
}): DecisionBienvenida {
  if (input.yaEnviada) return { canal: "nada", motivo: "ya_enviada" };
  if (input.escribioPrimero || input.ventanaAbierta) return { canal: "libre" };
  if (input.optIn) return { canal: "plantilla" };
  return { canal: "nada", motivo: "sin_optin" };
}

export function texto_bienvenida(nombre: string, comercio: string): string {
  const quien = nombre.trim() || "hola";
  return `¡Hola, ${quien}! ${comercio} ya está listo. Soy el bot: te aviso cuando algo se está acabando y te ayudo con los pedidos. Probá preguntarme: ¿qué ubicaciones tengo?`;
}

export function clave_bienvenida(tenantId: string, numero: string): string {
  return claveBienvenida(tenantId, numero);
}
