import { control } from "../../lib/store.js";
import { persistirEstadoTenant } from "../../lib/control-db.js";
import {
  encolarAprovisionamiento,
  ejecutarAprovisionamiento,
  registrarFalloJob,
} from "../../jobs/aprovisionar.js";
import type { PasoAprovisionamiento } from "./aprovisionar.js";

export type EstadoProvisionVista = "aprovisionando" | "listo" | "error";

export interface ResumenProvision {
  readonly estado: EstadoProvisionVista;
  readonly paso: string | null;
  readonly error: string | null;
  readonly con_job: boolean;
}

export function jobDeTenant(tenantId: string) {
  let elegido: { id: string; tenantId: string; estado: string; pasoActual?: string | null | undefined; intentos: number; error?: string | undefined } | undefined;
  for (const j of control.jobs.values()) {
    if (j.tenantId !== tenantId) continue;
    if (!elegido) {
      elegido = j;
      continue;
    }
    const prio = (e: string) => (e === "error_aprovisionamiento" ? 3 : e === "aprovisionando" || e === "pendiente" ? 2 : 1);
    if (prio(j.estado) >= prio(elegido.estado)) elegido = j;
  }
  return elegido ?? null;
}

export function resumenAprovisionamiento(tenantId: string, estadoTenant: string): ResumenProvision {
  const job = jobDeTenant(tenantId);
  const conJob = Boolean(job);
  if (estadoTenant === "error_aprovisionamiento" || job?.estado === "error_aprovisionamiento") {
    return { estado: "error", paso: job?.pasoActual ?? null, error: job?.error ?? null, con_job: conJob };
  }
  if (estadoTenant === "aprovisionando" || job?.estado === "pendiente" || job?.estado === "aprovisionando") {
    return { estado: "aprovisionando", paso: job?.pasoActual ?? null, error: null, con_job: conJob };
  }
  return { estado: "listo", paso: null, error: null, con_job: conJob };
}

export async function lanzarAprovisionamiento(jobId: string): Promise<{ estado: string; tenantId?: string }> {
  try {
    const r = await ejecutarAprovisionamiento(jobId);
    return r;
  } catch (e) {
    const job = control.jobs.get(jobId);
    const paso = (job?.pasoActual as PasoAprovisionamiento | null) ?? "crear_base";
    const next = registrarFalloJob(jobId, paso, e instanceof Error ? e.message : String(e));
    const tenant = job ? control.tenants.get(job.tenantId) : undefined;
    if (tenant && next.estado === "error_aprovisionamiento") {
      tenant.estado = "error_aprovisionamiento";
      await persistirEstadoTenant(tenant.id, "error_aprovisionamiento");
    }
    return job ? { estado: next.estado, tenantId: job.tenantId } : { estado: next.estado };
  }
}

export function encolarYLanzar(tenantId: string): string {
  const jobId = encolarAprovisionamiento(tenantId);
  const tenant = control.tenants.get(tenantId);
  if (tenant && tenant.estado !== "suspendido") tenant.estado = "aprovisionando";
  void lanzarAprovisionamiento(jobId);
  return jobId;
}

export async function reintentarAprovisionamiento(tenantId: string): Promise<{ job_id: string; estado: string }> {
  const tenant = control.tenants.get(tenantId);
  if (!tenant) throw new Error("tenant inexistente");
  const existente = jobDeTenant(tenantId);
  let jobId: string;
  if (existente && existente.estado !== "activo") {
    existente.estado = "pendiente";
    existente.intentos = 0;
    existente.error = undefined;
    existente.pasoActual = null;
    jobId = existente.id;
  } else {
    jobId = encolarAprovisionamiento(tenantId);
  }
  tenant.estado = "aprovisionando";
  void lanzarAprovisionamiento(jobId);
  return { job_id: jobId, estado: "aprovisionando" };
}

export function marcarFalloProvision(tenantId: string, error: string): void {
  const job = jobDeTenant(tenantId);
  const paso = (job?.pasoActual as PasoAprovisionamiento | null) ?? "crear_base";
  if (job) {
    job.estado = "error_aprovisionamiento";
    job.error = error;
    job.pasoActual = paso;
    job.intentos = Math.max(job.intentos, 3);
  } else {
    const id = crypto.randomUUID();
    control.jobs.set(id, {
      id,
      tenantId,
      estado: "error_aprovisionamiento",
      pasoActual: paso,
      intentos: 3,
      error,
    });
  }
  const tenant = control.tenants.get(tenantId);
  if (tenant) tenant.estado = "error_aprovisionamiento";
}
