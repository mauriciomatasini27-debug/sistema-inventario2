// Estado compartido ON7/ON8/ON12 sin UX. Núcleo puro más claves.
// Vive en control en memoria y en Drizzle en producción. Sin IO acá.
export type TourEstado = "no_iniciado" | "en_curso" | "completado" | "saltado";

export interface OnboardingState {
  userId: string;
  tenantId: string;
  tourVersion: string;
  tourUltimoPaso: number;
  tourEstado: TourEstado;
  checklistOculta: boolean;
  pasosSaltados: string[];
  videoVisto: boolean;
  videoProgreso: number;
  pwaSugerenciaVistaAt: string | null;
  pwaSugerenciaDescartes: number;
  pwaInstalada: boolean;
  wizardPaso: number;
  wizardCompletado: boolean;
  wizardEmpleados: string[];
  // TB-165 [tenant]: espejo en memoria de todas las respuestas del cuestionario;
  // la fila durable las persiste en la columna wizard_respuestas de la 0050.
  wizardRespuestas: Record<string, string>;
  actualizadoAt: string;
}

export function claveOnboarding(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
}

// ON12: proyección de la fila durable que necesita la hidratación del wizard.
// La fila completa de membresías extiende esta interfaz en rehidratar-membresia.
export interface DatosOnboardingPersistidos {
  googleSub: string;
  tenantId: string;
  wizardCompletado: boolean;
  wizardPaso: number;
  // TB-165 [tenant]: columna nueva de la 0050; opcional para filas viejas.
  wizardRespuestas?: Record<string, string> | null;
}

export function estadoInicial(userId: string, tenantId: string, ahora = new Date()): OnboardingState {
  return {
    userId,
    tenantId,
    tourVersion: "v1",
    tourUltimoPaso: 0,
    tourEstado: "no_iniciado",
    checklistOculta: false,
    pasosSaltados: [],
    videoVisto: false,
    videoProgreso: 0,
    pwaSugerenciaVistaAt: null,
    pwaSugerenciaDescartes: 0,
    pwaInstalada: false,
    wizardPaso: 0,
    wizardCompletado: false,
    wizardEmpleados: [],
    wizardRespuestas: {},
    actualizadoAt: ahora.toISOString(),
  };
}

export interface EjemploInfo {
  tenantDemoId: string;
  tenantRealId: string;
  rubro: string;
  creadoAt: string;
  expiraAt: string;
}

export function claveBienvenida(tenantId: string, numero: string): string {
  return `${tenantId}:${numero}`;
}
