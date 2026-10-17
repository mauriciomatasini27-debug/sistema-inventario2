import type { UltimoEnvioCloud } from "../modules/whatsapp/tarjeta-bot.js";

// DASH-S3 (ADR-0034): salud de envío por Cloud API en memoria del proceso.
// El estado depende del último envío que mandó esta instancia; con varias
// instancias cada una ve lo suyo. No se persiste: es un termómetro, no
// auditoría.
let ultimo: UltimoEnvioCloud | null = null;

export function registrarEnvioCloud(ok: boolean, ahoraMs: number): void {
  ultimo = { ok, enMs: ahoraMs };
}

export function ultimoEnvioCloud(): UltimoEnvioCloud | null {
  return ultimo;
}
