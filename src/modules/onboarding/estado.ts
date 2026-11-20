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
  actualizadoAt: string;
}

export function claveOnboarding(userId: string, tenantId: string): string {
  return `${userId}:${tenantId}`;
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
