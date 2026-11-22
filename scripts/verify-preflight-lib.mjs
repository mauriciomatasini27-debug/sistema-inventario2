import { planPendientes } from "./db-migrate-lib.mjs";

const LINEA_FALLO_ARCH = /^\s*[+-]?\s*"?([^\s"]+\.ts)\s*->\s*(\/api[^\s",]*)/;

export function estadoMigraciones(aplicadas, journalEntries) {
  const plan = planPendientes({ journalEntries, appliedCount: aplicadas });
  const base = { aplicadas, journal: journalEntries.length };
  if (!plan.ok) {
    return { ...base, ok: false, motivo: "desalineada", detalle: plan.error };
  }
  if (plan.pendientes.length > 0) {
    return { ...base, ok: false, motivo: "pendiente", detalle: `${plan.pendientes.length} migraciones pendientes` };
  }
  return { ...base, ok: true, motivo: "alineada", detalle: "" };
}

export function clasificarArch(salida, archivosCambiados) {
  const cambiados = new Set(archivosCambiados.map((a) => a.replace(/\\/g, "/")));
  const fallos = [];
  for (const linea of salida.split(/\r?\n/)) {
    const coincide = LINEA_FALLO_ARCH.exec(linea);
    if (!coincide) continue;
    fallos.push({
      archivo: coincide[1],
      ruta: coincide[2],
      origen: cambiados.has(coincide[1]) ? "mio" : "preexistente",
    });
  }
  return fallos;
}
