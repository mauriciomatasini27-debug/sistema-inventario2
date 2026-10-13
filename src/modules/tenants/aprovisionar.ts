// Aprovisionamiento P0, puro sin IO (ON3/AU5). El runner con Drizzle vive en
// src/jobs/aprovisionar.ts; acá la máquina de estados + idempotencia, elegida
// antes de codificar igual que el confirmar_venta de Slice-0.
export const PASOS_APROVISIONAMIENTO = [
  "crear_base",
  "aplicar_migraciones",
  "sembrar_plantillas_rubro",
  "registrar_catalogo",
  "crear_membership_dueno",
  "marcar_activo",
] as const;
export type PasoAprovisionamiento = (typeof PASOS_APROVISIONAMIENTO)[number];

export type EstadoAprovisionamiento =
  | "pendiente"
  | "aprovisionando"
  | "activo"
  | "error_aprovisionamiento";

export const MAX_REINTENTOS = 3;
export const DIAS_PRUEBA_GRATIS = 14;

export interface SolicitudAlta {
  ownerGoogleSub: string;
  nombreComercio: string;
  plan: "demo" | "base" | "plus";
  requestKey: string;
}

export interface AltaExistente {
  tenantId: string;
  ownerGoogleSub: string;
  nombreComercio: string;
  requestKey?: string | undefined;
}

export function normalizarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLowerCase();
}

export function slugDeNombre(nombre: string): string {
  return (
    normalizarNombre(nombre)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "comercio"
  );
}

export type DecisionAlta =
  | { accion: "crear" }
  | { accion: "reusar"; tenantId: string; status: 409 };

// Idempotencia por (owner_google_sub, nombre_comercio, request_key): el doble
// envío devuelve el tenant existente con 409 sin duplicar (E1 ADR-0001).
// En el MVP hay un comercio por usuario: un segundo nombre distinto entra al
// existente en vez de crear otro (AU5.6).
export function decidirAlta(input: {
  solicitud: SolicitudAlta;
  existentes: AltaExistente[];
}): DecisionAlta {
  const nombre = normalizarNombre(input.solicitud.nombreComercio);
  for (const e of input.existentes) {
    if (e.ownerGoogleSub !== input.solicitud.ownerGoogleSub) continue;
    if (normalizarNombre(e.nombreComercio) === nombre) {
      return { accion: "reusar", tenantId: e.tenantId, status: 409 };
    }
    if (e.requestKey && e.requestKey === input.solicitud.requestKey) {
      return { accion: "reusar", tenantId: e.tenantId, status: 409 };
    }
  }
  const delDueno = input.existentes.find((e) => e.ownerGoogleSub === input.solicitud.ownerGoogleSub);
  if (delDueno) return { accion: "reusar", tenantId: delDueno.tenantId, status: 409 };
  return { accion: "crear" };
}

export interface EstadoJob {
  estado: EstadoAprovisionamiento;
  pasoActual: PasoAprovisionamiento | null;
  intentos: number;
  error?: string | undefined;
}

export function siguientePaso(paso: PasoAprovisionamiento | null): PasoAprovisionamiento | null {
  if (paso === null) return PASOS_APROVISIONAMIENTO[0];
  const i = PASOS_APROVISIONAMIENTO.indexOf(paso);
  return PASOS_APROVISIONAMIENTO[i + 1] ?? null;
}

// Por qué espera creciente y no fija: evita golpear Postgres en picos de altas
// (ON3.5) y da tiempo a que una migración rota se corrija sola con reintento.
export function esperaReintentoMs(intentos: number): number {
  return 2 ** Math.min(intentos, 6) * 1000;
}

export type EventoJob =
  | { tipo: "paso_ok"; paso: PasoAprovisionamiento }
  | { tipo: "paso_fallo"; paso: PasoAprovisionamiento; error: string };

// Reintento desde el último paso registrado hasta 3; la falla final deja
// error_aprovisionamiento. La membership de Dueño se crea en el paso
// crear_membership_dueno, nunca antes: sin base completa no hay acceso (ON3.5).
export function avanzarJob(job: EstadoJob, evento: EventoJob): EstadoJob {
  if (evento.tipo === "paso_ok") {
    const next = siguientePaso(evento.paso);
    if (next === null) return { estado: "activo", pasoActual: null, intentos: 0 };
    return { estado: "aprovisionando", pasoActual: next, intentos: 0 };
  }
  const intentos = job.intentos + 1;
  if (intentos >= MAX_REINTENTOS) {
    return {
      estado: "error_aprovisionamiento",
      pasoActual: job.pasoActual,
      intentos,
      error: evento.error,
    };
  }
  return { estado: "aprovisionando", pasoActual: job.pasoActual, intentos, error: evento.error };
}

export function trialHasta(desde: Date, dias = DIAS_PRUEBA_GRATIS): string {
  return new Date(desde.getTime() + dias * 24 * 3600 * 1000).toISOString();
}

export function nombreDatabase(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, "").slice(0, 24)}`;
}
