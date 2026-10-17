// DASH-S1: lógica de cliente de /panel/bot/config. Sin DOM: solo formatea
// estado y tiempos para que la pantalla los pinte con textContent.
import type { PersonaVinculos, TelefonoVinculo } from "../modules/whatsapp/vinculos-panel.js";
import { fechaAR } from "./fecha-ar.js";

export function formatearCuentaRegresiva(msRestantes: number): string {
  const totalSegundos = Math.max(0, Math.ceil(msRestantes / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

export function codigoVencido(expiraEnMs: number, ahoraMs: number): boolean {
  return ahoraMs >= expiraEnMs;
}

export function hayVinculados(personas: ReadonlyArray<PersonaVinculos>): boolean {
  return personas.some((p) => p.telefonos.length > 0);
}

// Vinculados o pausados: sube cuando el webhook confirma un VINCULAR.
export function contarVinculados(personas: ReadonlyArray<PersonaVinculos>): number {
  return personas.reduce((n, p) => n + p.telefonos.filter((t) => t.estado !== "pendiente").length, 0);
}

function fechaCortaAR(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const [anio, mes, dia] = fechaAR(ms).split("-");
  return `${dia ?? ""}/${mes ?? ""}/${anio ?? ""}`;
}

export function etiquetaEstado(t: TelefonoVinculo): string {
  if (t.estado === "vinculado") return "Vinculado";
  if (t.estado === "pendiente") return "Pendiente de confirmar";
  return t.pausado_hasta ? `Pausado hasta ${fechaCortaAR(t.pausado_hasta)}` : "Pausado";
}

export function textoOptIn(optIn: boolean): string {
  return optIn ? "Recibe avisos" : "Sin avisos: se activan escribiendo ALTA al bot";
}
