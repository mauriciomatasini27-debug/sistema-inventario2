// TB-165: seam del flujo de onboarding. Dos adapters: memoria (tests, sin DB
// ni process.env) y control (el Map compartido de store.ts en producción).
// TB-165: la DB es espejo durable write-through de ON12 (persistirOnboarding +
// rehidratar-membresia), así que acá solo se abstrae la fuente de verdad en memoria.
import { control } from "../../lib/store.js";
import { claveOnboarding, estadoInicial, type OnboardingState } from "./estado.js";

export interface PersistenciaOnboarding {
  leer(userId: string, tenantId: string): OnboardingState;
  guardar(estado: OnboardingState): void;
}

export function crearPersistenciaOnboardingMemoria(): {
  readonly persistencia: PersistenciaOnboarding;
  readonly estados: ReadonlyMap<string, OnboardingState>;
} {
  const estados = new Map<string, OnboardingState>();
  const persistencia: PersistenciaOnboarding = {
    leer(userId, tenantId) {
      return estados.get(claveOnboarding(userId, tenantId)) ?? estadoInicial(userId, tenantId);
    },
    guardar(estado) {
      estados.set(claveOnboarding(estado.userId, estado.tenantId), estado);
    },
  };
  return { persistencia, estados };
}

export function crearPersistenciaOnboardingControl(): PersistenciaOnboarding {
  return {
    leer(userId, tenantId) {
      return control.onboardingState.get(claveOnboarding(userId, tenantId)) ?? estadoInicial(userId, tenantId);
    },
    guardar(estado) {
      control.onboardingState.set(claveOnboarding(estado.userId, estado.tenantId), estado);
    },
  };
}
