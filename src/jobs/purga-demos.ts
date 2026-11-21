import { control } from "../lib/store.js";
import { persistirPurgaDemo, revocarMembershipsDb } from "../lib/control-db.js";
import { persistirEventoVidaAdmin } from "../lib/admin-db.js";
import { elegir_demos_a_purgar } from "../modules/tenants/purga-demos.js";

export function ejecutarPurgaDemos(ahora = new Date()): { purgados: string[] } {
  const ids = elegir_demos_a_purgar(
    [...control.tenants.values()].map((t) => ({ id: t.id, esDemo: t.esDemo, estado: t.estado, trialHasta: t.trialHasta ?? null })),
    ahora,
  );
  for (const id of ids) {
    const tenant = control.tenants.get(id);
    const deEstado = tenant?.estado ?? "activo";
    if (tenant) tenant.estado = "baja";
    for (const m of control.memberships.values()) {
      if (m.tenantId === id && m.estado === "activo") {
        m.estado = "revocado";
        m.revocadoAt = ahora.toISOString();
        m.revocadoPor = "sistema:purga-demos";
      }
    }
    for (const l of control.botLinks.values()) {
      if (l.tenantId === id) l.estado = "revocado";
    }
    control.events.push({ tenantId: id, tipo: "demo_purgada", actor: "sistema:purga-demos" });
    control.opsOutbox.push({ tipo: "demo_purgada", payload: { tenant_id: id, occurred_at: ahora.toISOString() } });
    void persistirPurgaDemo(id);
    void revocarMembershipsDb(id, "sistema:purga-demos");
    // P10-90: el evento de vida 'baja' fecha el cierre; la retención de 90
    // días (src/jobs/retencion-clientes.ts) cuenta desde acá.
    void persistirEventoVidaAdmin({
      tenantId: id,
      deEstado,
      aEstado: "baja",
      motivo: "demo_purgada",
      actor: "sistema:purga-demos",
      idempotencyKey: `purga-demos:${id}`,
    });
  }
  return { purgados: ids };
}
