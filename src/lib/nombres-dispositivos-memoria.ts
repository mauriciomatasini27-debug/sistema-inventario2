import { control } from "./store.js";

// P10-34 [tenant]: espejo en memoria de devices.nombre para el modo single sin
// P10-34 [tenant]: base. Los repos no importan el store directo: el espejo es
// P10-34 [tenant]: un adaptador del plano de control; con base viva manda la tabla.

export function nombreEnMemoria(deviceCode: string): string | undefined {
  return control.deviceNames.get(deviceCode);
}

export function nombresEnMemoria(deviceCodes: readonly string[]): Map<string, string> {
  const nombres = new Map<string, string>();
  for (const code of deviceCodes) {
    const nombre = nombreEnMemoria(code);
    if (nombre) nombres.set(code, nombre);
  }
  return nombres;
}

export function fijarNombreEnMemoria(deviceCode: string, nombre: string): void {
  control.deviceNames.set(deviceCode, nombre);
}
