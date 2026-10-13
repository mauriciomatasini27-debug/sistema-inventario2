import { adminStore, ultimoHashAdmin } from "../lib/admin-store.js";
import { persistirActoAdmin } from "../lib/admin-db.js";
import { registrar_acto, verificar_acto } from "../modules/admin/actos.js";

// Job verificación nocturna PA2. Recorre admin_audit_log en orden, recalcula
// cada hash y verifica el encadenado. No auto-repara: si rompe, setea
// auditoriaSana=false (el panel congela POST mutantes y muestra banner) y
// deja acto verificacion_hash con la primera fila rota.
export function ejecutarVerificacionHash(ahora = new Date()): {
  ok: boolean;
  filas: number;
  primeraRota: string | null;
} {
  let primeraRota: string | null = null;
  let prev: string | null = null;
  for (const a of adminStore.actos) {
    if (a.prevHash !== prev) {
      primeraRota = a.hash;
      break;
    }
    const v = verificar_acto({
      acto: a.detalle as Parameters<typeof verificar_acto>[0]["acto"],
      actorGoogleSub: a.actorGoogleSub,
      prevHash: a.prevHash,
      hash: a.hash,
      creadoEn: a.creadoEn,
      origen: a.origen as "panel",
    });
    if (!v.ok) {
      primeraRota = a.hash;
      break;
    }
    prev = a.hash;
  }
  const ok = primeraRota === null;
  adminStore.auditoriaSana = ok;
  const registrado = registrar_acto({
    acto: {
      kind: "verificacion_hash",
      ok,
      filas: adminStore.actos.length,
      ...(primeraRota ? { primeraRota } : {}),
    },
    actorGoogleSub: "sistema:verificar-hash",
    prevHash: ultimoHashAdmin(),
    origen: "job:verificar-hash",
    ahora,
  });
  adminStore.actos.push({
    id: registrado.hash,
    actorGoogleSub: registrado.actorGoogleSub,
    actoKind: registrado.acto.kind,
    tenantId: null,
    detalle: registrado.acto,
    prevHash: registrado.prevHash,
    hash: registrado.hash,
    origen: registrado.origen,
    creadoEn: registrado.creadoEn,
  });
  void persistirActoAdmin({
    actorGoogleSub: registrado.actorGoogleSub,
    actoKind: registrado.acto.kind,
    tenantId: null,
    detalle: registrado.acto,
    prevHash: registrado.prevHash,
    hash: registrado.hash,
    origen: registrado.origen,
  });
  return { ok, filas: adminStore.actos.length, primeraRota };
}
