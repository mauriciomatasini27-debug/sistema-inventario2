import { planPendientes } from "./db-migrate-lib.mjs";

const LINEA_FALLO_ARCH = /^\s*[+-]?\s*"?([^\s"]+\.ts)\s*->\s*(\/api[^\s",]*)/;

export function archivosPropios(diffBase, diffWorking, untracked) {
  return [
    ...new Set(
      [diffBase, diffWorking, untracked]
        .flatMap((s) => String(s ?? "").split(/\r?\n/))
        .map((s) => s.trim().replace(/\\/g, "/"))
        .filter(Boolean),
    ),
  ];
}

export function clasificarFallosArch(salida, archivosCambiados) {
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

export function estadoArch(status, fallos) {
  if (status === 0) return { estado: "ok", sucio: false };
  if (fallos.length === 0) return { estado: "indeterminado", sucio: true };
  const mios = fallos.some((f) => f.origen === "mio");
  const ajenos = fallos.some((f) => f.origen === "preexistente");
  return { estado: mios ? "con-fallos-propios" : "preexistente", sucio: ajenos };
}

export function estadoMigraciones(aplicadas, journalEntries) {
  const plan = planPendientes({ journalEntries, appliedCount: aplicadas });
  const base = { aplicadas, journal: journalEntries.length };
  if (!plan.ok) {
    return {
      ...base,
      ok: false,
      motivo: "desalineada",
      detalle: plan.error,
      remediacion:
        "Las bases locales se comparten entre worktrees. Usá bases propias con `PGDATA_LOCAL=<dir> bash scripts/pg-local.sh start`, o alineá las filas de `drizzle.__drizzle_migrations` con `drizzle/meta/_journal.json`.",
    };
  }
  if (plan.pendientes.length > 0) {
    return {
      ...base,
      ok: false,
      motivo: "pendiente",
      detalle: `${plan.pendientes.length} migraciones pendientes`,
      remediacion: "Corré `npm run db:migrate` con `TENANT_DATABASE_URL` apuntando a la base.",
    };
  }
  return { ...base, ok: true, motivo: "alineada", detalle: "", remediacion: "" };
}
