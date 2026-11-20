// TB-165: seam del flujo de onboarding. Dos adapters: memoria (tests, sin DB
// ni process.env) y control (el Map compartido de store.ts en producción).
// TB-165: la DB es espejo durable write-through de ON12 (persistirOnboarding +
// rehidratar-membresia), así que acá solo se abstrae la fuente de verdad en memoria.
import { control } from "../../lib/store.js";
import {
  claveOnboarding,
  estadoInicial,
  type DatosOnboardingPersistidos,
  type OnboardingState,
} from "./estado.js";

export interface PersistenciaOnboarding {
  leer(userId: string, tenantId: string): OnboardingState;
  guardar(estado: OnboardingState): void;
}

// TB-165: ambos adapters comparten la misma lógica; sólo cambia el Map que
// usan como fuente de verdad. Extraer el factory evita dos copias del par
// leer/guardar y deja el formato de clave en un solo lugar.
function crearPersistenciaConMapa(estados: Map<string, OnboardingState>): PersistenciaOnboarding {
  return {
    leer(userId, tenantId) {
      return estados.get(claveOnboarding(userId, tenantId)) ?? estadoInicial(userId, tenantId);
    },
    guardar(estado) {
      estados.set(claveOnboarding(estado.userId, estado.tenantId), estado);
    },
  };
}

export function crearPersistenciaOnboardingMemoria(): {
  readonly persistencia: PersistenciaOnboarding;
  readonly estados: ReadonlyMap<string, OnboardingState>;
} {
  const estados = new Map<string, OnboardingState>();
  return { persistencia: crearPersistenciaConMapa(estados), estados };
}

export function crearPersistenciaOnboardingControl(): PersistenciaOnboarding {
  return crearPersistenciaConMapa(control.onboardingState);
}

// ON12: el módulo dueño del onboarding también posee la hidratación del espejo
// durable. Así rehidratar-membresia no necesita conocer claves ni estados del
// wizard: sólo pasa la fila que leyó de la base.
export function hidratarOnboardingDesdeDb(fila: DatosOnboardingPersistidos): void {
  const clave = claveOnboarding(fila.googleSub, fila.tenantId);
  const previo = control.onboardingState.get(clave);
  // ON12: completar el wizard es monótono. Si la memoria ya dice "completo",
  // gana —el espejo pudo fallar y la DB quedó atrás—; si quedó en el default,
  // la DB lo rellena. Así se preserva la memoria como fuente de verdad.
  control.onboardingState.set(clave, {
    ...(previo ?? estadoInicial(fila.googleSub, fila.tenantId)),
    wizardCompletado: (previo?.wizardCompletado ?? false) || fila.wizardCompletado,
    wizardPaso: Math.max(previo?.wizardPaso ?? 0, fila.wizardPaso),
  });
}
