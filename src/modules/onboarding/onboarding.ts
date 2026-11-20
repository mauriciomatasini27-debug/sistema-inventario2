// TB-165: dueño del flujo de onboarding. Todas las transiciones de OnboardingState
// (tour, checklist, video, wizard) pasan por acá; las rutas son shims HTTP
// que solo resuelven sesión/tenant y pasan un snapshot de conteos.
// TB-165: seam PersistenciaOnboarding (memoria en tests, control en producción).
import { type OnboardingState, type TourEstado } from "./estado.js";
import {
  crearPersistenciaOnboardingControl,
  type PersistenciaOnboarding,
} from "./persistencia.js";
import { calcular_checklist, type DatosChecklist } from "./checklist.js";
import { registrar_progreso } from "./video.js";
import {
  PASOS_WIZARD,
  esCompleto,
  marcarCompletado,
  retomar,
  type WizardState,
} from "./wizard.js";

export type FotoComercio = DatosChecklist;
export type AccionChecklist = "saltar" | "retomar" | "ocultar" | "mostrar";
export type EventoVideo = "inicio" | "mitad" | "fin";

type PersistenciaOpcional = PersistenciaOnboarding | undefined;

// TB-165: userId, tenantId y la persistencia viajan juntos en las transiciones
// internas; un solo contexto evita repetir la tupla en cada helper. La API
// pública sigue explícita porque es el límite con las rutas HTTP.
interface ContextoOnboarding {
  userId: string;
  tenantId: string;
  persistencia?: PersistenciaOpcional;
}

function persistenciaEfectiva(ctx: ContextoOnboarding): PersistenciaOnboarding {
  return ctx.persistencia ?? crearPersistenciaOnboardingControl();
}

// TB-165: guardar a partir de un estado ya leído evita el doble read en
// transiciones que necesitan el previo para calcular el patch.
function guardar(
  previo: OnboardingState,
  patch: Partial<OnboardingState>,
  persistencia: PersistenciaOnboarding,
): OnboardingState {
  const next: OnboardingState = {
    ...previo,
    ...patch,
    actualizadoAt: new Date().toISOString(),
  };
  persistencia.guardar(next);
  return next;
}

function actualizar(ctx: ContextoOnboarding, patch: Partial<OnboardingState>): OnboardingState {
  const p = persistenciaEfectiva(ctx);
  return guardar(p.leer(ctx.userId, ctx.tenantId), patch, p);
}

// TB-165: lectura pura para que un GET no mute el estado del comercio.
export function leerOnboarding(
  userId: string,
  tenantId: string,
  persistencia?: PersistenciaOnboarding,
): OnboardingState {
  return persistenciaEfectiva({ userId, tenantId, persistencia }).leer(userId, tenantId);
}

export function marcarTourPaso(
  userId: string,
  tenantId: string,
  paso: number,
  estado: TourEstado,
  persistencia?: PersistenciaOnboarding,
): OnboardingState {
  return actualizar({ userId, tenantId, persistencia }, { tourUltimoPaso: paso, tourEstado: estado });
}

export function accionChecklist(
  userId: string,
  tenantId: string,
  accion: AccionChecklist,
  paso: string | undefined,
  persistencia?: PersistenciaOnboarding,
): OnboardingState {
  const p = persistenciaEfectiva({ userId, tenantId, persistencia });
  const previo = p.leer(userId, tenantId);
  let patch: Partial<OnboardingState> = {};
  if (accion === "saltar" && paso && !previo.pasosSaltados.includes(paso)) {
    patch = { pasosSaltados: [...previo.pasosSaltados, paso] };
  } else if (accion === "retomar" && paso) {
    patch = { pasosSaltados: previo.pasosSaltados.filter((p) => p !== paso) };
  } else if (accion === "ocultar") {
    patch = { checklistOculta: true };
  } else if (accion === "mostrar") {
    patch = { checklistOculta: false };
  }
  return guardar(previo, patch, p);
}

export function registrarVideo(
  userId: string,
  tenantId: string,
  progreso: number,
  evento: EventoVideo,
  persistencia?: PersistenciaOnboarding,
): OnboardingState {
  const p = persistenciaEfectiva({ userId, tenantId, persistencia });
  const previo = p.leer(userId, tenantId);
  const avance = registrar_progreso(previo, { progreso, tipo: evento });
  return guardar(previo, avance, p);
}

// TB-165: el puente antes vivía a mano en la ruta completar; concentrarlo acá
// evita que dos callers armen distinto el mismo OnboardingState. El paso del
// wizard se respeta (no se hardcodea) y el estado completo se normaliza al largo.
function completarDesde(
  previo: OnboardingState,
  wizard: WizardState,
  persistencia: PersistenciaOnboarding,
): OnboardingState {
  return guardar(
    previo,
    {
      wizardCompletado: true,
      wizardPaso: esCompleto(wizard) ? PASOS_WIZARD.length : wizard.paso,
      wizardEmpleados: [...wizard.empleados],
    },
    persistencia,
  );
}

export function completarWizard(
  userId: string,
  tenantId: string,
  wizard: WizardState,
  persistencia?: PersistenciaOnboarding,
): OnboardingState {
  const p = persistenciaEfectiva({ userId, tenantId, persistencia });
  return completarDesde(p.leer(userId, tenantId), wizard, p);
}

// TB-165: la ruta solo conoce empleados; el dueño arma el WizardState con sus
// propias transiciones y hace el puente, sin estados sintéticos en la capa HTTP.
export function completarWizardConEmpleados(
  userId: string,
  tenantId: string,
  empleados: readonly string[] | undefined,
  persistencia?: PersistenciaOnboarding,
): OnboardingState {
  const p = persistenciaEfectiva({ userId, tenantId, persistencia });
  const previo = p.leer(userId, tenantId);
  const wizard = marcarCompletado(
    retomar(previo.wizardPaso, {}, [...(empleados ?? previo.wizardEmpleados)], []),
  );
  return completarDesde(previo, wizard, p);
}

export function calcularChecklist(
  estado: OnboardingState,
  foto: FotoComercio,
): {
  pasos: ReturnType<typeof calcular_checklist>["pasos"];
  listos: number;
  total: number;
  oculta: boolean;
} {
  const { pasos, listos, total } = calcular_checklist(foto);
  return { pasos, listos, total, oculta: estado.checklistOculta };
}
